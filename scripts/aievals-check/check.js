// The scorers and the golden data, tested without a model. Runs in CI from out/ (see README).
const fs = require("fs");
const path = require("path");
const S = require("./score.js");
const { renderPdf, printedTotals } = require("./pdf.js");

const HERE = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(HERE, p), "utf8"));
const extract = read("cases/extract.json").cases;
const askFile = read("cases/ask.json");
const ask = askFile.cases;
const store = read("cases/store.json");
const samples = { extract: read("samples/extract.json").samples, ask: read("samples/ask.json").samples };

let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };
const failed = (score) => score.checks.filter((c) => !c.pass).map((c) => c.name + (c.detail ? ` (${c.detail})` : ""));

// ---------- the golden data is well formed ----------

const ids = [...extract, ...ask].map((c) => c.id);
t("case ids are unique", new Set(ids).size === ids.length);
t("about ten cases each", extract.length >= 10 && ask.length >= 10, `${extract.length} extract, ${ask.length} ask`);

// A tripwire for one kind of pasted real data, phone numbers, in any of the five files.
// 555-0100 to 555-0199 is the range reserved for made-up numbers. It cannot tell a real
// invoice from a made-up one; only the person adding a case can.
const raw = ["cases/extract.json", "cases/ask.json", "cases/store.json", "samples/extract.json", "samples/ask.json"]
  .map((p) => fs.readFileSync(path.join(HERE, p), "utf8"))
  .join("\n");
