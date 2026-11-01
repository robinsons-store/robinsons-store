// What a vendor IS, defined once, per department.
//
// Before this file, every screen decided for itself which vendor columns to load and which
// to draw. Eight places queried the vendor table and no two asked for the same set, so
// Ask-the-store told the owner a summer order timeline was "not on file" when it was, and
// the add-vendor form asked a bakery about gift shows.
//
// The owner's point, recorded verbatim in docs/OWNER_NOTES.md line 367 on 2026-07-27:
//
//     "fields differ BY DEPARTMENT, the owner's core point"
//
// His own workbook has never used one shape. Bakery, Meat and Store Supplies run what that
// note calls "the light form"; Grocery carries the full merchandise shape; Hardware is
// Grocery plus a PO number; Maintenance Payments keeps who the contractor is and what they
// specialize in.
//
// HOW TO CHANGE THE MAP. Only the owner changes it on the Department fields screen (Admin).
// Managers can read it. Ticks are stored in department_field and passed here as `choices`
// (fieldChoices.ts). The `departments` line on each field below is now the
// USUAL answer, what a department gets until somebody changes a box, and it is still DATA: a
// new default is one edit to one array. A field marked `locked` ignores the screen.
//
// The map was seeded from his workbook census as a guess, and on 2026-08-13 he marked up the
// table in docs/owner-notes/vendor-fields-requirement.html and confirmed every line of it,
// including the two I flagged as least certain. It is now his answer, not my guess.
//
// TWO RULES THAT MAKE A WRONG GUESS SAFE:
//   1. Hiding a question never hides an answer. `visibleFacts` returns anything with a value
//      whatever the department map says, so a bakery vendor that already has a summer order
//      timeline still shows it. Data never becomes unreachable because of a guess here.
//   2. A department this file does not recognise gets EVERYTHING. Anything new somebody adds
//      is a real part of the store and must not lose fields for not being on a list.
//      (Chip Stand and Checkouts USED to be the example here. On 2026-08-13 the owner said
//      they follow Grocery and Others, so departments.ts now recognises them and they are no
//      longer the unrecognised case.)

import type { Vendor } from "@/lib/types";
import { canonicalDepartment } from "@/lib/departments";
import type { FieldChoices } from "@/lib/fieldChoices";
import { minimumOrderLabel, orderLocationLabel, REORDER_STATUS } from "@/lib/vendorOrdering";

export type VendorFieldGroup = "identity" | "contact" | "trade" | "ordering" | "service";

/** `"all"` means every department asks it. An array is the exact canonical labels. */
export type DepartmentScope = "all" | string[];

export type VendorField = {
  key: string;
  /** The owner's words. This is what appears on screen and in the AI's context. */
  label: string;
  group: VendorFieldGroup;
  /** A dollar figure, so it hides from anyone who cannot see money. */
  money: boolean;
  /** Columns a select must fetch for `value` to work. Drives vendorSelect(). */
  columns: string[];
  departments: DepartmentScope;
  /** The answer as one readable line, or null when nothing is on file. */
  value: (v: any) => string | null;
  /** A second line under the answer, for facts that are really two columns. */
  detail?: (v: any) => string | null;
  /** Shown even when blank, because its absence is itself information. */
  alwaysShow?: boolean;
  /**
   * Asked of every department whatever the Department fields screen says, because a save
   * path depends on it. Only meaningful with `departments: "all"`.
   */
  locked?: boolean;
};

const MERCHANDISE = ["DryGoods & Lakeside", "Hardware", "Grocery"];
const HAS_A_REP = ["DryGoods & Lakeside", "Hardware", "Grocery", "Property Maintenance"];

function text(s: unknown): string | null {
  const t = typeof s === "string" ? s.trim() : "";
  return t ? t : null;
}

