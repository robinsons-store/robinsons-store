// The order the store thinks in. Every department list and dropdown follows it, so the
// app reads the same way on every screen instead of falling back to alphabetical (which
// put Bakery above Hardware and buried Property Maintenance in the middle).
//
// The owner set this sequence on 2026-07-27 (SCRUM-9). Matching is by pattern, not exact
// text, because the same department is spelled several ways across the sheets and the two
// stores ("Payrolls & Taxes" and "Payroll&Taxes" are the same thing). A department that
// matches nothing keeps working and simply sorts after the named ones, alphabetically:
// nothing ever disappears from a list because it was not on this list.

const ORDER: { label: string; match: RegExp }[] = [
  { label: "DryGoods & Lakeside", match: /dry\s*goods|lakeside/i },
  { label: "Hardware", match: /hardware/i },
  { label: "Grocery", match: /grocer/i },
  { label: "Property Maintenance", match: /property/i },
  { label: "Bakery", match: /baker/i },
  { label: "Meat", match: /meat/i },
  { label: "Produce", match: /produce/i },
  { label: "Payrolls & Taxes", match: /payroll|tax/i },
  { label: "Others", match: /^other/i }
];

// The owner's sequence as plain labels, for docs and for any screen that needs the list
// itself rather than a sort.
export const DEPARTMENT_ORDER = ORDER.map((o) => o.label);

// The canonical label a department name matches, or null when it matches nothing. Used by
// anything that needs to key behaviour off a department rather than just sort by it, so
// that "Dry Goods", "DryGoods & Lakeside" and "lakeside" all resolve to one answer instead
// of each caller inventing its own string comparison.
//
// Null is meaningful and callers must handle it: Chip Stand and Checkouts match nothing
// here and still exist in the store. Anything keying off this should fail OPEN for null,
// never hide something because a department was not on a list.
// Parts of the store that are not departments in their own right, but behave exactly like
// one that is. The owner settled these on 2026-08-13 in the vendor questions document:
// "Chip Stand follows Grocery, and Checkouts follows Others, unless you say otherwise."
//
// This is deliberately SEPARATE from ORDER. These two still sort and display under their own
// names, because that is what people call them. All this decides is which set of questions
// they inherit. Folding them into ORDER would rename them on every screen.
const FOLLOWS: { match: RegExp; label: string }[] = [
  { match: /chip\s*stand/i, label: "Grocery" },
  { match: /checkout/i, label: "Others" }
];

export function canonicalDepartment(name: string | null | undefined): string | null {
  const n = (name || "").trim();
  if (!n) return null;
  const hit = ORDER.find((o) => o.match.test(n));
  if (hit) return hit.label;
  // Before giving up and failing open, check whether this is one of the two the owner told
  // us to treat as another department. Without this they match nothing, fall through to the
  // unrecognised case, and are asked every question there is, which is the opposite of what
  // he asked for.
  const follows = FOLLOWS.find((f) => f.match.test(n));
  return follows ? follows.label : null;
}

// Where a department sits in the owner's sequence. Unlisted departments share the last
// rank, so the comparator falls through to their name.
export function departmentRank(name: string | null | undefined): number {
  const n = (name || "").trim();
  if (!n) return ORDER.length;
  const i = ORDER.findIndex((o) => o.match.test(n));
  return i === -1 ? ORDER.length : i;
}

// Comparator for anything with a name: the owner's sequence first, then alphabetical
// inside the leftovers.
export function byDepartmentOrder<T extends { name: string | null }>(a: T, b: T): number {
  const d = departmentRank(a.name) - departmentRank(b.name);
  return d !== 0 ? d : (a.name || "").localeCompare(b.name || "");
}

export type DepartmentNode = { id: string; name: string; parent_department_id: string | null };

// The department whose questions a department's forms ask: itself, or for a section such as
// Gifts, the department it sits under. The field registries and the Department fields
// screen key on this, so a section is never asked something its department was not.
//
// Walks to the top rather than one step, and stops on a loop or on a parent that did not
// load, answering with the highest department it could reach. Null only when the id itself
// is not in the list, and callers fall back to the name they already have.
export function fieldDepartment<T extends DepartmentNode>(
  id: string | null | undefined,
  departments: T[]
): T | null {
  if (!id) return null;
  const byId = new Map(departments.map((d) => [d.id, d]));
  let d = byId.get(id);
  if (!d) return null;
  const seen = new Set<string>([d.id]);
  while (d.parent_department_id) {
    const p = byId.get(d.parent_department_id);
    if (!p || seen.has(p.id)) break;
    seen.add(p.id);
    d = p;
  }
  return d;
}

// Sort without mutating the caller's array (React state arrays are shared).
export function sortDepartments<T extends { name: string | null }>(list: T[]): T[] {
  return [...list].sort(byDepartmentOrder);
}
