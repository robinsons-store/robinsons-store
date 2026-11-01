// The ai_call log and the daily cap, run through the real callClaude, and through the real
// Ask route, with fetch and the Supabase client both mocked. No network, no database, no
// model call. The lock that keeps parallel calls under the cap lives in SQL and is checked in
// pg/ instead.
const Module = require("module");
const path = require("path");

// The compiled route still says require("@/lib/..."); point that at this folder.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolve.call(this, request.startsWith("@/") ? path.join(__dirname, request.slice(2)) : request, ...rest);
};

const { callClaude, failureMessage } = require("./lib/anthropic.js");
const { dailyCap, DEFAULT_DAILY_CAP, MAX_DAILY_CAP, outcomeOf } = require("./lib/aiUsage.js");

// AbortSignal.timeout does not hold the event loop open, so without this the hung-database
// case lets node drain and exit 0 halfway through. A run that never reaches the summary fails.
process.exitCode = 1;
const keepAlive = setInterval(() => {}, 1000);

let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };

// Quiet the client's own metadata log, but keep it so the warnings can be asserted.
const logged = [];
console.warn = (s) => logged.push(String(s));
const realLog = console.log;
console.log = (s, ...rest) => (String(s).startsWith("{") ? logged.push(String(s)) : realLog(s, ...rest));

let fetchCalls = 0;
let responder = () => ok();
global.fetch = async (_url, init) => { fetchCalls++; return responder(init); };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const USAGE = { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50 };
const ANSWER = "Orgill is due Friday.";
const ok = () => reply(200, { model: "claude-sonnet-5", stop_reason: "end_turn", content: [{ type: "text", text: ANSWER }], usage: USAGE });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mimics supabase-js rpc(...).abortSignal(s), awaited for { data, error }, and the two
// functions' contracts: ai_call_begin answers {allowed, id} from how many calls the store has
// used against p_cap; ai_call_finish takes the id and the outcome. from() serves the Ask
// route's reads and the feedback insert it makes for "log this issue".
function fakeDb({ used = 0, beginError = null, finishError = null, hang = false, beginDelayMs = 0 } = {}) {
  const db = { begins: [], finishes: [], inserts: [], used };
  const settle = (value, delay = 0) => ({
    abortSignal: (signal) =>
      hang
        ? new Promise((_res, rej) => signal.addEventListener("abort", () => rej(signal.reason)))
        : sleep(delay).then(() => value)
  });
  db.rpc = (fn, args) => {
    if (fn === "ai_call_begin") {
      db.begins.push(args);
      if (beginError) return settle({ data: null, error: beginError });
      if (db.used >= args.p_cap) return settle({ data: { allowed: false, id: null }, error: null });
      db.used++;
      return settle({ data: { allowed: true, id: `call-${db.used}` }, error: null }, beginDelayMs);
    }
    if (fn === "ai_call_finish") {
      db.finishes.push(args);
      return settle({ data: null, error: finishError });
    }
    return settle({ data: null, error: { message: `unexpected rpc ${fn}` } });
  };
  db.from = (table) => {
    if (table === "ai_call") throw new Error("aiUsage must not write the table directly");
    let row = null, one = false;
    const q = {
      select: () => q, eq: () => q, is: () => q, limit: () => q, order: () => q,
      maybeSingle: () => ((one = true), q),
      single: () => ((one = true), q),
      insert: (r) => ((row = r), db.inserts.push({ table, row: r }), q),
      then: (res, rej) => Promise.resolve({ data: row ? (one ? { id: `${table}-1` } : null) : one ? null : [], error: null }).then(res, rej)
    };
    return q;
  };
  return db;
}

const PROMPT = "What do we owe Orgill?";
const call = (scope, extra = {}) => callClaude({ route: "ask", max_tokens: 100, messages: [{ role: "user", content: PROMPT }], scope, ...extra });

