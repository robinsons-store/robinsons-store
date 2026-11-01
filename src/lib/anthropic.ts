// One door to the Anthropic Messages API for every AI route.
//
// Before this, each route made its own fetch with no timeout and no retry, and three of the
// four read the first text block without looking at stop_reason. A stalled call held the
// screen until Vercel killed the function, an overloaded API (429/529) failed on the first
// try, and a refusal or a cut-off answer reached the person as an empty or half sentence.
// Raw provider text also reached the screens, including the capture screen a seasonal
// employee uses at the receiving door.
//
// The env is read at call time, never at import, so the build still passes with a blank env.
// No temperature or other sampling parameter is sent: current Claude models reject
// non-default sampling params, and one rejected parameter would fail every call.

import { finishAiCall, reserveAiCall, type AiUsageScope } from "./aiUsage";

export type ClaudeFailure =
  | "no_key"
  | "timeout"
  | "overloaded"
  | "refusal"
  | "max_tokens"
  | "bad_request"
  | "upstream"
  | "capped"
  | "config";

export type ClaudeResult =
  | {
      ok: true;
      text: string;
      stopReason: string;
      model: string;
      ms: number;
      usage: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null;
    }
  | { ok: false; kind: ClaudeFailure; detail: string; model: string; ms: number };

type CallOptions = {
  // Names the call in the logs and the ai_call row. What each route sends, and where, is in
  // docs/PLATFORM.md ("What leaves Canada"); a new route adds its row there.
  route: string;
  // A string, or text blocks when part of it carries cache_control (see /api/ask).
  system?: string | unknown[];
  messages: unknown[];
  max_tokens: number;
  output_config?: unknown;
  timeoutMs?: number;
  // The caller's database client and store, for the ai_call log and the daily cap
  // (src/lib/aiUsage.ts). Required so a route cannot drop it without tsc noticing; null,
  // the call is neither logged nor capped.
  scope: AiUsageScope | null;
  // When the reservation, every attempt and every retry must be over (epoch ms). Writing the
  // usage row afterwards has its own 1.5 second limit (aiUsage.ts). A route that does work
  // before the call can pass its request start plus its budget; otherwise it is
  // DEFAULT_DEADLINE_MS from entry, under the 60 second maxDuration with room for the route.
  deadline?: number;
  // Test seams: fake timers do not drive AbortSignal.timeout, so the check injects these.
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

// 429 is rate limited, 529 is overloaded, the 5xx are transient on the API side. A 400 or
// 401 will fail the same way every time, so retrying it only makes the person wait longer.
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
const BACKOFF_MS = [500, 1500];
export const DEFAULT_DEADLINE_MS = 50_000;
// Not worth starting an attempt with less than this left: a real answer takes longer, and a
// call cut off by the platform reaches the screen as a page instead of plain words.
const MIN_ATTEMPT_MS = 8_000;

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const jitterSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms + Math.floor(Math.random() * 250)));

