const { normalizeExtraction, checkTotals, EXTRACT_MEDIA_TYPES } = require("./extractValidate.js");
const { editLine, linesToSave, costEntry, notesWithInvoiceNumber } = require("./captureLines.js");
const { vendorKey, matchVendor } = require("./vendorMatch.js");
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

// The printed totals. The default line is 2 x 12.50, so the lines make 25.00.
const inv = (printed, lines = [line({})]) =>
  normalizeExtraction({ vendor: "Acme", invoice_number: "A-1", invoice_date: "2026-06-01", notes: "", line_items: lines, ...printed });
const none = { printed_subtotal: null, printed_hst: null, printed_total: null };
const agree = inv({ printed_subtotal: 25, printed_hst: 3.25, printed_total: 28.25 });
t("printed totals and invoice number pass through", agree.data.printed_subtotal === 25 && agree.data.printed_hst === 3.25 && agree.data.printed_total === 28.25 && agree.data.invoice_number === "A-1");
t("lines that make the printed subtotal raise nothing", agree.data.totals_mismatch === false && agree.warnings.length === 0);
t("a few cents of rounding is not a mismatch", inv({ ...none, printed_subtotal: 25.05 }).data.totals_mismatch === false);
const off = inv({ ...none, printed_subtotal: 25.06 });
t("six cents off the subtotal is a mismatch", off.data.totals_mismatch === true);
t("a mismatch says which printed figure", off.warnings.length === 1 && off.warnings[0].includes("printed subtotal"));
t("the mismatch warning carries no figure, so logs carry no money", !/[$\d]/.test(off.warnings[0]));
t("a mismatch leaves line confidence as read", off.data.line_items[0].confidence === 0.9);
t("only a total, HST on top at the rate", inv({ ...none, printed_total: 28.25 }).data.totals_mismatch === false);
t("only a total and a printed tax (GST 5%)", inv({ ...none, printed_hst: 1.25, printed_total: 26.25 }).data.totals_mismatch === false);
t("only a total, prices include tax", inv({ ...none, printed_total: 25 }).data.totals_mismatch === false);
const badTotal = checkTotals([line({})], { ...none, printed_total: 40 });
t("a total that matches nothing is a mismatch on the total", badTotal.status === "mismatch" && badTotal.against === "total" && badTotal.printed === 40);
t("a misread subtotal is forgiven when the total agrees", inv({ printed_subtotal: 52, printed_hst: 3.25, printed_total: 28.25 }).data.totals_mismatch === false);
// Capture adds HST on top of the lines, so a tax row read as a purchase counts the tax twice.
const taxRow = [line({}), line({ description: "HST 13%", qty: 1, unit_cost: 3.25, retail_price_note: null })];
t("an HST row read as a line does not pass as the total", inv({ printed_subtotal: 25, printed_hst: 3.25, printed_total: 28.25 }, taxRow).data.totals_mismatch === true);
t("nor when only the tax and total are printed", inv({ ...none, printed_hst: 3.25, printed_total: 28.25 }, taxRow).data.totals_mismatch === true);
const nothing = inv(none);
t("nothing printed: unchecked, no flag, no warning", nothing.data.totals_mismatch === false && nothing.warnings.length === 0 && checkTotals([line({})], none).status === "unchecked");
t("fields left out entirely read as not printed", one({}).data.printed_total === null && one({}).data.totals_mismatch === false);
const credit = inv({ ...none, printed_total: -25 });
t("a negative printed total is left blank and fails closed", credit.data.printed_total === null && credit.data.printed_unreadable === true && credit.data.totals_mismatch === true && credit.warnings.length === 2);
t("an unreadable figure's warning carries no figure either", !/[$\d]/.test(credit.warnings[1]));
t("a text printed subtotal is left blank and fails closed", inv({ ...none, printed_subtotal: "see page 2" }).data.totals_mismatch === true);
const badHst = inv({ printed_subtotal: 25, printed_hst: "n/a", printed_total: null });
t("an unreadable HST does not flag lines that make the subtotal", badHst.data.printed_hst === null && badHst.data.totals_mismatch === false && badHst.warnings.length === 1);
const gross = [line({ qty: 1, unit_cost: 113 })];
t("an unreadable HST does not open the prices-include-tax shortcut", inv({ printed_subtotal: null, printed_hst: -13, printed_total: 113 }, gross).data.totals_mismatch === true);
t("an unreadable total does not let the rate vouch for the lines", inv({ printed_subtotal: null, printed_hst: null, printed_total: "113,00" }, gross).data.totals_mismatch === true);
// A printed tax is the tax: HST at the rate is assumed only when none is printed.
const hundred = [line({ qty: 1, unit_cost: 100 })];
t("a printed 0.00 tax rules out tax at the rate", inv({ printed_subtotal: 113, printed_hst: 0, printed_total: 113 }, hundred).data.totals_mismatch === true);
t("a printed tax rules out tax at the rate", inv({ printed_subtotal: 113, printed_hst: 5.65, printed_total: 118.65 }, [line({ qty: 1, unit_cost: 105 })]).data.totals_mismatch === true);
t("zero-rated goods: tax printed as 0.00, lines make the total", inv({ printed_subtotal: null, printed_hst: 0, printed_total: 100 }, hundred).data.totals_mismatch === false);
const strSub = inv({ ...none, printed_subtotal: "25.00" });
t("a numeric string subtotal is kept, warned, and still checked", strSub.data.printed_subtotal === 25 && strSub.data.totals_mismatch === false && strSub.warnings.length === 1);
const ret = inv({ ...none, printed_subtotal: 15 }, [line({}), line({ description: "RETURN dock line", qty: -2, unit_cost: 5 })]);
t("a return zeroed by the value checks no longer makes the subtotal", ret.data.totals_mismatch === true);
t("the screen's tax rate is used when given", checkTotals([{ qty: 1, unit_cost: 100 }], { ...none, printed_total: 105 }, 0.05).status === "match" && checkTotals([{ qty: 1, unit_cost: 100 }], { ...none, printed_total: 105 }).status === "mismatch");
const l113 = [{ qty: 1, unit_cost: 113 }];
t("lines that make a total with no subtotal or tax printed are the total as printed", checkTotals(l113, { ...none, printed_total: 113 }).totalAsPrinted === true);
t("lines with HST on top at the rate are not the total as printed", checkTotals([{ qty: 1, unit_cost: 100 }], { ...none, printed_total: 113 }).totalAsPrinted === false);
t("lines that make the printed subtotal are not the total as printed", checkTotals(l113, { ...none, printed_subtotal: 113, printed_total: 127.69 }).totalAsPrinted === false);
t("a printed tax rules out the total as printed, even at 0.00", checkTotals(l113, { ...none, printed_hst: 0, printed_total: 113 }).totalAsPrinted === false && checkTotals(l113, { ...none, printed_hst: 13, printed_total: 113 }).status === "mismatch");
t("a mismatch is never the total as printed", checkTotals(l113, { ...none, printed_total: 200 }).totalAsPrinted === false);
const partial = checkTotals([{ qty: null, unit_cost: 5 }, { qty: 2, unit_cost: null }, { qty: 2, unit_cost: 12.5 }], { ...none, printed_subtotal: 25 });
t("a missing qty or cost counts as 0, as on the capture screen", partial.status === "match" && partial.computed === 25);
t("invoice number trimmed, label kept", inv({ ...none, invoice_number: "  INVOICE NO. NB-20417 " }).data.invoice_number === "INVOICE NO. NB-20417");
// The number goes into the notes, which staff see, so it must not carry an amount.
const numberOf = (n) => inv({ ...none, invoice_number: n });
t("an invoice number with a dollar figure is left blank", numberOf("A-1 Total $113.00").data.invoice_number === "" && numberOf("A-1 Total $113.00").warnings.length === 1);
t("an invoice number with an amount is left blank", numberOf("A-1 113.00").data.invoice_number === "" && numberOf("A-1 113,00").data.invoice_number === "");
t("an invoice number over 40 characters or four words is left blank", numberOf("9".repeat(41)).data.invoice_number === "" && numberOf("see the second page please").data.invoice_number === "");
t("ordinary invoice numbers are kept", ["NB-20417", "55-0418", "INV 1,234", "KGD-118840", "7781"].every((n) => numberOf(n).data.invoice_number === n));

