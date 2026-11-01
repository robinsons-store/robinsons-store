// Runs the real compiled /api/slack/events route with a fake database, a mocked Supabase
// client and a mocked fetch for both Slack and Anthropic. No network call leaves this process
// and no real key or token is used.
const path = require("path");
const crypto = require("crypto");
const Module = require("module");
const OUT = __dirname; // check.js is copied into out/, next to src/ and .github/
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req.startsWith("@/")) req = path.join(OUT, "src", req.slice(2));
  return origResolve.call(this, req, parent, ...rest);
};

const SECRET = "test-signing-secret";
const STORE = "store-under-test";
const CHANNEL = "C0REQUESTS";
const BOT = "U0BOT";
function env(over = {}) {
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  delete process.env.ANTHROPIC_MODEL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-not-real";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-not-real";
  process.env.SLACK_SIGNING_SECRET = SECRET;
  process.env.SLACK_BOT_TOKEN = "xoxb-not-real";
  process.env.SLACK_REQUEST_CHANNEL = CHANNEL;
  process.env.SLACK_STORE_ID = STORE;
  for (const [k, v] of Object.entries(over)) v === undefined ? delete process.env[k] : (process.env[k] = v);
}

// Fake Supabase. Records every table read, every column list, every store filter and every rpc.
// The store's name is deliberately NOT the name of the store this repo started with: the
// answer must come from the store table, never from code.
const rows = {
  store: [{ id: STORE, name: "Maple Corner Store" }],
  knowledge_note: [{ topic: "Candle reorders", body: "Reorder in April for the summer.", tags: ["reorder"], department: { name: "Gifts" } }],
  vendor: [
    { id: "v1", name: "Pinecrest Moccasins", status: "active", default_terms: "Net 30", phone: "705-555-0101", minimum_order_amount: 500, department: { name: "DryGoods" } },
    { id: "v2", name: "Lakeview Candle Co", status: "active", default_terms: "Net 60", summer_order_timeline: "order by April", department: { name: "Gifts" } }
  ],
  invoice: [{ amount: 1000, hst_amount: 130, freight_charges: 0, tax_mode: "added", due_date: "2026-09-01", status: "overdue", vendor: { name: "Pinecrest Moccasins" } }]
};
const reads = [];
const rpcs = [];
let capAllowed = true;
const fakeDb = {
  from(table) {
    const r = { table, columns: "", filters: [] };
    reads.push(r);
    const q = {
      select(c) { r.columns = c || ""; return q; },
      is() { return q; },
      eq(col, val) { r.filters.push([col, val]); return q; },
      limit() { return q; },
      maybeSingle() { const d = (rows[table] || []).find((x) => r.filters.every(([c, v]) => x[c] === v)); return Promise.resolve({ data: d || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: rows[table] || [], error: null }).then(res, rej); }
    };
    return q;
  },
  rpc(name, args) {
    rpcs.push({ name, args });
    const data = name === "ai_call_begin" ? { allowed: capAllowed, id: "call-1" } : null;
    const p = Promise.resolve({ data, error: null });
    return { abortSignal: () => p, then: (a, b) => p.then(a, b) };
  }
};
const created = [];
const sbPath = require.resolve("@supabase/supabase-js", { paths: [path.join(__dirname, "..", "..", "..")] });
require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: {
  createClient: (_url, key) => { created.push(key); return fakeDb; }
} };

// Mocked fetch for Slack and Anthropic.
const anthropic = [];
const slackCalls = [];
let reply = "";
let reactionError = "";
global.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://api.anthropic.com/")) {
    anthropic.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      content: [{ type: "text", text: reply }], stop_reason: "end_turn", model: "claude-sonnet-5",
      usage: { input_tokens: 40, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (u.startsWith("https://slack.com/api/")) {
    const method = u.slice("https://slack.com/api/".length);
    slackCalls.push({ method, body: JSON.parse(init.body), auth: init.headers.authorization });
    const ok = !(method === "reactions.add" && reactionError);
    return new Response(JSON.stringify(ok ? { ok: true, ts: "999.1" } : { ok: false, error: reactionError }), { status: 200 });
  }
  throw new Error("unexpected fetch " + u);
};
const logs = [];
const origLog = console.log;
console.log = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push(a.join(" "));
console.error = (...a) => logs.push(a.join(" "));

env();
const { POST } = require(path.join(OUT, "src/app/api/slack/events/route.js"));
const { UNCONFIRMED_ANSWER } = require(path.join(OUT, "src/lib/askGrounding.js"));
const { ASK_WHICH_TEXT, ANSWERED, ASKED_WHICH } = require(path.join(OUT, ".github/scripts/slack-intent.cjs"));

let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; origLog(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };

function sign(raw, ts) {
  return "v0=" + crypto.createHmac("sha256", SECRET).update(`v0:${ts}:${raw}`).digest("hex");
}
function reset() { reads.length = 0; rpcs.length = 0; anthropic.length = 0; slackCalls.length = 0; logs.length = 0; created.length = 0; reactionError = ""; capAllowed = true; }
async function post(payload, opts = {}) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const headers = new Headers({ "x-slack-request-timestamp": ts, "x-slack-signature": opts.sig ?? sign(raw, ts) });
  if (opts.retry) headers.set("x-slack-retry-num", "1");
  const req = { text: async () => raw, headers };
  const res = await POST(req);
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}
const mention = (text, over = {}) => ({
  type: "event_callback",
  authorizations: [{ user_id: BOT }],
  event: { type: "app_mention", channel: CHANNEL, user: "U0PERSON", ts: "1700000000.000100", text: `<@${BOT}> ${text}`, ...over }
});
const posted = () => slackCalls.filter((c) => c.method === "chat.postMessage");
const reacted = () => slackCalls.filter((c) => c.method === "reactions.add");

(async () => {
  // Setup and the Slack handshake.
  reset(); env({ SLACK_SIGNING_SECRET: undefined });
  let r = await post(mention("when is the candle order due?"));
  t("no signing secret: refuses, posts nothing", r.status === 503 && slackCalls.length === 0 && anthropic.length === 0, String(r.status));
  env();

  reset();
  r = await post(mention("when is the candle order due?"), { sig: "v0=" + "0".repeat(64) });
  t("bad signature: 401, nothing done", r.status === 401 && slackCalls.length === 0 && anthropic.length === 0, String(r.status));
  r = await post(mention("when is the candle order due?"), { ts: Math.floor(Date.now() / 1000) - 600 });
  t("stale timestamp (replay): 401", r.status === 401 && slackCalls.length === 0, String(r.status));

  reset();
  r = await post({ type: "url_verification", challenge: "abc123" });
  t("url_verification returns the challenge", r.status === 200 && r.data?.challenge === "abc123");

  reset();
  r = await post(mention("when is the candle order due?"), { retry: true });
  t("a Slack retry is acknowledged and not worked twice", r.status === 200 && slackCalls.length === 0 && anthropic.length === 0);

  // A question gets an answer in its thread.
  reset();
  reply = "[[Lakeview Candle Co]] is ordered by April for the summer.";
  r = await post(mention("when is the candle order due?"));
  t("question: acknowledged", r.status === 200);
  t("question: claimed with the answered reaction on the message", reacted().length === 1 && reacted()[0].body.name === ANSWERED && reacted()[0].body.timestamp === "1700000000.000100" && reacted()[0].body.channel === CHANNEL);
  t("question: one reply, in the message's thread", posted().length === 1 && posted()[0].body.thread_ts === "1700000000.000100" && posted()[0].body.channel === CHANNEL);
  t("question: the reply is the grounded answer, markers removed", posted()[0]?.body.text.startsWith("Lakeview Candle Co is ordered by April"), posted()[0]?.body.text);
  t("question: the bot token is used for Slack", slackCalls.every((c) => c.auth === "Bearer xoxb-not-real"));
  t("question: one model call", anthropic.length === 1);
  const body = anthropic[0];
  const prompt = JSON.stringify(body);
  t("store name comes from the store table", prompt.includes("Maple Corner Store"));
  t("no store name is hardcoded", !/Robinson|Dorset/i.test(prompt));
  t("the question is fenced as data", body.messages[0].content.some((b) => b.text.includes("<question>\nwhen is the candle order due?\n</question>")));
  t("the app guide block is cached", body.system.some((s) => s.cache_control?.type === "ephemeral"));
  t("every read is scoped to the configured store", reads.filter((x) => x.table !== "store").every((x) => x.filters.some(([c, v]) => c === "store_id" && v === STORE)));
  t("the store row is read by its id", reads.some((x) => x.table === "store" && x.filters.some(([c, v]) => c === "id" && v === STORE)));
  t("MONEY: the invoice table is never read", !reads.some((x) => x.table === "invoice"));
  const vendorRead = reads.find((x) => x.table === "vendor");
  t("MONEY: no money column is selected from vendors", vendorRead && !/minimum_order_amount|no_minimum_order/.test(vendorRead.columns), vendorRead?.columns);
  t("MONEY: the prompt carries no dollar figure", !/\$\d|500/.test(body.messages[0].content[0].text));
  t("MONEY: the prompt says invoices are withheld", body.messages[0].content[0].text.includes("INVOICES: withheld"));
  t("cap and log: reserved against the store as slack_ask", rpcs.some((x) => x.name === "ai_call_begin" && x.args.p_store_id === STORE && x.args.p_route === "slack_ask"));
  t("cap and log: finished", rpcs.some((x) => x.name === "ai_call_finish"));
  t("runs with the service role key, store-scoped in code", created.includes("service-not-real"));
  t("logs never carry the question or the answer", !logs.some((l) => /candle|Lakeview/i.test(l)), logs.join(" | "));

  // Money in the answer: withheld, fail closed.
  reset();
  reply = "[[Pinecrest Moccasins]] is owed $1,130.00.";
  await post(mention("what do we owe Pinecrest?"));
  t("MONEY: an answer with a dollar figure is not posted", posted().length === 1 && !posted()[0].body.text.includes("1,130") && !posted()[0].body.text.includes("$"), posted()[0]?.body.text);
  reset();
  reply = "[[Pinecrest Moccasins]] is owed 1130.00 CAD.";
  await post(mention("what do we owe Pinecrest?"));
  t("MONEY: an amount without a dollar sign is caught too", posted().length === 1 && !posted()[0].body.text.includes("1130"), posted()[0]?.body.text);

  // Grounding: the ask route's own check.
  reset();
  reply = "Call [[Northern Mukluk Ltd]] at 705-555-0199.";
  await post(mention("who sells mukluks?"));
  t("GROUNDING: an invented vendor is withheld", posted().length === 1 && posted()[0].body.text.startsWith(UNCONFIRMED_ANSWER), posted()[0]?.body.text);

  // Slack formatting cannot be used to ping the channel or forge a link.
  reset();
  reply = "<!channel> see <https://evil.example|the vendor list> & [[Lakeview Candle Co]].";
  await post(mention("who sells candles?"));
  const txt = posted()[0]?.body.text || "";
  t("SLACK: control sequences are escaped", !txt.includes("<!channel>") && txt.includes("&lt;!channel&gt;") && txt.includes("&amp;"), txt);
  t("SLACK: links are not unfurled", posted()[0]?.body.unfurl_links === false && posted()[0]?.body.unfurl_media === false);

  // Unclear: asks which, never guesses, no model call.
  reset();
  await post(mention("I need the phone number for Pinecrest"));
  t("unclear: marked with the asked-which reaction", reacted().length === 1 && reacted()[0].body.name === ASKED_WHICH);
  t("unclear: asks which in the thread", posted().length === 1 && posted()[0].body.text === ASK_WHICH_TEXT && posted()[0].body.thread_ts === "1700000000.000100");
  t("unclear: no model call", anthropic.length === 0);

  // Build requests are the sweep's, untouched here.
  reset();
  await post(mention("add a rep phone column to the vendor form"));
  t("build: nothing posted, no reaction, no model call", slackCalls.length === 0 && anthropic.length === 0);

  // Only the configured channel, only people, only when named.
  reset();
  await post(mention("when is the candle order due?", { channel: "C0OTHER" }));
  t("another channel is ignored", slackCalls.length === 0 && anthropic.length === 0);
  await post(mention("when is the candle order due?", { bot_id: "B1" }));
  t("a bot's message is ignored", slackCalls.length === 0 && anthropic.length === 0);
  await post({ ...mention("when is the candle order due?"), authorizations: [] });
  t("FAILS CLOSED: unknown bot id means nothing is answered", slackCalls.length === 0 && anthropic.length === 0);
  await post({ ...mention("x"), event: { ...mention("x").event, type: "message", text: "when is the candle order due?" } });
  t("only app_mention events are worked", slackCalls.length === 0 && anthropic.length === 0);

  // The reaction is the claim: a second delivery of the same message does nothing.
  reset();
  reactionError = "already_reacted";
  await post(mention("when is the candle order due?"));
  t("already claimed: no second answer, no model call", posted().length === 0 && anthropic.length === 0);

  // Threads: a question in a thread is answered in that thread; anything else is left alone.
  reset();
  reply = "[[Lakeview Candle Co]] is ordered by April.";
  await post(mention("ask: when do we order candles", { ts: "1700000001.000200", thread_ts: "1700000000.000100" }));
  t("thread question: answered in the parent thread", posted().length === 1 && posted()[0].body.thread_ts === "1700000000.000100");
  reset();
  await post(mention("add a column", { ts: "1700000001.000300", thread_ts: "1700000000.000100" }));
  t("thread build or unclear: left alone", slackCalls.length === 0);

  // Not set up for a store: says so, fails closed, no model call.
  reset(); env({ SLACK_STORE_ID: undefined });
  await post(mention("when is the candle order due?"));
  t("no store configured: says it is not set up, no model call", posted().length === 1 && /not set up/i.test(posted()[0].body.text) && anthropic.length === 0, posted()[0]?.body.text);
  reset(); env({ SLACK_STORE_ID: "no-such-store" });
  await post(mention("when is the candle order due?"));
  t("unknown store id: not set up, no model call", posted().length === 1 && /not set up/i.test(posted()[0].body.text) && anthropic.length === 0);
  env();

  // The daily cap.
  reset(); capAllowed = false;
  await post(mention("when is the candle order due?"));
  t("capped: says so in the thread, no model call", posted().length === 1 && anthropic.length === 0 && /limit|tomorrow|today/i.test(posted()[0].body.text), posted()[0]?.body.text);

  origLog(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { origLog("CRASH", e); process.exit(1); });