// retry-after is seconds or an HTTP date. Unreadable or absent is 0, which leaves the backoff.
function retryAfterMs(resp: Response, now: number): number {
  const v = resp.headers?.get?.("retry-after");
  if (!v) return 0;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

export async function callClaude(opts: CallOptions): Promise<ClaudeResult> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? jitterSleep;
  const deadline = opts.deadline ?? now() + DEFAULT_DEADLINE_MS;
  const model = claudeModel();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, kind: "no_key", detail: "ANTHROPIC_API_KEY is not set", model, ms: 0 };
  const slot = await reserveAiCall(opts.scope, opts.route, model);
  if (slot.capped) {
    const capped: ClaudeResult = { ok: false, kind: "capped", detail: "daily cap reached", model, ms: 0 };
    logCall(opts.route, capped);
    return capped;
  }
  // Started after the reservation, so ms is the model's time and not the database's.
  const started = now();

  const body = JSON.stringify({
    model,
    max_tokens: opts.max_tokens,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.output_config ? { output_config: opts.output_config } : {}),
    messages: opts.messages
  });

  let last: { kind: ClaudeFailure; detail: string } = { kind: "timeout", detail: "no time left to call" };
  // How long to wait before the next attempt; set by the failure that asked for a retry.
  let wait = 0;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) {
      // A retry only when the wait and a useful attempt both fit before the deadline.
      if (deadline - now() - wait < MIN_ATTEMPT_MS) break;
      await sleep(wait);
    }
    const left = deadline - now();
    if (left <= 0) break;
    const attemptMs = Math.min(opts.timeoutMs ?? 25000, left);
    let resp: Response;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body,
        signal: AbortSignal.timeout(attemptMs)
      });
    } catch (err: any) {
      // A timeout is not retried: the person has already waited the whole budget, and a
      // second full wait would outlast the function's maxDuration anyway.
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        last = { kind: "timeout", detail: `no answer within ${attemptMs} ms` };
        break;
      }
      last = { kind: "upstream", detail: String(err?.message || err).slice(0, 300) };
      wait = BACKOFF_MS[attempt] ?? 0;
      continue;
    }

    if (!resp.ok) {
      const detail = (await resp.text().catch(() => "")).slice(0, 300);
      if (RETRYABLE.has(resp.status)) {
        const busy = resp.status === 429 || resp.status === 529;
        last = { kind: busy ? "overloaded" : "upstream", detail: `${resp.status} ${detail}` };
        // The API says how long to stay away; waiting less only earns another refusal.
        wait = Math.max(BACKOFF_MS[attempt] ?? 0, busy ? retryAfterMs(resp, now()) : 0);
        continue;
      }
      // A 404 not_found_error is a model name the API does not know: a setting to fix, not a
      // moment to try again. No allow-list here, so ANTHROPIC_MODEL stays changeable.
      last = {
        kind: resp.status === 404 && detail.includes("not_found_error") ? "config" : "bad_request",
        detail: `${resp.status} ${detail}`
      };
      break;
    }

    // The model has already run and billed by now, so an unreadable body is a failure, not a
    // retry: a second attempt would pay twice. Read here rather than thrown, the reserved
    // ai_call row is still finished below.
    let data: any;
    try {
      data = await resp.json();
    } catch (err: any) {
      last =
        err?.name === "TimeoutError" || err?.name === "AbortError"
          ? { kind: "timeout", detail: "answer body not received in time" }
          : { kind: "upstream", detail: "answer was not JSON" };
      break;
    }
    const ms = now() - started;
    // A refusal and a cut-off both arrive as HTTP 200, so they have to be read from
    // stop_reason rather than the status code.
    const textPart = (data.content || []).find((c: any) => c.type === "text");
    const result: ClaudeResult =
      data.stop_reason === "refusal" || data.stop_reason === "max_tokens"
        ? { ok: false, kind: data.stop_reason, detail: `stop_reason ${data.stop_reason}`, model, ms }
        : {
            ok: true,
            text: textPart?.text || "",
            stopReason: data.stop_reason || "",
            model: data.model || model,
            ms,
            usage: data.usage || null
          };
    logCall(opts.route, result);
    await finishAiCall(opts.scope, slot.id, opts.route, result, data.usage);
    return result;
  }

  const failed: ClaudeResult = { ok: false, ...last, model, ms: now() - started };
  logCall(opts.route, failed);
  await finishAiCall(opts.scope, slot.id, opts.route, failed, null);
  return failed;
}

// Metadata only, to the function log: never the prompt, the store data, or the answer.
// The raw provider detail lands here instead of on a screen.
function logCall(route: string, r: ClaudeResult) {
  const base = { ai_call: route, model: r.model, ms: r.ms };
  if (r.ok) {
    console.log(JSON.stringify({ ...base, outcome: "ok", stop_reason: r.stopReason, ...r.usage }));
  } else {
    console.warn(JSON.stringify({ ...base, outcome: r.kind, detail: r.detail }));
  }
}

// The words a person sees for each failure. Plain, no em dashes, and always a next step.
export function failureMessage(kind: ClaudeFailure): string {
  switch (kind) {
    case "no_key":
      return "The AI helper is off. Tell the owner.";
    case "timeout":
      return "The AI helper took too long to answer. Try again in a minute.";
    case "overloaded":
      return "The AI helper is busy right now. Try again in a minute.";
    case "refusal":
      return "The AI helper would not answer this one. Try rewording it, or tell the owner.";
    case "max_tokens":
      return "The answer was too long to finish. Ask a narrower question.";
    case "config":
      return "The AI helper is set up wrong. Tell the owner to check the AI model setting.";
    case "capped":
      return "The AI helper has used today's limit for this store and starts again tomorrow. If it is needed sooner, the owner can raise the limit in Vercel and redeploy.";
    case "bad_request":
    case "upstream":
    default:
      return "The AI helper could not answer just now. Try again, and tell the owner if it keeps happening.";
  }
}
