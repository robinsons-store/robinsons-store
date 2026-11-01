// The owner's own answer to "which questions does this department get", on top of the code
// lists.
//
// vendorFields.ts and invoiceFields.ts hold the map the owner confirmed on 2026-08-13. Until
// now changing a single tick in it meant a developer and a deploy, which is not what was
// asked for: the request relayed on 2026-10-25 was the ABILITY to select the fields in the
// vendor, payment and invoice profiles per department. The Department fields screen writes
// one row per changed box into the
// department_field table, and this file turns those rows into the overrides the two
// registries read.
//
// THREE RULES, so the screen cannot break a form:
//   1. No row means the code list. An empty table changes nothing anywhere, which is what
//      makes the migration safe to merge before anybody opens the screen.
//   2. A locked question ignores every row. The registries mark the questions a save path
//      depends on (a vendor's name, an invoice's amount and tax) and those are asked
//      whatever the table says.
//   3. A section answers with its department. Clothing and Gifts sit under DryGoods &
//      Lakeside and Garden Center under Hardware; fieldDepartment() in departments.ts walks
//      up to the top, so a section can never be asked something its department was not.
//
// Payment questions are not here yet, on purpose: which payment fields should vary is still
// an open question for the requester.
//
// No Supabase import, so the check scripts can run this file in plain node.

export type FieldForm = "vendor" | "invoice";

/** One row of department_field: one tick box on the Department fields screen. */
export type FieldChoice = {
  id?: string;
  department_id: string;
  form: FieldForm;
  field_key: string;
  asked: boolean;
};

/** Field key to asked, for ONE department and ONE form. Missing key means the code list. */
export type FieldChoices = ReadonlyMap<string, boolean>;

export const NO_CHOICES: FieldChoices = new Map();

/** The choices that apply to one department's form. */
export function choicesFor(
  rows: FieldChoice[],
  departmentId: string | null | undefined,
  form: FieldForm
): FieldChoices {
  if (!departmentId || !rows.length) return NO_CHOICES;
  const out = new Map<string, boolean>();
  for (const r of rows) {
    if (r.department_id === departmentId && r.form === form) out.set(r.field_key, r.asked);
  }
  return out;
}

/** The columns every read of department_field needs. */
export const FIELD_CHOICE_SELECT = "id, department_id, form, field_key, asked";
