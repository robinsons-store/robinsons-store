// Value checks on what the invoice reader returns.
//
// Structured outputs guarantee the SHAPE of the extraction, not the values: the schema
// cannot express a 0-to-1 bound, a non-negative quantity, or a real calendar date (see the
// note on OUTPUT_SCHEMA in the extract route). A confidence of 7, a quantity of -2, or a date
// of 2026-02-30 would otherwise reach the capture screen looking like a confident read.
//
// The rule is fail closed: any value this has to coerce gets confidence 0 on its line, so it
// lands in the amber band and goes through the existing acknowledgement and the database
// trigger rather than being saved quietly. The lines are also added up and compared with the
// totals printed on the invoice (checkTotals below), which the capture screen reruns live.

export type ExtractedLine = {
  description: string;
  qty: number | null;
  unit_cost: number | null;
  retail_price_note: number | null;
  confidence: number;
};

export type PrintedTotals = {
  printed_subtotal: number | null;
  printed_hst: number | null;
  printed_total: number | null;
};

export type Extraction = PrintedTotals & {
  vendor: string;
  invoice_number: string;
  invoice_date: string;
  notes: string;
  line_items: ExtractedLine[];
  // A printed subtotal, HST or total was not a usable number and was left blank.
  printed_unreadable: boolean;
  // The lines do not add up to the figures printed on the paper (checkTotals). The capture
  // screen makes a person acknowledge it before saving.
  totals_mismatch: boolean;
};

const MAX_TEXT = 500;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "";
}

function realDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// null means "not a usable amount"; the caller decides what that does to confidence.
function amount(v: unknown, nullable: boolean): { value: number | null; coerced: boolean } {
  if (v === null || v === undefined) return { value: null, coerced: !nullable };
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return { value: null, coerced: true };
  return { value: n, coerced: typeof v !== "number" };
}

// ---------- the printed totals ----------
//
// Confidence is the reader's own opinion of its work. The subtotal printed on the invoice is
// not: if qty x unit cost over the lines does not come to it, a line was misread, missed or
// invented, however sure the reader says it was.

// A few cents covers per-line rounding on the vendor's side.
export const TOTALS_TOLERANCE = 0.05;
// Ontario HST. The capture screen passes the live rate from tax_rules instead.
export const HST_RATE = 0.13;

export type TotalsCheck = {
  // Sum of qty x unit cost, a missing qty or cost counting as 0, as the capture screen adds it.
  computed: number;
  // unchecked: nothing printed to compare against.
  status: "match" | "mismatch" | "unchecked";
  against: "subtotal" | "total" | null;
  printed: number | null;
  // The lines make the printed total as it stands: prices that include tax. The tax is
  // inside the lines, so it must not be added on top, and the pre-tax goods are the lines
  // less the tax at the rate.
  taxIncluded: boolean;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// The lines match when they make the printed subtotal, or the printed total less the tax. A
// misread subtotal is forgiven when the total still agrees with the lines. The tax is the one
// printed when there is one (0.00 on zero-rated goods included); HST at the rate is assumed
// only when none is printed. Lines that make the total as printed (prices that include tax)
// count only on paper that prints no subtotal and no tax: otherwise they are lines with a tax
// row read as a purchase. On a mismatch the subtotal is the figure reported.
//
// unreadable: one of the printed figures was not a usable number and is null here. It may
// have been the tax or the subtotal, so only the printed subtotal itself can vouch for the
// lines; anything else is a mismatch, nothing printed to check included.
export function checkTotals(
  lines: { qty: number | null; unit_cost: number | null }[],
  printed: PrintedTotals,
  taxRate: number = HST_RATE,
  unreadable = false
): TotalsCheck {
  const computed = round2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0));
  const { printed_subtotal: sub, printed_hst: hst, printed_total: total } = printed;
  const near = (n: number) => Math.abs(computed - n) <= TOTALS_TOLERANCE + 1e-9;
  if (sub !== null && near(sub)) return { computed, status: "match", against: "subtotal", printed: sub, taxIncluded: false };
  if (!unreadable && sub === null && total === null) return { computed, status: "unchecked", against: null, printed: null, taxIncluded: false };
  if (!unreadable && total !== null) {
    if (near(hst !== null ? total - hst : total / (1 + taxRate)))
      return { computed, status: "match", against: "total", printed: total, taxIncluded: false };
    if (sub === null && hst === null && near(total))
      return { computed, status: "match", against: "total", printed: total, taxIncluded: true };
  }
  if (sub !== null) return { computed, status: "mismatch", against: "subtotal", printed: sub, taxIncluded: false };
  return total !== null
    ? { computed, status: "mismatch", against: "total", printed: total, taxIncluded: false }
    : { computed, status: "mismatch", against: null, printed: null, taxIncluded: false };
}