// The eval samples are written by hand in the route's response shape. Their totals verdict and
// warning must be what this code works out from their own lines and printed figures, so the
// golden cases never pin a verdict the route would not give.
const samples = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../../aievals-check/samples/extract.json"), "utf8")).samples;
const verdicts = samples.filter((s) => s.status === 200 && s.body.totals_mismatch !== undefined);
const wrong = verdicts.filter((s) => {
  const r = normalizeExtraction(s.body);
  const warned = (s.body.warnings || []).some((w) => r.warnings.includes(w) && w.startsWith("the lines "));
  return r.data.totals_mismatch !== s.body.totals_mismatch || warned !== s.body.totals_mismatch;
});
t("every eval sample's totals verdict is what the route would say", verdicts.length >= 30 && wrong.length === 0, wrong.map((s) => `${s.case}: ${s.label}`).join("; ") || `${verdicts.length} samples`);

// Vendor match on the capture screen.
t("suffix, case and punctuation ignored", vendorKey("Northbay Hardware Supply Ltd.") === vendorKey("NORTHBAY HARDWARE SUPPLY"));
t("ampersand reads as and; accents fold", vendorKey("Bancroft Feed & Seed Inc") === vendorKey("bancroft feed and seed") && vendorKey("Distribution Laurentienne Ltée") === "distribution laurentienne");
t("stacked suffixes all dropped", vendorKey("Algonquin Hardware Co. Ltd.") === "algonquin hardware");
t("a suffix word is only dropped from the end", vendorKey("Co-op Feed Supply") === "co op feed supply");
t("apostrophes and periods join rather than split", vendorKey("O'Reilly Supply Ltd.") === vendorKey("OReilly Supply") && vendorKey("J.D. Feed") === vendorKey("JD Feed"));
const vendors = [
  { id: 1, name: "Northbay Hardware Supply", department_id: "hw" },
  { id: 2, name: "Northbay Hardware Supply", department_id: "garden" },
  { id: 3, name: "Acme Inc", department_id: "hw" },
  { id: 4, name: "Acme Ltd", department_id: "hw" }
];
t("matched across suffix and case", matchVendor(vendors, "hw", "NORTHBAY HARDWARE SUPPLY LTD.")?.id === 1);
t("matched only within the department", matchVendor(vendors, "garden", "Northbay Hardware Supply Ltd")?.id === 2 && matchVendor(vendors, "grocery", "Northbay Hardware Supply") === undefined);
t("an exact name wins over a key match", matchVendor(vendors, "hw", " acme inc ")?.id === 3);
t("two vendors on one key match neither", matchVendor(vendors, "hw", "ACME") === undefined);
t("two vendors with the same exact name match neither", matchVendor([...vendors, { id: 5, name: "acme inc", department_id: "hw" }], "hw", "Acme Inc") === undefined);
t("a blank vendor matches nothing", matchVendor(vendors, "hw", "  ") === undefined);
t("a shorter name is not a match", matchVendor(vendors, "hw", "Northbay Hardware") === undefined);

