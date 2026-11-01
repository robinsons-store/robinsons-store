const { normalizeExtraction, extractReply, EXTRACT_MEDIA_TYPES, SUBTOTAL_MISMATCH } = require("./extractValidate.js");
const { editLine, linesToSave, costEntry } = require("./captureLines.js");
let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };
const line = (o) => ({ description: "Rope 50ft", qty: 2, unit_cost: 12.5, retail_price_note: 19.99, confidence: 0.9, ...o });
const one = (o) => normalizeExtraction({ vendor: "Acme", invoice_date: "2026-06-01", notes: "", line_items: [line(o)] });

// A clean read passes through untouched and raises nothing.
const clean = one({});
t("clean line unchanged", JSON.stringify(clean.data.line_items[0]) === JSON.stringify(line({})));
t("clean read has no warnings", clean.warnings.length === 0);

// Every coercion drops confidence to 0, so the line goes through the amber acknowledgement.
t("confidence above 1 becomes 0", one({ confidence: 7 }).data.line_items[0].confidence === 0);
t("negative confidence becomes 0", one({ confidence: -0.2 }).data.line_items[0].confidence === 0);
t("missing confidence becomes 0", one({ confidence: undefined }).data.line_items[0].confidence === 0);
const neg = one({ qty: -2 }).data.line_items[0];
t("negative qty becomes null with confidence 0", neg.qty === null && neg.confidence === 0);
const nan = one({ unit_cost: NaN }).data.line_items[0];
t("NaN cost becomes null with confidence 0", nan.unit_cost === null && nan.confidence === 0);
const str = one({ unit_cost: "12.50" }).data.line_items[0];
t("numeric string is kept but flagged", str.unit_cost === 12.5 && str.confidence === 0);

// retail_price_note is legitimately null (no handwritten price); that is not a coercion.
const noRetail = one({ retail_price_note: null }).data.line_items[0];
t("null retail note keeps confidence", noRetail.retail_price_note === null && noRetail.confidence === 0.9);
// Zero is the prompt's own "missing" value, not a bad number.
t("zero qty is not a coercion", one({ qty: 0 }).data.line_items[0].confidence === 0.9);

// A described line costed at exactly 0 is the prompt's "no cost printed", never a confident read.
const zeroCost = one({ unit_cost: 0 });
t("zero cost on a described line drops to 0 with one warning", zeroCost.data.line_items[0].confidence === 0 && zeroCost.warnings.length === 1);
t("zero cost keeps the 0, the human types the real one", zeroCost.data.line_items[0].unit_cost === 0);
t("zero cost with no description still drops to 0", one({ description: "", qty: 5, unit_cost: 0 }).data.line_items[0].confidence === 0);

// The lines against the pre-tax subtotal printed on the invoice. 4 x 18.75 + 25 x 1 = 100.00.
const priced = (printed_subtotal) => normalizeExtraction({
  vendor: "Acme", invoice_date: "2026-06-01", notes: "", printed_subtotal,
  line_items: [line({ qty: 4, unit_cost: 18.75, confidence: 0.95 }), line({ description: "Nails", qty: 25, unit_cost: 1, confidence: 0.95 })]
});
const off = priced(150);
t("subtotal 50 off: every line drops to 0", off.data.line_items.every((l) => l.confidence === 0));
t("subtotal 50 off: one warning and the reason", off.warnings.length === 1 && off.reason === SUBTOTAL_MISMATCH);
const near = priced(100.03);
t("subtotal within 5 cents leaves the lines alone", near.data.line_items.every((l) => l.confidence === 0.95) && near.warnings.length === 0 && near.reason === undefined);
t("subtotal 6 cents off trips", priced(100.06).reason === SUBTOTAL_MISMATCH && priced(99.94).reason === SUBTOTAL_MISMATCH);
t("no printed subtotal leaves the lines alone", priced(null).reason === undefined && priced(undefined).data.line_items[0].confidence === 0.95);
t("an unusable printed subtotal trips, fails closed", priced(-5).reason === SUBTOTAL_MISMATCH && priced("abc").reason === SUBTOTAL_MISMATCH);
t("a subtotal with no lines raises nothing", normalizeExtraction({ printed_subtotal: 40, line_items: [] }).warnings.length === 0);
// Zero shipped on a backordered line adds nothing, as on the invoice.
// Rounded once over the sum, as the screen does: 12 x 0.125 is 1.50, not 12 x 13 cents.
t("sub-cent unit costs are summed before rounding", normalizeExtraction({ printed_subtotal: 1.5, line_items: Array.from({ length: 12 }, () => line({ qty: 1, unit_cost: 0.125 })) }).reason === undefined);
t("backordered zero-qty line still adds up", normalizeExtraction({ printed_subtotal: 75, line_items: [line({ qty: 4, unit_cost: 18.75 }), line({ description: "Nails", qty: 0, unit_cost: 1 })] }).reason === undefined);