export const VENDOR_FIELDS: VendorField[] = [
  {
    key: "name",
    label: "Company or vendor name",
    group: "identity",
    money: false,
    columns: ["name"],
    departments: "all",
    value: (v) => text(v.name),
    alwaysShow: true,
    // Both vendor forms refuse to save without it.
    locked: true
  },
  {
    key: "status",
    label: "Status",
    group: "identity",
    money: false,
    columns: ["status"],
    departments: "all",
    // Shown even when blank: "we stopped buying from them" is worth seeing on every vendor,
    // and a bankrupt supplier is not a detail to leave off a light form.
    value: (v) => text(v.status),
    alwaysShow: true,
    // Every save writes it, and the directory chips and Ask-the-store read it.
    locked: true
  },
  {
    key: "phone",
    label: "Phone",
    group: "contact",
    money: false,
    columns: ["phone"],
    departments: "all",
    value: (v) => text(v.phone)
  },
  {
    key: "email",
    label: "Email",
    group: "contact",
    money: false,
    columns: ["email"],
    departments: "all",
    value: (v) => text(v.email)
  },
  {
    key: "notes",
    label: "Notes and rules",
    group: "identity",
    money: false,
    columns: ["notes"],
    departments: "all",
    value: (v) => text(v.notes)
  },
  {
    key: "rep_name",
    // "Technician" on the maintenance side is the same column with a different word; the
    // label follows the department in labelFor() below.
    label: "Rep name",
    group: "contact",
    money: false,
    columns: ["rep_name"],
    departments: HAS_A_REP,
    value: (v) => text(v.rep_name)
  },
  {
    key: "default_terms",
    label: "Payment terms",
    group: "trade",
    money: false,
    // Terms appear on the owner's LocalVendors tab and on the merchandise tabs, not on the
    // light form. CONFIRMED by the owner on 2026-08-13: he was asked directly whether a meat
    // supplier has terms worth recording and left it unticked.
    columns: ["default_terms"],
    departments: [...MERCHANDISE, "Property Maintenance"],
    value: (v) => text(v.default_terms)
  },
  {
    key: "products_we_carry",
    // His Grocery tab calls this TypeOfGoods.
    label: "Products we carry",
    group: "trade",
    money: false,
    columns: ["products_we_carry"],
    departments: MERCHANDISE,
    value: (v) => text(v.products_we_carry)
  },
  {
    key: "minimum_order",
    label: "Minimum order",
    group: "ordering",
    money: true,
    columns: ["minimum_order_amount", "no_minimum_order"],
    departments: MERCHANDISE,
    value: (v) => minimumOrderLabel(v)
  },
  {
    key: "reorder",
    label: "Reorder status",
    group: "ordering",
    money: false,
    columns: ["reorder_status", "reorder_comments"],
    departments: MERCHANDISE,
    value: (v) =>
      v.reorder_status
        ? REORDER_STATUS.find((r) => r.value === v.reorder_status)?.label ?? text(v.reorder_status)
        : null,
    detail: (v) => (v.reorder_status ? text(v.reorder_comments) : null)
  },
  {
    key: "order_location",
    label: "Location of the order",
    group: "ordering",
    money: false,
    // Two columns, one fact: the free text behind "Other" replaces the bare word.
    columns: ["order_location", "order_location_other"],
    departments: ["DryGoods & Lakeside", "Hardware"],
    value: (v) => orderLocationLabel(v.order_location, v.order_location_other)
  },
  {
    key: "specializes_in",
    // His MaintenancePayments tab calls this SpecilizedOn.
    label: "Specializes in",
    group: "service",
    money: false,
    columns: ["specializes_in"],
    // Property Maintenance only, ticked by the owner on 2026-08-13. Until now the trade was
    // recorded on each invoice and never against the contractor, so there was no way to
    // answer "who is our electrician", which is the question you ask when a freezer fails on
    // a Saturday.
    departments: ["Property Maintenance"],
    value: (v) => text(v.specializes_in)
  },
  {
    key: "summer_order_timeline",
    label: "Summer order timeline",
    group: "ordering",
    money: false,
    columns: ["summer_order_timeline"],
    // From the bookings workbook, which is the gift and clothing side. CONFIRMED by the owner
    // on 2026-08-13: he was asked directly whether Hardware should have it for garden stock
    // and left it Dry Goods only.
    departments: ["DryGoods & Lakeside"],
    value: (v) => text(v.summer_order_timeline)
  }
];

/** Maintenance calls the same person a technician, and specializes in a trade. */
export function labelFor(field: VendorField, departmentName: string | null | undefined): string {
  if (field.key === "rep_name" && canonicalDepartment(departmentName) === "Property Maintenance") {
    return "Technician name";
  }
  return field.label;
}

/**
 * The label for one field key in this department.
 *
 * A form draws a label before it has a VendorField in hand, and the alternative is each form
 * hard-coding "Technician name" for maintenance, which is how the two vendor screens started
 * disagreeing in the first place.
 */
export function labelForKey(key: string, departmentName: string | null | undefined): string {
  const field = VENDOR_FIELDS.find((f) => f.key === key);
  return field ? labelFor(field, departmentName) : key;
}

function appliesTo(
  field: VendorField,
  departmentName: string | null | undefined,
  choices?: FieldChoices
): boolean {
  // No department is "ask everything": the button that puts every question back passes null
  // on purpose, and a vendor not filed anywhere yet has no department to have chosen for.
  // Nothing on the Department fields screen overrides it.
  if (!(departmentName || "").trim()) return true;
  // The owner's tick on the Department fields screen beats the code list, except on a locked
  // question, which a save path depends on.
  if (!field.locked) {
    const chosen = choices?.get(field.key);
    if (chosen !== undefined) return chosen;
  }
  if (field.departments === "all") return true;
  const canon = canonicalDepartment(departmentName);
  // Rule 2: an unrecognised department (Chip Stand, Checkouts, anything new) gets every
  // question rather than silently losing them.
  if (!canon) return true;
  return field.departments.includes(canon);
}

/**
 * The questions to ASK on a blank form for this department.
 * Money fields drop out entirely for a role that cannot see money, because a required field
 * nobody can see is a form that cannot be submitted.
 */