// The invoice number goes into the notes, since the form has no box for it.
t("number into empty notes", notesWithInvoiceNumber("", "NB-20417") === "Invoice NB-20417");
t("number in front of other notes", notesWithInvoiceNumber("Terms Net 30", "NB-20417") === "Invoice NB-20417. Terms Net 30");
t("notes that already carry it are left alone", notesWithInvoiceNumber("Invoice nb-20417, terms Net 30", "NB-20417") === "Invoice nb-20417, terms Net 30");
t("no number, notes unchanged", notesWithInvoiceNumber("x", "  ") === "x");
t("the same digits as another figure do not count", notesWithInvoiceNumber("Terms Net 30", "30") === "Invoice 30. Terms Net 30");
t("a number after # or No. counts", notesWithInvoiceNumber("Ref #NB-20417", "NB-20417") === "Ref #NB-20417" && notesWithInvoiceNumber("Facture no 55-0418", "55-0418") === "Facture no 55-0418");

// Capture screen: only a retyped unit cost clears an amber line.
const amber = line({ confidence: 0.5 });
t("description edit keeps an amber line amber", editLine(amber, { description: "Rope 100ft" }).confidence === 0.5);
t("qty edit keeps an amber line amber", editLine(amber, { qty: 3 }).confidence === 0.5);
const retyped = editLine(amber, { unit_cost: 13 });
t("retyped unit cost clears the flag", retyped.confidence === 1 && retyped.unit_cost === 13);
t("emptied cost box keeps an amber line amber", editLine(amber, { unit_cost: null }).confidence === 0.5);
t("non-number cost keeps an amber line amber", editLine(amber, { unit_cost: NaN }).confidence === 0.5);

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
