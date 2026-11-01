// The live run: the golden cases through the real /api/extract and /api/ask route handlers,
// so the prompts, the schema, the value checks and the context building are the deployed
// ones, and every model call goes through src/lib/anthropic.ts. Only two things are stood in
// for: the signed-in member (resolveMember) and the database, which serves the synthetic
// rows in cases/store.json and applies the route's own store_id and voided_at filters.
//
// It spends the store's API key, so it refuses to run in CI and refuses to run without a
// key. --offline swaps the network for the hand-written samples, which checks the plumbing
// (routes load, prompts build, scorers score) at no cost and with no key.

import fs from "fs";
import path from "path";
import Module from "module";
import { NextRequest } from "next/server";
import { loadEnvConfig } from "@next/env";
import { scoreExtract, scoreAsk, scorePrompt, expandPhrases, type Check, type Score, type RouteOutput } from "./score";
import { renderPdf } from "./pdf";

// Compiled to out/live/scripts/aievals-check/live.js; the app code lands in out/live/src.
const OUT = path.resolve(__dirname, "../..");
const SRC = path.join(OUT, "src");
const HERE = path.resolve(OUT, "../..");
const REPO = path.resolve(HERE, "../..");

// Anything it does not recognise stops the run before it spends anything: a misspelled
// --offline must not turn into a live run, and --runs=1 must not quietly run three times.
const args = process.argv.slice(2);
const usage = "Options: --offline, --runs N, --only TEXT (a space before the value, not =).";
const takesValue = new Set(["--runs", "--only"]);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--offline") continue;
  if (!takesValue.has(args[i])) {
    console.error(`Unknown option "${args[i]}". ${usage}`);
    process.exit(1);
  }
  if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
    console.error(`${args[i]} needs a value. ${usage}`);
    process.exit(1);
  }
  i++;
}
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const OFFLINE = args.includes("--offline");
const runsArg = option("--runs");
if (runsArg !== undefined && !/^[1-9]\d*$/.test(runsArg)) {
  console.error(`--runs needs a whole number above zero, got "${runsArg}".`);
  process.exit(1);
}
const RUNS = Number(runsArg ?? 3);
const ONLY = option("--only");

if (process.env.CI) {
  console.log("Skipped: the live evals spend the store's API key and never run in CI.");
  process.exit(0);
}

// The same files `next dev` reads, so a working local setup needs nothing extra. Then every
// database setting is dropped: this run talks to the model and to nothing else.
loadEnvConfig(REPO);
for (const k of Object.keys(process.env)) if (k.includes("SUPABASE")) delete process.env[k];
if (OFFLINE) {
  process.env.ANTHROPIC_API_KEY = "offline"; // never sent: fetch is replaced below
} else if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Put it in .env.local (the file `npm run dev` uses) or the shell, or run with --offline to check the plumbing for free.");
  process.exit(1);
}

// The routes import "@/lib/..."; tsc leaves those specifiers alone, so map them here.
const M = Module as any;
const resolveFilename = M._resolveFilename;
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(SRC, request.slice(2)) : request, ...rest);
};

// ---------- the network ----------

// Only the Anthropic API is reachable. Anything else (the database client, above all) is
// refused outright rather than allowed to wander off to a real service.
type Sent = { system: string; text: string };
let sent: Sent | null = null;
let canned = "";
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (!url.startsWith("https://api.anthropic.com/")) throw new Error(`the eval run refused a request to ${url}`);
  calls++;
  const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
  const text = (body.messages || [])
    .flatMap((m: any) => (typeof m.content === "string" ? [m.content] : (m.content || []).filter((p: any) => p.type === "text").map((p: any) => p.text)))
    .join("\n");
  // system is a string, or text blocks when part of it is cached.
  const system = typeof body.system === "string" ? body.system : (body.system || []).map((b: any) => b?.text ?? "").join("\n");
  sent = { system, text };
  if (!OFFLINE) return realFetch(input, init);
  return new Response(JSON.stringify({ model: "offline", stop_reason: "end_turn", content: [{ type: "text", text: canned }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}) as typeof fetch;

// ---------- the stand-in database and member ----------

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function resolveDates(v: any): any {
  if (typeof v === "string") return v.replace(/\{today([+-]\d+)\}/g, (_, d) => day(Number(d)));
  if (Array.isArray(v)) return v.map(resolveDates);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveDates(x)]));
  return v;
}

// The AI usage log's own bookkeeping (src/lib/aiUsage.ts), which every model call makes.
// Any other RPC is a write the case has to expect: payments only ever move through RPCs.
const BOOKKEEPING = new Set(["ai_call_begin", "ai_call_finish"]);

