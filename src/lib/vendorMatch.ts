// Matches the vendor name the invoice reader returned to a vendor on file, for the capture
// screen. No imports, so scripts/extractvalidate-check can run it.
//
// The paper says "Northbay Hardware Supply Ltd." and the vendor list says "Northbay Hardware
// Supply": the same vendor. Names are compared with case, accents, punctuation and a trailing
// company suffix ignored, and "&" read as "and". A suffix is only dropped from the end, so
// "Co-op Feed" keeps its "co".

const SUFFIXES = new Set(["inc", "incorporated", "ltd", "limited", "ltee", "co", "corp", "corporation"]);

export function vendorKey(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    // Apostrophes and periods join, other punctuation separates: "O'Reilly" is "OReilly" and
    // "J.D." is "JD", while "Co-op" stays two words.
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

// The one vendor in the department with the exact name (case and outer spaces aside) wins.
// Otherwise the one whose key matches. Two that match either way leave the vendor unmatched
// rather than picking one, so an order check never runs against the wrong vendor's order.
export function matchVendor<V extends { name: string; department_id: string | null }>(
  vendors: V[],
  departmentId: string,
  typed: string
): V | undefined {
  if (!typed.trim()) return undefined;
  const inDept = vendors.filter((v) => v.department_id === departmentId);
  const exact = inDept.filter((v) => v.name.trim().toLowerCase() === typed.trim().toLowerCase());
  if (exact.length > 1) return undefined;
  if (exact.length === 1) return exact[0];
  const key = vendorKey(typed);
  if (!key) return undefined;
  const hits = inDept.filter((v) => vendorKey(v.name) === key);
  return hits.length === 1 ? hits[0] : undefined;
}
