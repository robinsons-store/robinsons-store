const R = require("./invoiceFields.js");
let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };
const asks = (dept, key) => R.asksInvoice(dept, key);

// THE OLD BEHAVIOUR, PINNED EXACTLY. These expectations are transcribed from the three
// booleans this registry replaced (isPropertyDept /property/i, isFinanceDept /payroll|tax/i,
// isHardwareDept /hardware/i) and the nineteen call sites that consumed them. The registry's
// acceptance criterion is reproducing them to the letter: these are live money screens and
// nobody asked for their behaviour to change.
//
// Rows: delivery, freight, po_number, property_work.
const MATRIX = {
  "DryGoods & Lakeside":  [true,  true,  false, false],
  "Hardware":             [true,  true,  true,  false],
  "Grocery":              [true,  true,  false, false],
  "Property Maintenance": [false, true,  false, true ],
  "Payrolls & Taxes":     [false, false, false, false],
  "Bakery":               [true,  true,  false, false],
  "Meat":                 [true,  true,  false, false],
  "Produce":              [true,  true,  false, false],
  "Others":               [true,  true,  false, false]
};
for (const [dept, [delivery, freight, po, property]] of Object.entries(MATRIX)) {
  t(`${dept}: delivery=${delivery} freight=${freight} po=${po} property=${property}`,
    asks(dept, "delivery") === delivery && asks(dept, "freight") === freight &&
    asks(dept, "po_number") === po && asks(dept, "property_work") === property,
    ["delivery", "freight", "po_number", "property_work"].map(k => `${k}=${asks(dept, k)}`).join(" "));
}

// An unknown department keeps the old regex behaviour: the "not finance" tests included it
// (delivery, freight yes), the /hardware/i and /property/i tests excluded it (po, property
// work no). This is the deliberate difference from vendorFields' fail-open rule, and the
// reason is written in the registry: nothing here can be lost by not being asked, because
// display and edit never consult the map.
t("unknown department: delivery yes, freight yes, po no, property no",
  asks("Garden Centre", "delivery") && asks("Garden Centre", "freight") &&
  !asks("Garden Centre", "po_number") && !asks("Garden Centre", "property_work"));
t("null department behaves like unknown",
  asks(null, "delivery") && asks(null, "freight") && !asks(null, "po_number") && !asks(null, "property_work"));

// The owner's aliases flow through: Chip Stand invoices take Grocery's shape, Checkouts
// takes Others' shape. Before the aliases these two hit the unknown-department row, which
// for INVOICES happens to be identical to Grocery/Others (delivery+freight, no extras), so
// nothing changed for them here; the assertion is that the alias and its target agree.
for (const [alias, target] of [["Chip Stand", "Grocery"], ["Checkouts", "Others"]]) {
  t(`${alias} matches ${target}`,
    ["delivery", "freight", "po_number", "property_work"].every(k => asks(alias, k) === asks(target, k)));
}

// Messy spellings resolve like everywhere else in the app.
t("'hardware store supplies' still gets the PO number", asks("hardware store supplies", "po_number") === true);
t("'Payroll&Taxes' still drops delivery and freight",
  !asks("Payroll&Taxes", "delivery") && !asks("Payroll&Taxes", "freight"));

// The always-on questions are always on, for every department and for unknown ones.
const ALWAYS = ["invoice_number", "invoice_date", "amount", "tax", "filing", "terms", "due_date", "status"];
t("always-on fields are asked everywhere",
  [...Object.keys(MATRIX), "Garden Centre", null].every(d => ALWAYS.every(k => asks(d, k))),
  ALWAYS.join(","));

// An unknown key is false, not a crash: a typo in a call site fails visible (field never
// drawn) rather than throwing mid-form.
t("unknown key is false, not a crash", asks("Grocery", "nonsense") === false);

// Property Maintenance still gets freight. The old code dropped freight only for finance;
// a careless reading of "property has no delivery" would drop its freight too, and a
// contractor's materials delivery charge is a real cost.
t("Property Maintenance keeps the freight charge", asks("Property Maintenance", "freight") === true);

// Every column named in the registry is distinct and belongs to exactly one field, so the
// save paths cannot have two fields fighting over one column.
const cols = R.INVOICE_FIELDS.flatMap(f => f.columns);
t("no column belongs to two fields", new Set(cols).size === cols.length, `${cols.length} columns`);

// THE DELIBERATE DIVERGENCE, pinned. The old three regexes tested the raw name
// independently, so "Property Taxes" was finance AND property at once: delivery hidden,
// freight hidden, contractor block shown. The registry resolves a name ONCE, first match in
// the owner's ORDER, the same way the vendor questions already did. A combined name now
// gets one coherent shape, and the SAME department on its vendor form and its invoice form.
// No seeded department has ever had a multi-pattern name; if one appears and these pins
// fire, the answer is to rename the department or extend ORDER, not to blend shapes.
//
// "Property Taxes": /property/i is ORDER[3], /payroll|tax/i is ORDER[7], so property wins.
t("'Property Taxes' resolves to Property Maintenance whole, not a finance-property blend",
  !asks("Property Taxes", "delivery") && asks("Property Taxes", "freight") &&
  asks("Property Taxes", "property_work") && !asks("Property Taxes", "po_number"),
  ["delivery","freight","property_work","po_number"].map(k => `${k}=${asks("Property Taxes", k)}`).join(" "));