// The route's reply after the model call: the words, the status, and the value checks.
const okResult = (text) => ({ ok: true, text, stopReason: "end_turn", model: "claude-sonnet-5", ms: 5, usage: null });
const failed = (kind) => ({ ok: false, kind, detail: "provider text that must not reach a screen", model: "claude-sonnet-5", ms: 5 });
const read = extractReply(okResult(JSON.stringify({ vendor: "Acme", invoice_date: "2026-06-01", notes: "", line_items: [line({ confidence: 7 })], printed_subtotal: null })));
t("reply: a confidence-7 line comes back at 0 with a warning", read.status === 200 && read.body.line_items[0].confidence === 0 && read.body.warnings.length === 1);
t("reply: carries the model, no reason on a clean subtotal", read.body.model === "claude-sonnet-5" && !("reason" in read.body));
const fenced = extractReply(okResult("```json\n" + JSON.stringify({ line_items: [line({})], printed_subtotal: 100 }) + "\n```"));
t("reply: fenced JSON is read, the mismatch reason comes back", fenced.status === 200 && fenced.body.reason === SUBTOTAL_MISMATCH && fenced.body.line_items[0].confidence === 0);
const refusal = extractReply(failed("refusal"));
t("reply: refusal is 422 and points at Enter manually", refusal.status === 422 && /Enter manually/.test(refusal.body.error));
const long = extractReply(failed("max_tokens"));
t("reply: max_tokens is 422 and says two halves", long.status === 422 && /two halves/.test(long.body.error));
t("reply: capped is 429", extractReply(failed("capped")).status === 429);
const up = extractReply(failed("upstream"));
t("reply: other failures are 502 with plain words, never the provider text", up.status === 502 && /Enter manually/.test(up.body.error) && !/provider text/.test(up.body.error));
const junk = extractReply(okResult("not json at all"));
t("reply: unparseable text is 502", junk.status === 502 && /unreadable/.test(junk.body.error));
const copy = JSON.stringify([refusal, long, up, junk]);
t("reply: no em dash in any sentence", !copy.includes("\u2014"));

// Dates must be real calendar dates.
const bad = normalizeExtraction({ invoice_date: "2026-02-30", line_items: [] });
t("impossible date left blank", bad.data.invoice_date === "" && bad.warnings.length === 1);
t("loose date format left blank", normalizeExtraction({ invoice_date: "June 1 2026" }).data.invoice_date === "");
t("real date kept", one({}).data.invoice_date === "2026-06-01");

// Empty lines are noise; a garbage payload is an empty extraction, not a crash.
t("all-empty line dropped", one({ description: "", qty: 0, unit_cost: 0, retail_price_note: null }).data.line_items.length === 0);
t("null payload does not crash", normalizeExtraction(null).data.line_items.length === 0);
t("line_items not an array becomes empty", normalizeExtraction({ line_items: "x" }).data.line_items.length === 0);
t("long text capped at 500", one({ description: "x".repeat(900) }).data.line_items[0].description.length === 500);

t("PDF and JPEG accepted, HEIC refused", EXTRACT_MEDIA_TYPES.has("application/pdf") && EXTRACT_MEDIA_TYPES.has("image/jpeg") && !EXTRACT_MEDIA_TYPES.has("image/heic"));

// Capture screen: only a retyped unit cost clears an amber line.
const amber = line({ confidence: 0.5 });
t("description edit keeps an amber line amber", editLine(amber, { description: "Rope 100ft" }).confidence === 0.5);
t("qty edit keeps an amber line amber", editLine(amber, { qty: 3 }).confidence === 0.5);
const retyped = editLine(amber, { unit_cost: 13 });
t("retyped unit cost clears the flag", retyped.confidence === 1 && retyped.unit_cost === 13);
t("emptied cost box keeps an amber line amber", editLine(amber, { unit_cost: null }).confidence === 0.5);
t("non-number cost keeps an amber line amber", editLine(amber, { unit_cost: NaN }).confidence === 0.5);
t("typing 0 or less keeps an amber line amber", editLine(amber, { unit_cost: 0 }).confidence === 0.5 && editLine(amber, { unit_cost: -5 }).confidence === 0.5);

// A role that cannot see money never posts an amber cost it could not check.
const staffRow = linesToSave([amber], false, 0.7)[0];
t("staff save drops an amber cost", staffRow.unit_cost === null && staffRow.confidence === 0.5 && staffRow.qty === 2);
t("money role save keeps an amber cost", linesToSave([amber], true, 0.7)[0].unit_cost === 12.5);
t("staff save keeps a confident cost", linesToSave([line({ confidence: 0.9 })], false, 0.7)[0].unit_cost === 12.5);
t("staff save keeps a cost at exactly the threshold", linesToSave([line({ confidence: 0.7 })], false, 0.7)[0].unit_cost === 12.5);
t("staff save keeps a null-confidence cost", linesToSave([line({ confidence: null })], false, 0.7)[0].unit_cost === 12.5);

// A cost typed later on the feed is a human check: confidence 1, so the trigger passes.
// Anything else comes back as { error } with the sentence shown under the box.
const cost = (s) => { const r = costEntry(s); return "error" in r ? undefined : r.unit_cost; };
const refused = (s) => "error" in costEntry(s);
const typed = costEntry("12.50");
t("typed cost sets confidence 1", !("error" in typed) && typed.unit_cost === 12.5 && typed.confidence === 1);
t("dollar sign and thousands commas accepted", cost(" $1,234.5 ") === 1234.5);
t("plain and point-led costs accepted", cost("1234") === 1234 && cost(".5") === 0.5 && cost("12.") === 12);
t("blank cost refused", refused("  "));
t("negative cost refused", refused("-3"));
t("decimal comma refused, not read as 1250", refused("12,50") && refused("1,2,3") && refused("1,23"));
t("comma after a leading 0 refused, not read as 500", refused("0,500"));
t("zero refused: the reader writes 0 for a cost it could not read", refused("0") && refused("0.00") && refused(".0"));
t("cost too long to be finite refused, never saved as null", refused("1" + "0".repeat(309)));
t("cost above the per-unit cap refused", refused("100000.01") && refused("250,000") && cost("100000") === 100000);
t("text cost refused", refused("twelve") && refused("0x10") && refused("1e3"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