export function fieldsForEntry(
  departmentName: string | null | undefined,
  opts: { showMoney: boolean; group?: VendorFieldGroup; choices?: FieldChoices }
): VendorField[] {
  return VENDOR_FIELDS.filter(
    (f) =>
      appliesTo(f, departmentName, opts.choices) &&
      (!f.money || opts.showMoney) &&
      (!opts.group || f.group === opts.group)
  );
}

/**
 * How many questions this department is not asked.
 *
 * The number on the button that puts them back. The map below is the owner's best guess at
 * what each department needs, and a guess must never be the reason somebody cannot record a
 * true thing about a real vendor: every form that hides a question also offers it.
 *
 * Money-gated fields are not counted, because a field hidden by the role is not one any
 * button should offer.
 */
export function hiddenFieldCount(
  departmentName: string | null | undefined,
  opts: { showMoney: boolean; choices?: FieldChoices }
): number {
  return fieldsForEntry(null, opts).length - fieldsForEntry(departmentName, opts).length;
}

/**
 * Is this department asked this question on a blank form?
 *
 * Rendering and validation MUST both go through this. If a form hides the minimum order for
 * a bakery while the save path still demands one, that bakery can never be saved, and the
 * person at the counter gets an error pointing at a box that is not on their screen. One
 * predicate, used by both, is what stops those two answers drifting apart.
 *
 * Passing null for the department is how a form offers every question at once: null means
 * "ask everything", and no choice on the Department fields screen overrides it.
 *
 * `choices` are that screen's ticks for this department (choicesFor in fieldChoices.ts).
 * The money gate is checked first and cannot be ticked back on: a role that cannot see money
 * is never asked a money question.
 */
export function asksFor(
  departmentName: string | null | undefined,
  key: string,
  opts: { showMoney: boolean; choices?: FieldChoices }
): boolean {
  const field = VENDOR_FIELDS.find((f) => f.key === key);
  if (!field) return false;
  if (field.money && !opts.showMoney) return false;
  return appliesTo(field, departmentName, opts.choices);
}

/**
 * What the code list alone says, before any choice on the Department fields screen.
 * That screen shows it as "usual" so the owner can see what a box was before it changed.
 */
export function asksByDefault(departmentName: string | null | undefined, key: string): boolean {
  const field = VENDOR_FIELDS.find((f) => f.key === key);
  return !!field && appliesTo(field, departmentName);
}

export type VendorFact = { field: VendorField; label: string; text: string; detail: string | null };

/** What a field marked alwaysShow reads as before anybody has answered it. */
export const NOT_ON_FILE = "Not on file";

/**
 * The facts to SHOW for a saved vendor.
 *
 * Rule 1 lives here: a field carrying an answer is returned even when the department map
 * says its department is not asked that question. Hiding a question must never hide an
 * answer, or a vendor recorded before a map change would appear to have lost data.
 *
 * `departmentName` is the department whose questions apply, when the caller has resolved a
 * section to its parent (fieldDepartment in departments.ts). It falls back to the vendor's
 * own joined department.
 */
export function visibleFacts(
  vendor: any,
  opts: { showMoney: boolean; group?: VendorFieldGroup; departmentName?: string | null; choices?: FieldChoices }
): VendorFact[] {
  const departmentName = opts.departmentName !== undefined ? opts.departmentName : vendor?.department?.name ?? null;
  const out: VendorFact[] = [];
  for (const f of VENDOR_FIELDS) {
    if (opts.group && f.group !== opts.group) continue;
    // The money gate is absolute and is checked before anything else: it is the one rule
    // here that fails closed rather than open.
    if (f.money && !opts.showMoney) continue;
    const value = f.value(vendor);
    // alwaysShow means the blank itself is information: a vendor with no status recorded is
    // worth seeing as blank rather than dropped off the list. It still obeys the department
    // map, so an unasked question never appears as an empty row. Everything else waits until
    // it has an answer, because a column of "not on file" across 130 vendors is just noise.
    //
    // The second half of this used to be `if (value === null) continue`, which made the flag
    // do nothing at all. No screen had noticed because no ordering field sets it.
    if (value === null && !(f.alwaysShow && appliesTo(f, departmentName, opts.choices))) continue;
    out.push({
      field: f,
      label: labelFor(f, departmentName),
      text: value ?? NOT_ON_FILE,
      detail: f.detail?.(vendor) ?? null
    });
  }
  return out;
}

/**
 * The select string for the vendor table, derived from the registry.
 *
 * This is what stops the eight hand-written selects drifting apart again. It always fetches
 * every field's columns regardless of department, because a vendor's department can be
 * changed after the row is written and rule 1 needs the data present to honour it.
 */
export function vendorSelect(extra: string[] = []): string {
  const cols = new Set<string>(["id", "store_id", "department_id", ...extra]);
  for (const f of VENDOR_FIELDS) for (const c of f.columns) cols.add(c);
  return [...cols].join(", ");
}
