// Which invoice questions each department is asked, defined once.
//
// This is the vendor field registry's pattern applied to the invoice forms, proposed by
// Ravi Maddipati on 2026-08-13: "allowing fields such as vendor, payment, and purchase
// order fields to be selected by department ... would eliminate the need to develop each
// department's payment screen individually."
//
// He is right, and the proof was already in this codebase before anything here was written.
// The invoice forms have varied by department for weeks, through three hand-coded booleans
// (isPropertyDept, isFinanceDept, isHardwareDept) sprinkled across nineteen call sites in
// one thousand-line file. Hand-maintained conditionals drift: by the time this file was
// written, the EDIT form nulled a saved PO number on any invoice whose vendor was not
// Hardware, and nulled a saved service category on any invoice whose vendor was not
// Property Maintenance, while preserving the estimate number beside them. Fixing an amount
// could silently erase a filing detail. That inconsistency is the argument for a registry,
// made by the code itself.
//
// ONE CORRECTION TO THE PROPOSAL, recorded so the scope is honest: what varies by
// department is the INVOICE (and someday the purchase order), never the payment. Recording
// a payment is the engine's shape, identical for every department by design, because
// record_payment/void_payment/edit_payment are one atomic contract. This registry
// deliberately has no reach into the payment forms, and must never grow one.
//
// WHY THE SCOPE RULES DIFFER FROM vendorFields.ts. The vendor registry fails OPEN: an
// unknown department is asked everything, because losing a question means a fact cannot be
// recorded. Here the acceptance criterion is different: these are live money screens nobody
// asked to change, so the registry reproduces the old booleans' behaviour exactly for every
// department name that matches at most ONE pattern, which is all fourteen departments the
// store has ever seeded and every spelling in the owner's workbooks. The old behaviour for
// an unknown department was: delivery yes, freight yes, PO no, property work no. This file
// has two scope kinds:
//
//   { except: [...] }  everyone but these. Unknown departments are included, as the old
//                      "not finance" tests included them.
//   { only: [...] }    strictly these. Unknown departments are excluded, as the old
//                      /hardware/i test excluded them.
//
// ONE DELIBERATE DIVERGENCE, found by the review that checked this file against the old
// truth table: a department name matching TWO patterns, "Property Taxes" or "Lakeside
// Hardware", resolves here to ONE department (the first match in the owner's ORDER), where
// the old independent booleans would have applied two departments' shapes to the same
// invoice at once, hiding delivery as finance while adding the contractor block as
// property. No real department has ever had such a name, and the vendor questions already
// resolve names this way, so a combined name now gets ONE coherent shape and the SAME
// department on both its vendor form and its invoice form, instead of a blend no one
// designed. The multi-pattern cases are pinned in scripts/invoicefields-check as chosen
// behaviour, not an accident.
//
// A wrong guess is still recoverable, for the same reason as the vendor registry's rule 1:
// the invoice DISPLAY never consults this file. A saved answer shows whatever the map says,
// and the edit form writes hidden answers back rather than nulling them, so no map edit can
// destroy or strand data. Changing this map changes which questions get asked, nothing else.

// THE DEPARTMENT FIELDS SCREEN, added 2026-10-25. The scopes below are now the USUAL answer.
// The owner can change any unlocked question per department; managers can read the choices.
// The owner's ticks arrive here as `choices` (fieldChoices.ts). The locked questions are the
// ones what-is-owed and the filing rule depend on: number, date, amount, tax, freight,
// filing, due date and status. The screen cannot change them, because hiding one would let
// an invoice save without the facts that decide what the store owes and when. Freight keeps
// its scope (not asked of Payrolls & Taxes): invoiceTotal adds a saved freight whatever the
// form shows, so a department that could untick it would owe a figure nobody can see or fix.

import { canonicalDepartment } from "@/lib/departments";
import type { FieldChoices } from "@/lib/fieldChoices";

export type InvoiceScope = "all" | { only: string[] } | { except: string[] };

export type InvoiceFieldDef = {
  key: string;
  /** What the group is called when people talk about it. */
  label: string;
  /** The invoice columns this group covers. Documentation and test surface, like vendorFields. */
  columns: string[];
  scope: InvoiceScope;
  /** The Department fields screen cannot change it: the scope below is the only answer. */
  locked?: boolean;
};