// The money-free views (supabase/money_by_role.sql) answer from their table with the dollar
// columns gone, as the database does. Ask reads vendor_directory for a role that cannot see money.
const VIEWS: Record<string, { table: string; drop: string[] }> = {
  vendor_directory: { table: "vendor", drop: ["minimum_order_amount", "no_minimum_order"] }
};

function fakeDb(tables: Record<string, any[]>, writes: string[]) {
  const rowsOf = (table: string): any[] => {
    const view = VIEWS[table];
    if (!view) return tables[table] || [];
    return (tables[view.table] || []).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !view.drop.includes(k))));
  };
  const from = (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    let inserted: any = null;
    let single = false;
    const builder: any = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), q),
      is: (col: string, val: unknown) => (filters.push((r) => (r[col] ?? null) === val), q),
      limit: () => q,
      order: () => q,
      maybeSingle: () => ((single = true), q),
      single: () => ((single = true), q),
      insert: (row: any) => {
        writes.push(table);
        inserted = { id: `eval-${table}-${writes.length}`, ...row };
        return q;
      },
      update: () => (writes.push(table), q),
      upsert: () => (writes.push(table), q),
      delete: () => (writes.push(table), q),
      then: (ok: any, bad: any) => {
        const rows = inserted ? [inserted] : rowsOf(table).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(ok, bad);
      }
    };
    // A query method this stand-in does not know throws and names itself, at any point in
    // the chain, rather than being skipped: a filter that was silently ignored would hand
    // the route every row. The route reports the throw as a 500, so the case fails on
    // "answered" with this message. Add the method here when a route starts using it.
    const q: any = new Proxy(builder, {
      get(target, prop) {
        if (prop in target || typeof prop !== "string") return target[prop as any];
        return () => {
          throw new Error(`the stand-in database in scripts/aievals-check/live.ts does not implement .${prop}() (on ${table}); add it to fakeDb`);
        };
      }
    });
    return q;
  };
  const rpc = (fn: string) => {
    if (!BOOKKEEPING.has(fn)) writes.push(`rpc:${fn}`);
    const p: any = Promise.resolve({ data: null, error: null });
    p.abortSignal = () => p;
    return p;
  };
  return { from, rpc };
}

const serverMember = require(path.join(SRC, "lib/serverMember.js"));
let current: { db: unknown; member: { id: string; store_id: string; role: string } } | null = null;
const standIn = async () => (current ? { ok: true, client: current.db, member: current.member } : { ok: false, status: 500, message: "no member set" });
serverMember.resolveMember = standIn;
if (serverMember.resolveMember !== standIn) throw new Error("could not stand in for resolveMember; this harness needs updating");

type Route = { POST: (req: NextRequest) => Promise<Response> };
const extractRoute: Route = require(path.join(SRC, "app/api/extract/route.js"));
const askRoute: Route = require(path.join(SRC, "app/api/ask/route.js"));
const { claudeModel } = require(path.join(SRC, "lib/anthropic.js"));