// An invoice number is a short label, not a sentence. One with a dollar sign or an amount in
// it, over 40 characters or over four words is left blank: it goes into the notes, which
// staff see, so reader text carrying a money figure must not get there this way.
function invoiceNumber(v: unknown, warnings: string[]): string {
  const s = text(v);
  if (s && (s.length > 40 || s.split(/\s+/).length > 4 || /\$|\d[.,]\d{2}(?!\d)/.test(s))) {
    warnings.push("invoice number did not look like one; left blank");
    return "";
  }
  return s;
}

export function normalizeExtraction(parsed: any): { data: Extraction; warnings: string[] } {
  const warnings: string[] = [];
  const src = parsed && typeof parsed === "object" ? parsed : {};

  let invoice_date = text(src.invoice_date);
  if (invoice_date && !realDate(invoice_date)) {
    warnings.push(`invoice date "${invoice_date}" is not a real date; left blank`);
    invoice_date = "";
  }

  const rawLines: any[] = Array.isArray(src.line_items) ? src.line_items : [];
  const line_items: ExtractedLine[] = [];
  rawLines.forEach((l, i) => {
    const line = l && typeof l === "object" ? l : {};
    const description = text(line.description);
    const qty = amount(line.qty, false);
    const unit = amount(line.unit_cost, false);
    const retail = amount(line.retail_price_note, true);

    // A line with nothing on it is noise from the reader, not a line to acknowledge.
    if (!description && !qty.value && !unit.value && retail.value === null) return;

    let confidence = typeof line.confidence === "number" && Number.isFinite(line.confidence) ? line.confidence : 0;
    if (confidence < 0 || confidence > 1) {
      warnings.push(`line ${i + 1}: confidence ${confidence} outside 0 to 1`);
      confidence = 0;
    }
    if (qty.coerced || unit.coerced || retail.coerced) {
      warnings.push(`line ${i + 1}: a quantity or price was not a usable number`);
      confidence = 0;
    }
    line_items.push({ description, qty: qty.value, unit_cost: unit.value, retail_price_note: retail.value, confidence });
  });

  // A printed figure that is not a usable number (a negative one included: a credit note
  // needs a person anyway) is left blank, and the check fails closed unless the lines make the
  // printed subtotal (see checkTotals).
  let unreadable = false;
  const printedAmount = (field: keyof PrintedTotals, label: string): number | null => {
    const a = amount(src[field], true);
    if (a.coerced) {
      warnings.push(`printed ${label} was not a usable number${a.value === null ? "; left blank" : ""}`);
      if (a.value === null) unreadable = true;
    }
    return a.value;
  };
  const printed: PrintedTotals = {
    printed_subtotal: printedAmount("printed_subtotal", "subtotal"),
    printed_hst: printedAmount("printed_hst", "HST"),
    printed_total: printedAmount("printed_total", "total")
  };

  const totals = checkTotals(line_items, printed, HST_RATE, unreadable);
  if (totals.status === "mismatch") {
    warnings.push(
      unreadable && totals.against !== "subtotal"
        ? "the lines could not be checked against the printed totals; check each qty and unit cost against the paper"
        : `the lines do not add up to the printed ${totals.against}; check each qty and unit cost against the paper`
    );
  }

  return {
    data: {
      vendor: text(src.vendor),
      invoice_number: invoiceNumber(src.invoice_number, warnings),
      invoice_date,
      notes: text(src.notes),
      ...printed,
      line_items,
      printed_unreadable: unreadable,
      totals_mismatch: totals.status === "mismatch"
    },
    warnings
  };
}

// The formats the reader accepts. Anything else is refused before it costs a model call.
export const EXTRACT_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

// Vercel's request body limit is 4.5 MB; base64 inflates by a third, and the capture screen
// already shrinks photos below this. A payload this large is not one the screen sent.
export const EXTRACT_MAX_BASE64 = 4_400_000;