export const INVOICE_FIELDS: InvoiceFieldDef[] = [
  { key: "invoice_number", label: "Invoice number", columns: ["invoice_number"], scope: "all", locked: true },
  { key: "invoice_date", label: "Invoice date", columns: ["invoice_date"], scope: "all", locked: true },
  { key: "amount", label: "Invoice subtotal", columns: ["amount"], scope: "all", locked: true },
  { key: "tax", label: "Tax", columns: ["tax_mode", "hst_amount"], scope: "all", locked: true },
  {
    key: "freight",
    label: "Freight charge",
    columns: ["freight_charges"],
    // A payroll remittance or an incorporation tax has nothing shipped, so freight on the
    // Payrolls & Taxes form was only noise. Everyone else ships things.
    scope: { except: ["Payrolls & Taxes"] },
    // Part of what the invoice owes (invoiceTotal), so not the screen's to hide.
    locked: true
  },
  {
    key: "delivery",
    label: "Delivery",
    columns: ["delivery_status", "delivered_date", "delivery_comments"],
    // Nothing arrives on a CRA remittance, and a contractor's work is not a shipment. The
    // owner's spec: delivery status, the day it came, and comments for short shipments and
    // damage, on the invoices where goods actually arrive.
    //
    // Delivery comments are REQUIRED wherever this is asked (N/A is the honest blank), so
    // the form and the validation MUST both read this predicate. If they ever disagree, a
    // department gets a mandatory box that is not on its screen and its invoices cannot be
    // saved. That is the vendor registry's hardest-won lesson, inherited here.
    scope: { except: ["Property Maintenance", "Payrolls & Taxes"] }
  },
  {
    key: "po_number",
    label: "PO number",
    columns: ["po_number"],
    // SCRUM-9 AC 2: Hardware invoices carry the purchase order number.
    scope: { only: ["Hardware"] }
  },
  {
    key: "property_work",
    label: "Property Maintenance work",
    columns: ["estimate_number", "work_type", "service_category", "work_description"],
    // The contractor block: estimate number when the work was preplanned, the type of work,
    // the trade, and what was actually done.
    scope: { only: ["Property Maintenance"] }
  },
  { key: "filing", label: "Final invoice filing", columns: ["invoice_filing", "digital_file_location"], scope: "all", locked: true },
  { key: "terms", label: "Terms", columns: ["terms"], scope: "all" },
  { key: "due_date", label: "Due date", columns: ["due_date"], scope: "all", locked: true },
  { key: "status", label: "Payment status", columns: ["status"], scope: "all", locked: true }
];

/**
 * Is this department's invoice form asked this question?
 *
 * The form's rendering, its validation, and the add path's decision to write null all go
 * through here, so they cannot drift apart the way the three hand-coded booleans did.
 *
 * Sections and aliases resolve through canonicalDepartment, so a vendor filed under Chip
 * Stand gets Grocery's invoice shape, exactly as it gets Grocery's vendor questions. A
 * section such as Gifts is resolved to its department by the caller (fieldDepartment), so
 * it gets DryGoods & Lakeside's shape rather than the unknown-department one.
 *
 * `choices` are the Department fields screen's ticks for this department. They beat the
 * scope below on every question except a locked one.
 */
export function asksInvoice(
  departmentName: string | null | undefined,
  key: string,
  choices?: FieldChoices
): boolean {
  const field = INVOICE_FIELDS.find((f) => f.key === key);
  if (!field) return false;
  if (!field.locked) {
    const chosen = choices?.get(key);
    if (chosen !== undefined) return chosen;
  }
  if (field.scope === "all") return true;
  const canon = canonicalDepartment(departmentName);
  if ("only" in field.scope) {
    // Strict: a department this file cannot place does not get another department's special
    // fields. Matches the old /hardware/i behaviour for every single-pattern name, and it is
    // safe to be strict because every field here is optional: nothing is lost by not being
    // asked, and a saved answer still shows and still survives edits.
    return canon !== null && field.scope.only.includes(canon);
  }
  // except: unknown departments are included, as "not the finance department" always
  // included them.
  return canon === null || !field.scope.except.includes(canon);
}