const phones = raw.match(/(?:\(\d{3}\)\s?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b/g) || [];
const fake = (p) => p.replace(/\D/g, "").slice(3, 8) === "55501";
t("every phone number is a fictional 555-01xx", phones.length > 0 && phones.every(fake), phones.filter((p) => !fake(p)).join(", "));
t("the phone tripwire sees other formats", ["(705) 286-1234", "705.286.1234", "705 286 1234"].every((p) => (p.match(/(?:\(\d{3}\)\s?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b/g) || []).length === 1 && !fake(p)));

// Allocations belong to an invoice and are scoped through it, as in the real schema.
const scoped = ["knowledge_note", "vendor", "invoice"].flatMap((name) => store.tables[name]);
t("every store-scoped row carries a store_id", scoped.every((r) => typeof r.store_id === "string"));
const invoiceIds = new Set(store.tables.invoice.map((i) => i.id));
t("every allocation belongs to an invoice", store.tables.payment_allocation.every((a) => invoiceIds.has(a.invoice_id)));

// The amber band, pinned to the capture screen's value and to its comparison.
const capture = fs.readFileSync(path.join(HERE, "../../src/app/capture/page.tsx"), "utf8");
const low = capture.match(/const LOW_CONFIDENCE = ([\d.]+);/);
t("amber line matches the capture screen", !!low && Number(low[1]) === S.LOW_CONFIDENCE, low ? low[1] : "not found");
t("capture's amber test is strictly below the line", capture.includes("l.confidence !== null && l.confidence < LOW_CONFIDENCE"));

t("every known gap says what it waits for", [...extract, ...ask].every((c) => c.knownGap === undefined || (typeof c.knownGap === "string" && c.knownGap.length > 20)));

// Each expected line names exactly one printed row, and agrees with it on quantity, price
// and handwritten retail note. This is what keeps a typo in a case from becoming a wrong
// answer the model is marked down for.
const words = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const has = (desc, w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split("|").some((x) => desc.some((d) => d === x || d === x + "s" || d === x + "es"));
const mismatches = [];
for (const c of extract) {
  const table = c.document.table ? c.document.table.rows : [];
  for (const e of c.expect.lines || []) {
    const hits = table.filter((r) => e.match.every((w) => has(words(r[1]), w)));
    const label = `${c.id} "${e.match.join(" ")}"`;
    if (hits.length !== 1) { mismatches.push(`${label} names ${hits.length} rows`); continue; }
    const [qty, , unit, note] = hits[0];
    const qtyOk = e.qty === undefined || e.qty === qty;
    const unitOk = e.unit_cost === undefined || (typeof unit === "number" ? Math.abs(e.unit_cost - unit) < 1e-9 : e.unit_cost === 0);
    const noteOk = e.retail_price_note === undefined || e.retail_price_note === (note && note.hand !== undefined ? Number(note.hand) : null);
    if (!qtyOk || !unitOk || !noteOk) mismatches.push(`${label} printed ${qty} x ${unit}${note ? " note " + note.hand : ""}`);
  }
}
t("every expected line names one printed row and agrees with it", mismatches.length === 0, mismatches.join("; "));

// Expected printed totals are the figures the invoice prints, worked out by the renderer, and
// null exactly where the invoice prints no such row.
const totalsOff = [];
for (const c of extract) {
  const p = printedTotals(c.document);
  for (const [field, key] of [["printed_subtotal", "subtotal"], ["printed_hst", "hst"], ["printed_total", "total"]]) {
    const want = c.expect[field];
    if (want === undefined) continue;
    const ok = want === null ? p[key] === null : p[key] !== null && Math.abs(want - p[key]) < 1e-9;
    if (!ok) totalsOff.push(`${c.id} ${field} ${want}, printed ${p[key]}`);
  }
}
t("every expected printed total is what the invoice prints", totalsOff.length === 0, totalsOff.join("; "));
t("every case says what the totals check concludes", extract.every((c) => typeof c.expect.totals_mismatch === "boolean"));

// ---------- the invoices render ----------

for (const c of extract) {
  const pdf = renderPdf(c.document);
  const text = pdf.toString("latin1");
  const xref = Number((text.match(/startxref\n(\d+)/) || [])[1]);
  const entries = (text.slice(xref).match(/\d{10} 00000 n /g) || []).map((e) => Number(e.slice(0, 10)));
  const objectsOk = entries.length > 0 && entries.every((off, i) => text.startsWith(`${i + 1} 0 obj`, off));
  const pages = Number((text.match(/\/Count (\d+)/) || [])[1]);
  const pageObjs = (text.match(/\/Type \/Page /g) || []).length;
  const ok = text.startsWith("%PDF-1.4") && text.startsWith("xref", xref) && objectsOk && pages === pageObjs && pages >= 1;
  t(`${c.id} renders a valid PDF`, ok, `${pages} page(s), ${pdf.length} bytes`);
}
const longPdf = renderPdf(extract.find((c) => c.id === "extract-long").document).toString("latin1");
t("the long invoice runs to two pages", /\/Count 2\b/.test(longPdf));
const hand = renderPdf(extract.find((c) => c.id === "extract-retail-notes").document).toString("latin1");
t("margin notes are drawn in the handwriting font", (hand.match(/\/F3 13 Tf/g) || []).length === 2);
const fr = renderPdf(extract.find((c) => c.id === "extract-french").document).toString("latin1");
t("French amounts print with a decimal comma", fr.includes("9,85 $") && fr.includes("Tourtière"));
const pageTwo = extract.find((c) => c.id === "extract-page-two").document;
const p2 = renderPdf(pageTwo).toString("latin1");
t("the carried-forward balance prints and counts in the subtotal", p2.includes("Carried forward from page 1") && p2.includes("312.40") && p2.includes("528.70") && printedTotals(pageTwo).subtotal === 528.7);

// ---------- the scorers, against the samples ----------

const byId = Object.fromEntries([...extract, ...ask].map((c) => [c.id, c]));
for (const kind of ["extract", "ask"]) {
  for (const s of samples[kind]) {
    const c = byId[s.case];
    if (!c) { t(`${s.case}: sample "${s.label}" belongs to a case`, false); continue; }
    const out = { status: s.status, body: s.body };
    const score = kind === "extract"
      ? S.scoreExtract(c.expect, out)
      : S.scoreAsk(S.expandPhrases(c.expect, askFile.phrases), out, s.writes || []);
    if (s.expect === "pass") {
      t(`${s.case}: ${s.label} passes`, score.pass, failed(score).join("; "));
    } else {
      const hit = score.checks.some((x) => !x.pass && x.name.startsWith(s.failsCheck));
      t(`${s.case}: ${s.label} fails on ${s.failsCheck}`, !score.pass && hit, failed(score).join("; ") || "passed");
    }
  }
  const covered = new Set(samples[kind].filter((s) => s.expect === "pass").map((s) => s.case));
  const cases = kind === "extract" ? extract : ask;
  const missing = cases.filter((c) => !covered.has(c.id)).map((c) => c.id);
  t(`every ${kind} case has a passing sample`, missing.length === 0, missing.join(", "));
}

// ---------- scorer details the samples do not reach ----------

t("vendor suffixes and ampersands fold", S.vendorKey("Bancroft Feed & Seed Ltd.") === S.vendorKey("BANCROFT FEED AND SEED"));
t("a blank vendor does not match a name", S.vendorKey("") !== S.vendorKey("Unknown"));
t("invoice number labels fold", S.invoiceKey("Invoice No. NB-20417") === S.invoiceKey("nb 20417") && S.invoiceKey("Facture no 55-0418") === S.invoiceKey("55-0418"));
t("a number missing its prefix is a different number", S.invoiceKey("20417") !== S.invoiceKey("NB-20417"));
t("a blank invoice number does not match one", S.invoiceKey("") !== S.invoiceKey("Till 2"));
t("thousands separators fold", S.normalizeAnswer("$1,186.50 and 4,011.50") === "$1186.50 and 4011.50");
t("unknown phrase list throws", (() => { try { S.expandPhrases({ mustInclude: ["@NOPE"] }, {}); return false; } catch { return true; } })());
t("every @phrase in ask.json resolves", (() => { try { ask.forEach((c) => S.expandPhrases(c.expect, askFile.phrases)); return true; } catch { return false; } })());
t("roles are real roles", ask.every((c) => ["staff", "lead", "manager", "owner"].includes(c.role)));
t("every case says what it covers", [...extract, ...ask].every((c) => typeof c.covers === "string" && c.covers.length > 20));
t("no em dash in any case text", !JSON.stringify([extract, askFile, store]).includes("—"));

const staffPrompt = "INVOICES: withheld. The person asking has a role that does not see money.";
t("prompt check passes a clean staff prompt", S.scorePrompt({ promptIncludes: ["INVOICES: withheld"], promptExcludes: ["$"] }, staffPrompt).pass);
t("prompt check catches a dollar figure", !S.scorePrompt({ promptExcludes: ["$"] }, staffPrompt + " - Cedar Ridge Lumber: $1186.50").pass);
t("a missing line fails the count as well", (() => {
  const s = S.scoreExtract({ lines: [{ match: ["rope"] }, { match: ["rake"] }] }, { status: 200, body: { line_items: [{ description: "rope" }] } });
  return !s.pass && s.checks.some((c) => c.name === "line count" && !c.pass);
})());
t("an extra line fails the count", (() => {
  const s = S.scoreExtract({ lines: [{ match: ["rope"] }] }, { status: 200, body: { line_items: [{ description: "rope" }, { description: "rope" }] } });
  return !s.pass && s.checks.some((c) => c.name === "line count" && !c.pass);
})());
t("confidence exactly at the line is not amber, as on capture", S.scoreExtract({ lines: [{ match: ["rope"], flagged: false }] }, { status: 200, body: { line_items: [{ description: "rope", confidence: S.LOW_CONFIDENCE }] } }).pass);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