async function post(route: Route, url: string, payload: unknown): Promise<RouteOutput> {
  // The routes log one metadata line per call; keep the eval's own output readable.
  const log = console.log;
  const warn = console.warn;
  console.log = console.warn = () => {};
  try {
    const res = await route.POST(new NextRequest(url, { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }));
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

// ---------- the run ----------

const read = (p: string) => JSON.parse(fs.readFileSync(path.join(HERE, p), "utf8"));
const extractCases: any[] = read("cases/extract.json").cases;
const askFile = read("cases/ask.json");
const store = read("cases/store.json");
const samples: any[] = [...read("samples/extract.json").samples, ...read("samples/ask.json").samples];
const idealFor = (id: string) => samples.find((s) => s.case === id && s.expect === "pass");

// gap: a case written for a defect that is known and not fixed yet (knownGap in the case
// file). It is expected to fail every run and does not fail the run while it does; once it
// passes, the run fails until somebody deletes knownGap, so a fix never goes unrecorded.
type Job = { id: string; gap?: string; run: () => Promise<Score> };
const results: { case: string; output: RouteOutput; writes?: string[] }[] = [];
const jobs: Job[] = [];

const docs = path.join(OUT, "docs");
fs.mkdirSync(docs, { recursive: true });
for (const c of extractCases) {
  jobs.push({
    id: c.id,
    gap: c.knownGap,
    run: async () => {
      const pdf = renderPdf(c.document);
      fs.writeFileSync(path.join(docs, `${c.id}.pdf`), pdf);
      const { warnings, model, ...answer } = idealFor(c.id).body;
      canned = JSON.stringify(answer);
      current = { db: fakeDb({}, []), member: { id: "eval-staff", store_id: store.store_id, role: "staff" } };
      const out = await post(extractRoute, "http://localhost/api/extract", { imageBase64: pdf.toString("base64"), mediaType: "application/pdf" });
      results.push({ case: c.id, output: out });
      return scoreExtract(c.expect, out);
    }
  });
}
for (const c of askFile.cases) {
  jobs.push({
    id: c.id,
    gap: c.knownGap,
    run: async () => {
      const writes: string[] = [];
      canned = idealFor(c.id).body.answer;
      current = { db: fakeDb(resolveDates(store.tables), writes), member: { id: `eval-${c.role}`, store_id: store.store_id, role: c.role } };
      sent = null;
      const out = await post(askRoute, "http://localhost/api/ask", { question: c.question, store_id: store.store_id });
      results.push({ case: c.id, output: out, writes });
      const answer = scoreAsk(expandPhrases(c.expect, askFile.phrases), out, writes);
      if (!c.prompt) return answer;
      // Assigned inside fetch during the await above, which narrowing cannot see.
      const captured = sent as Sent | null;
      const prompt: Score = captured
        ? scorePrompt(c.prompt, `${captured.system}\n${captured.text}`)
        : { pass: false, checks: [{ name: "prompt captured", pass: false, detail: "the route answered without calling the model" }] };
      return { pass: answer.pass && prompt.pass, checks: [...answer.checks, ...prompt.checks] };
    }
  });
}

const selected = jobs.filter((j) => !ONLY || j.id.includes(ONLY));
if (!selected.length) {
  console.error(`No case id contains "${ONLY}".`);
  process.exit(1);
}

async function main() {
  console.log(
    `${OFFLINE ? "Offline plumbing check (no model calls)" : `Live run against ${claudeModel()}`}: ` +
      `${selected.length} cases x ${RUNS} runs = ${selected.length * RUNS} ${OFFLINE ? "routed calls" : "model calls"}.\n`
  );
  const width = Math.max(...selected.map((j) => j.id.length));
  let casesPassing = 0;
  let runsPassing = 0;
  let gapsHeld = 0;
  let gapsPassed = 0;
  for (const job of selected) {
    let passed = 0;
    const misses = new Map<string, number>();
    for (let r = 0; r < RUNS; r++) {
      let score: Score;
      try {
        score = await job.run();
      } catch (err: any) {
        score = { pass: false, checks: [{ name: "harness", pass: false, detail: String(err?.message || err) }] };
      }
      if (score.pass) passed++;
      for (const c of score.checks.filter((x: Check) => !x.pass)) {
        const key = c.name + (c.detail ? ` (${c.detail})` : "");
        misses.set(key, (misses.get(key) || 0) + 1);
      }
    }
    const rate = `${passed}/${RUNS}`.padStart(5) + `${Math.round((passed / RUNS) * 100)}%`.padStart(6);
    if (job.gap) {
      if (passed === 0) gapsHeld++;
      else gapsPassed++;
      console.log(`${passed === 0 ? "GAP " : "FIXED?"}  ${job.id.padEnd(width)}  ${rate}`);
      console.log(
        passed === 0
          ? `        known gap, expected to fail: ${job.gap}`
          : "        passed while marked as a known gap: if the fix has landed, delete knownGap from the case"
      );
    } else {
      runsPassing += passed;
      if (passed === RUNS) casesPassing++;
      console.log(`${passed === RUNS ? "PASS" : "FAIL"}  ${job.id.padEnd(width)}  ${rate}`);
    }
    for (const [miss, n] of misses) console.log(`        ${miss}${RUNS > 1 ? `  x${n}` : ""}`);
  }

  const file = path.join(OUT, `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ model: OFFLINE ? "offline" : claudeModel(), runs: RUNS, results }, null, 2));
  const counted = selected.filter((j) => !j.gap).length;
  const total = counted * RUNS;
  const gaps = gapsHeld + gapsPassed;
  console.log(
    `\n${casesPassing} of ${counted} cases passed every run; ${runsPassing} of ${total} runs passed (${total ? Math.round((runsPassing / total) * 100) : 0}%).` +
      (gaps ? `\n${gapsHeld} of ${gaps} known gaps still fail as expected, not counted above.` : "") +
      `\n${calls} ${OFFLINE ? "routed" : "model"} calls. Answers saved to ${path.relative(REPO, file)}` +
      `\nInvoices sent are in ${path.relative(REPO, docs)}`
  );
  process.exit(casesPassing === counted && gapsPassed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