// "Lakeside Hardware": /dry goods|lakeside/i is ORDER[0], beats hardware, so Dry Goods wins
// and there is no PO question. The old code would have shown one.
t("'Lakeside Hardware' resolves to Dry Goods whole, so no PO number",
  asks("Lakeside Hardware", "delivery") && !asks("Lakeside Hardware", "po_number"));

// THE DEPARTMENT FIELDS SCREEN, 2026-10-25. The vendor page now resolves a section to its
// department before asking, and the owner's ticks beat the scopes except on locked questions.
const D = require("./departments.js");
const C = require("./fieldChoices.js");
const DEPTS = [
  { id: "dry", name: "DryGoods & Lakeside", parent_department_id: null },
  { id: "clo", name: "Clothing", parent_department_id: "dry" },
  { id: "gif", name: "Gifts", parent_department_id: "dry" },
  { id: "hw", name: "Hardware", parent_department_id: null },
  { id: "gc", name: "Garden Center", parent_department_id: "hw" },
  { id: "bak", name: "Bakery", parent_department_id: null },
  { id: "pm", name: "Property Maintenance", parent_department_id: null }
];
const KEYS = R.INVOICE_FIELDS.map(f => f.key);
const shapeOf = (name, choices) => KEYS.map(k => `${k}=${R.asksInvoice(name, k, choices)}`).join(" ");
for (const [id, parent] of [["clo", "DryGoods & Lakeside"], ["gif", "DryGoods & Lakeside"], ["gc", "Hardware"]]) {
  const section = DEPTS.find(d => d.id === id).name;
  const top = D.fieldDepartment(id, DEPTS);
  t(`${section} invoices take ${parent}'s shape`, !!top && shapeOf(top.name) === shapeOf(parent));
}
t("Garden Center invoices now ask the PO number, as Hardware's do",
  asks(D.fieldDepartment("gc", DEPTS).name, "po_number") === true && asks("Garden Center", "po_number") === false);

const ROWS = [
  { department_id: "bak", form: "invoice", field_key: "po_number", asked: true },
  { department_id: "bak", form: "invoice", field_key: "delivery", asked: false },
  { department_id: "bak", form: "invoice", field_key: "terms", asked: false },
  { department_id: "bak", form: "invoice", field_key: "amount", asked: false },
  { department_id: "bak", form: "vendor", field_key: "terms", asked: true },
  { department_id: "pm", form: "invoice", field_key: "property_work", asked: false }
];
const bak = C.choicesFor(ROWS, "bak", "invoice");
const EMPTY = C.choicesFor([], "bak", "invoice");
t("no rows means the pinned matrix above, department by department",
  Object.keys(MATRIX).every(d => shapeOf(d, EMPTY) === shapeOf(d)));
t("a tick adds the PO number to Bakery", R.asksInvoice("Bakery", "po_number", bak) === true);
// The add and edit forms test asksInv("delivery") before demanding delivery comments, so an
// untick here also stops the comment being required. One predicate, both paths.
t("an untick removes delivery from Bakery", R.asksInvoice("Bakery", "delivery", bak) === false);
t("terms can be unticked", R.asksInvoice("Bakery", "terms", bak) === false);
t("an untick on amount is ignored", R.asksInvoice("Bakery", "amount", bak) === true);
t("a vendor-form row does not leak into the invoice form", R.asksInvoice("Bakery", "terms", bak) === false);
t("Property Maintenance can drop the contractor block",
  R.asksInvoice("Property Maintenance", "property_work", C.choicesFor(ROWS, "pm", "invoice")) === false);
t("another department's rows change nothing for Bakery",
  shapeOf("Bakery", C.choicesFor(ROWS, "pm", "invoice")) === shapeOf("Bakery"));
const LOCKED = R.INVOICE_FIELDS.filter(f => f.locked);
t("the locked invoice questions are number, date, amount, tax, freight, filing, due date and status",
  LOCKED.map(f => f.key).sort().join(",") === "amount,due_date,filing,freight,invoice_date,invoice_number,status,tax");
// Freight is part of what an invoice owes (invoiceTotal adds a saved freight whatever the
// form shows), so the screen can neither hide it from a department that ships things nor
// add it to Payrolls & Taxes. Its scope is the only answer.
t("every locked question ignores a tick or an untick in every department",
  LOCKED.every(f => Object.keys(MATRIX).every(d =>
    R.asksInvoice(d, f.key, new Map([[f.key, false]])) === asks(d, f.key) &&
    R.asksInvoice(d, f.key, new Map([[f.key, true]])) === asks(d, f.key))));
t("an untick cannot hide freight from Bakery", R.asksInvoice("Bakery", "freight", new Map([["freight", false]])) === true);
t("a tick cannot add freight to Payrolls & Taxes", R.asksInvoice("Payrolls & Taxes", "freight", new Map([["freight", true]])) === false);
t("the unlocked invoice questions are delivery, PO number, property work and terms",
  R.INVOICE_FIELDS.filter(f => !f.locked).map(f => f.key).sort().join(",") === "delivery,po_number,property_work,terms");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
