// Line rules for the capture screen, kept free of React and Supabase so
// scripts/extractvalidate-check can run them.
//
// An amber line is one the invoice reader was unsure of. The figure that matters is the unit
// cost: it is what the store will owe. So only a person retyping that cost clears the flag;
// fixing a description or a quantity does not vouch for a cost the reader got wrong.

import type { LineItem } from "@/lib/types";

// Applies one edit to a line. Confidence goes to 1 only when the patch carries a typed unit
// cost that is a real number above 0. Emptying the box (null), typing something that is not a
// number (NaN), or typing 0 or less leaves the line amber, so it cannot save a blank or $0 cost
// that looks checked; 0 is the reader's own word for a cost it could not read, as in costEntry.
// A cost that really is 0 still saves through the "I checked every amber line" box.
export function editLine(line: LineItem, patch: Partial<LineItem>): LineItem {
  const retypedCost = typeof patch.unit_cost === "number" && Number.isFinite(patch.unit_cost) && patch.unit_cost > 0;
  return { ...line, ...patch, ...(retypedCost ? { confidence: 1 } : {}) };
}

// The receiving_line rows to insert, without the event id. A role that cannot see money never
// saw an amber line's cost, so it cannot have checked it: that cost is saved as null for the
// owner to enter, and the confidence stays as read so the line still shows as unsure. A null
// cost passes the database confidence trigger by design.
export function linesToSave(lines: LineItem[], showMoney: boolean, threshold: number): LineItem[] {
  return lines.map((l) => {
    const low = l.confidence !== null && l.confidence < threshold;
    return {
      description: l.description,
      qty: l.qty,
      unit_cost: !showMoney && low ? null : l.unit_cost,
      retail_price_note: l.retail_price_note,
      confidence: l.confidence
    };
  });
}

// The update for a cost typed later onto a saved line that has none (the feed's "Needs a cost"
// list). Typing it is the same check as retyping it at capture, so confidence goes to 1 and the
// database confidence trigger passes without the event's acknowledgement. Takes "12.50",
// "$12.50" or "1,234.50". Anything else comes back as an error to show under the box:
// - A comma counts only as a thousands separator after a non-zero digit, so "12,50" and
//   "0,500" are refused rather than saved as 1250 or 500.
// - Zero is refused: the invoice reader writes 0 for a cost it could not read, so a typed 0
//   would mark a missing cost as checked.
// - Above MAX_UNIT_COST, or too long to be a real number, is refused as a typing slip.
export const MAX_UNIT_COST = 100000;

export function costEntry(text: string): { unit_cost: number; confidence: number } | { error: string } {
  const cleaned = text.trim().replace(/^\$\s*/, "");
  if (!/^([1-9]\d{0,2}(,\d{3})+|\d+)(\.\d*)?$|^\.\d+$/.test(cleaned)) {
    return { error: "Type the unit cost as a number, like 12.50." };
  }
  const n = Number(cleaned.replace(/,/g, ""));
  if (!Number.isFinite(n) || n > MAX_UNIT_COST) {
    return { error: "That is more than $100,000 for one unit. Check the invoice and retype it." };
  }
  if (n === 0) return { error: "A cost of 0 cannot be saved here. Type the cost from the invoice." };
  return { unit_cost: n, confidence: 1 };
}