(async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.AI_DAILY_CAP_PER_STORE;

  // The cap value.
  t("default cap is 100", dailyCap() === 100 && DEFAULT_DAILY_CAP === 100);
  process.env.AI_DAILY_CAP_PER_STORE = "25";
  t("env sets the cap", dailyCap() === 25);
  for (const bad of ["0", "-3", "abc", "2.5", ""]) {
    process.env.AI_DAILY_CAP_PER_STORE = bad;
    t(`env "${bad}" falls back to the default`, dailyCap() === DEFAULT_DAILY_CAP);
  }
  process.env.AI_DAILY_CAP_PER_STORE = "10000000000";
  t("env above the Postgres integer range comes back as the ceiling", dailyCap() === MAX_DAILY_CAP && MAX_DAILY_CAP === 100000);
  delete process.env.AI_DAILY_CAP_PER_STORE;

  // No scope: the call runs exactly as before, with no database involved.
  fetchCalls = 0;
  let r = await call(null);
  t("no scope: call made, answer returned", r.ok && r.text === ANSWER && fetchCalls === 1);

  // Under the cap: reserved first, called, then finished with metadata only.
  let db = fakeDb({ used: 5 });
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("under cap: model called once", r.ok && fetchCalls === 1);
  const b = db.begins[0] || {};
  t("under cap: reserved for this store, route, model and cap", db.begins.length === 1 && b.p_store_id === "store-1" && b.p_route === "ask" && b.p_model === "claude-sonnet-5" && b.p_cap === 100);
  const f = db.finishes[0] || {};
  t("finished once, on the reserved row", db.finishes.length === 1 && f.p_id === "call-6");
  t("finish: outcome, model, no failure kind", f.p_outcome === "ok" && f.p_model === "claude-sonnet-5" && f.p_failure_kind === null);
  t("finish: all four token counts", f.p_input_tokens === 1200 && f.p_output_tokens === 300 && f.p_cache_read_tokens === 1000 && f.p_cache_write_tokens === 50);
  t("finish: duration is a number", typeof f.p_duration_ms === "number");
  const keys = Object.keys(f).sort().join(",");
  t("finish carries metadata only", keys === "p_cache_read_tokens,p_cache_write_tokens,p_duration_ms,p_failure_kind,p_id,p_input_tokens,p_model,p_outcome,p_output_tokens", keys);
  const sent = JSON.stringify([db.begins, db.finishes]);
  t("database never sees the prompt or the answer", !sent.includes(PROMPT) && !sent.includes(ANSWER));
  r = await call({ db: fakeDb({ beginDelayMs: 400 }), storeId: "store-1" });
  t("duration is the model's time, not the reservation's", r.ok && r.ms < 400, `${r.ms} ms`);

  // At the cap: no model call, nothing to finish, a plain message.
  db = fakeDb({ used: 100 });
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("at cap: no model call", fetchCalls === 0);
  t("at cap: result is capped", !r.ok && r.kind === "capped");
  t("at cap: nothing finished (begin already wrote the capped row)", db.finishes.length === 0);
  const msg = failureMessage("capped");
  t("capped message says when it resets and how the limit changes", /tomorrow/.test(msg) && /owner/.test(msg) && /Vercel/.test(msg) && /redeploy/.test(msg), msg);
  const words = ["no_key", "capped"].map(failureMessage).join(" ");
  t("no failure message sends anyone to a settings screen", !/settings/i.test(words) && !words.includes(String.fromCharCode(0x2014)));

  // The env cap reaches the database and applies at the boundary.
  process.env.AI_DAILY_CAP_PER_STORE = "3";
  db = fakeDb({ used: 2 });
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("env cap 3, used 2: allowed, cap passed through", r.ok && fetchCalls === 1 && db.begins[0].p_cap === 3);
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("env cap 3, used 3: capped", !r.ok && r.kind === "capped" && fetchCalls === 0);
  delete process.env.AI_DAILY_CAP_PER_STORE;

  // Fails open: a missing function, a refused finish, or a hung database never blocks the call.
  logged.length = 0;
  db = fakeDb({ beginError: { message: "Could not find the function public.ai_call_begin" } });
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("reserve error: call still made", r.ok && fetchCalls === 1);
  t("reserve error: nothing to finish", db.finishes.length === 0);
  t("reserve error: warning logged", logged.some((l) => l.includes("cap_check_skipped")));
  logged.length = 0;
  r = await call({ db: fakeDb({ finishError: { message: "permission denied for function ai_call_finish" } }), storeId: "store-1" });
  t("finish error: answer still returned", r.ok && r.text === ANSWER);
  t("finish error: warning logged", logged.some((l) => l.includes("log_skipped")));
  const started = Date.now();
  fetchCalls = 0;
  r = await call({ db: fakeDb({ hang: true }), storeId: "store-1" });
  const waited = Date.now() - started;
  // A hung reserve returns no id, so there is no finish to wait on: one 1.5s budget.
  t("hung database: gives up and calls anyway", r.ok && fetchCalls === 1 && waited < 2500, `${waited} ms`);

  // Each way a call ends gets its outcome; refusals and cut-offs keep their tokens.
  responder = () => reply(200, { model: "claude-sonnet-5", stop_reason: "refusal", content: [], usage: { input_tokens: 800, output_tokens: 5 } });
  db = fakeDb();
  r = await call({ db, storeId: "store-1" });
  t("refusal: finished as refused with tokens", !r.ok && db.finishes[0]?.p_outcome === "refused" && db.finishes[0]?.p_input_tokens === 800);
  responder = () => reply(200, { model: "claude-sonnet-5", stop_reason: "max_tokens", content: [{ type: "text", text: "half" }], usage: { input_tokens: 900, output_tokens: 100 } });
  db = fakeDb();
  r = await call({ db, storeId: "store-1" });
  t("max_tokens: finished as cut_off with output tokens", !r.ok && db.finishes[0]?.p_outcome === "cut_off" && db.finishes[0]?.p_output_tokens === 100);
  responder = () => reply(400, { error: { message: "bad" } });
  db = fakeDb();
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("400: one failed finish, kind kept, not retried", fetchCalls === 1 && db.finishes.length === 1 && db.finishes[0].p_outcome === "failed" && db.finishes[0].p_failure_kind === "bad_request");
  responder = (init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
  db = fakeDb();
  r = await call({ db, storeId: "store-1" }, { timeoutMs: 50 });
  t("timeout: failed finish, kind timeout", !r.ok && db.finishes[0]?.p_outcome === "failed" && db.finishes[0]?.p_failure_kind === "timeout");
  t("overloaded maps to failed", outcomeOf({ ok: false, kind: "overloaded", detail: "", model: "m", ms: 0 }) === "failed");

  // A 200 whose body cannot be read: already billed, so failed and finished, never retried.
  responder = () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token <")) });
  db = fakeDb();
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("unreadable body: upstream failure, not thrown, not retried", !r.ok && r.kind === "upstream" && fetchCalls === 1);
  t("unreadable body: row finished as failed/upstream", db.finishes.length === 1 && db.finishes[0].p_outcome === "failed" && db.finishes[0].p_failure_kind === "upstream");
  responder = () => ({ ok: true, status: 200, json: () => Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })) });
  db = fakeDb();
  r = await call({ db, storeId: "store-1" });
  t("body timed out mid-download: timeout, row finished", !r.ok && r.kind === "timeout" && db.finishes[0]?.p_failure_kind === "timeout");
  responder = () => ok();

  // Retries, the deadline and Retry-After, with sleep injected so no case waits for real.
  const slept = [];
  const fakeSleep = async (ms) => { slept.push(ms); };
  const busy = (status, headers = {}) => new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "busy" } }), { status, headers: { "content-type": "application/json", ...headers } });
  let queue = [];
  const inOrder = (...rs) => { queue = rs; return () => (queue.shift() || ok)(); };

  fetchCalls = 0;
  responder = inOrder(() => busy(529), ok);
  r = await call(null, { sleep: fakeSleep });
  t("529 then 200: answered after 2 fetches", r.ok && fetchCalls === 2);
  fetchCalls = 0;
  responder = () => busy(529);
  r = await call(null, { sleep: fakeSleep });
  t("529 three times: overloaded after 3 fetches", !r.ok && r.kind === "overloaded" && fetchCalls === 3);

  // The request body: never a sampling parameter (current models reject them), and only the
  // keys the client means to send.
  let sentBody = null;
  responder = (init) => ((sentBody = JSON.parse(init.body)), ok());
  await call(null, { system: "Be brief.", output_config: { format: { type: "json_schema", schema: {} } } });
  const bodyKeys = Object.keys(sentBody || {}).sort().join(",");
  t("request body has no temperature, top_p or top_k", sentBody && !("temperature" in sentBody) && !("top_p" in sentBody) && !("top_k" in sentBody));
  t("request body carries exactly the known keys", bodyKeys === "max_tokens,messages,model,output_config,system", bodyKeys);

  // A 503 at 200 ms with a 300 ms deadline: no time for a useful retry, so one attempt, and
  // the call is over before the deadline.
  fetchCalls = 0;
  responder = () => sleep(200).then(() => busy(503));
  let t0 = Date.now();
  r = await call(null, { deadline: t0 + 300, timeoutMs: 45000 });
  let took = Date.now() - t0;
  t("300 ms deadline, 503 at 200 ms: one attempt, back before the deadline", !r.ok && fetchCalls === 1 && took < 300, `${took} ms`);
  // A hung API: the attempt's own 45 s limit is cut to what is left of the deadline.
  responder = (init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
  t0 = Date.now();
  r = await call(null, { deadline: t0 + 300, timeoutMs: 45000 });
  took = Date.now() - t0;
  t("hung API: attempt cut to the deadline, kind timeout", !r.ok && r.kind === "timeout" && took < 1000, `${took} ms`);
  // Out of time before the first attempt (say a hung database ate it): no call at all.
  fetchCalls = 0;
  r = await call(null, { deadline: Date.now() - 1 });
  t("deadline already passed: no fetch, kind timeout", !r.ok && r.kind === "timeout" && fetchCalls === 0);

  // Retry-After: wait what the API asks, when it fits; otherwise give up at once.
  slept.length = 0;
  fetchCalls = 0;
  responder = inOrder(() => busy(429, { "retry-after": "2" }), ok);
  r = await call(null, { sleep: fakeSleep });
  t("429 retry-after 2: waits at least 2 s, then answers", r.ok && fetchCalls === 2 && slept[0] >= 2000, `slept ${slept.join(",")}`);
  slept.length = 0;
  responder = inOrder(() => busy(529, { "retry-after": "0" }), ok);
  r = await call(null, { sleep: fakeSleep });
  t("retry-after 0 keeps the backoff", r.ok && slept[0] === 500, `slept ${slept.join(",")}`);
  slept.length = 0;
  fetchCalls = 0;
  responder = () => busy(429, { "retry-after": "30" });
  r = await call(null, { sleep: fakeSleep, deadline: Date.now() + 20000 });
  t("retry-after longer than the time left: overloaded at once, no wait", !r.ok && r.kind === "overloaded" && fetchCalls === 1 && slept.length === 0);

  // An HTML page with a 200 (a proxy or an outage page): fixed words, no parser text.
  logged.length = 0;
  fetchCalls = 0;
  responder = () => new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "content-type": "text/html" } });
  r = await call(null);
  const shown = r.ok ? "" : failureMessage(r.kind);
  t("HTML 200: kind upstream, one fetch", !r.ok && r.kind === "upstream" && fetchCalls === 1);
  t("HTML 200: no SyntaxError text in the result, the words or the log", !/Unexpected token|SyntaxError|JSON at position/.test(JSON.stringify(r) + shown + logged.join("")), shown);

  // A model name the API does not know: a setting to fix, not a retry.
  fetchCalls = 0;
  responder = () => new Response(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: claude-sonet-5" } }), { status: 404 });
  r = await call(null, { sleep: fakeSleep });
  t("404 model error: kind config after one fetch", !r.ok && r.kind === "config" && fetchCalls === 1);
  t("config words point at the model setting", /model setting/.test(failureMessage("config")) && !failureMessage("config").includes(String.fromCharCode(0x2014)));
  responder = () => ok();

  // No store, or no key: nothing reserved, nothing finished.
  db = fakeDb({ used: 1000 });
  fetchCalls = 0;
  r = await call({ db, storeId: null });
  t("no store: not reserved, not finished, call made", r.ok && fetchCalls === 1 && db.begins.length === 0 && db.finishes.length === 0);

  // The Ask route, through its real POST handler, with resolveMember stood in for. The route
  // reaches the browser client through payments.ts (it only uses invoiceTotal from there),
  // and building that client needs a WebSocket that Node 20 does not have, so it is stood in
  // for too.
  const browserClient = require.resolve("./lib/supabaseClient.js");
  require.cache[browserClient] = { id: browserClient, filename: browserClient, loaded: true, exports: { supabase: {}, DOCUMENTS_BUCKET: "documents", SUPABASE_CONFIGURED: false } };
  const serverMember = require("./lib/serverMember.js");
  const { NextRequest } = require("next/server");
  let askDb = null;
  const standIn = async () => ({ ok: true, client: askDb, member: { id: "member-1", store_id: "store-1", role: "staff" } });
  serverMember.resolveMember = standIn;
  if (serverMember.resolveMember !== standIn) throw new Error("could not stand in for resolveMember");
  const askRoute = require("./app/api/ask/route.js");
  const ask = async (question) => {
    const res = await askRoute.POST(new NextRequest("http://localhost/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, store_id: "store-from-body" })
    }));
    return { status: res.status, body: await res.json() };
  };
  const LOG_IT = "log this issue: the scale is broken";

  askDb = fakeDb({ used: 100 });
  fetchCalls = 0;
  let res = await ask(LOG_IT);
  t("ask capped, issue logged: 429, says it was logged", res.status === 429 && res.body.error.includes("today's limit") && res.body.error.includes("logged in Suggestions"), res.body.error);
  t("ask capped: no model call, feedback row written", fetchCalls === 0 && askDb.inserts.some((i) => i.table === "feedback"));
  t("ask: reserves against the member's store, not the body's", askDb.begins[0]?.p_store_id === "store-1");
  askDb = fakeDb({ used: 100 });
  res = await ask("When is the Orgill order due?");
  t("ask capped, plain question: 429, nothing about logging", res.status === 429 && !res.body.error.includes("logged"));
  responder = () => reply(200, { model: "claude-sonnet-5", stop_reason: "refusal", content: [], usage: { input_tokens: 800, output_tokens: 5 } });
  askDb = fakeDb();
  res = await ask(LOG_IT);
  t("ask refused, issue logged: 422, still says it was logged", res.status === 422 && res.body.error.includes("logged in Suggestions"));
  responder = () => ok();
  askDb = fakeDb();
  res = await ask("When is the Orgill order due?");
  t("ask under cap: answered, reserved and finished", res.status === 200 && res.body.answer === ANSWER && askDb.begins.length === 1 && askDb.finishes.length === 1);

  delete process.env.ANTHROPIC_API_KEY;
  db = fakeDb();
  fetchCalls = 0;
  r = await call({ db, storeId: "store-1" });
  t("no key: no call, nothing reserved", !r.ok && r.kind === "no_key" && fetchCalls === 0 && db.begins.length === 0 && db.finishes.length === 0);

  clearInterval(keepAlive);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  realLog(`FAIL  the check itself threw: ${err?.stack || err}`);
  process.exit(1);
});
