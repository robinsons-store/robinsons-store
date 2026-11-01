// Value checks on what the invoice reader returns.
//
// Structured outputs guarantee the SHAPE of the extraction, not the values: the schema
// cannot express a 0-to-1 bound, a non-negative quantity, or a real calendar date (see the
// note on OUTPUT_SCHEMA in the extract route). A confidence of 7, a quantity of -2, or a date
// of 2026-02-30 would otherwise reach the capture screen looking like a confident read.
//
// The rule is fail closed: any value this has to coerce gets confidence 0 on its line, so it
// lands in the amber band and goes through the existing acknowledgement and the database
// trigger rather than being saved quietly.
//
// Two reads the model can make at its own high confidence are also sent there: a described
// line costed at exactly $0 (the prompt's word for "no cost printed"), and lines that do not
// add up to the pre-tax subtotal printed on the invoice. Nothing else outside the model
// checks the read against the invoice's own figures.

import { failureMessage, type ClaudeResult } from "./anthropic";

export type ExtractedLine = {
  description: string;
  qty: number | null;
  unit_cost: number | null;
  retail_price_note: number | null;
  confidence: number;
};

export type Extraction = {
  vendor: string;
  invoice_date: string;
  notes: string;
  line_items: ExtractedLine[];
};

const MAX_TEXT = 500;

// How far the lines may sit from the printed subtotal before every line goes amber: a few
// cents of rounding on per-unit prices, no more.
const SUBTOTAL_TOLERANCE_CENTS = 5;

export const SUBTOTAL_MISMATCH = "The printed subtotal does not match the lines.";

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

export function normalizeExtraction(parsed: any): { data: Extraction; warnings: string[]; reason?: string } {
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
    // Zero qty stays as read: a backordered line prints 0 shipped. A zero cost is the prompt's
    // "missing" value, so it is never a confident read. Wholly empty lines are gone by now.
    if (unit.value === 0 && confidence > 0) {
      warnings.push(`line ${i + 1}: unit cost read as 0`);
      confidence = 0;
    }
    line_items.push({ description, qty: qty.value, unit_cost: unit.value, retail_price_note: retail.value, confidence });
  });

  const data = { vendor: text(src.vendor), invoice_date, notes: text(src.notes), line_items };
  const reason = subtotalMismatch(src.printed_subtotal, line_items);
  if (!reason) return { data, warnings };
  warnings.push(reason);
  for (const l of line_items) l.confidence = 0;
  return { data, warnings, reason };
}

// The printed goods subtotal against the sum of qty x unit cost, in cents. null when there
// is nothing to compare (no subtotal printed, or no lines); a line with no usable qty or cost
// counts as 0, so it can only make the lines disagree, never hide a mismatch.
function subtotalMismatch(printed: unknown, lines: ExtractedLine[]): string | null {
  if (printed === null || printed === undefined || !lines.length) return null;
  const sub = amount(printed, true);
  if (sub.value === null) return SUBTOTAL_MISMATCH;
  // Summed unrounded and rounded once, as the capture screen totals the lines.
  const cents = Math.round(lines.reduce((sum, l) => sum + (l.qty ?? 0) * (l.unit_cost ?? 0), 0) * 100);
  return Math.abs(cents - Math.round(sub.value * 100)) > SUBTOTAL_TOLERANCE_CENTS ? SUBTOTAL_MISMATCH : null;
}

// Everything the extract route does after the model call, kept free of Next so CI runs it.
// Each failure gets words for the person at the receiving door, never the provider's text.
export function extractReply(result: ClaudeResult): { status: number; body: Record<string, unknown> } {
  if (!result.ok) {
    // A refusal and a cut-off each point at a different fix for the person holding the
    // invoice, a seasonal employee who is never asked to debug.
    if (result.kind === "refusal") {
      return { status: 422, body: { error: "The reader would not process this document. Enter the invoice by hand using Enter manually, and tell the owner which invoice it was." } };
    }
    // Ran out of room. The invoice was read fine, there were just more lines than would fit.
    if (result.kind === "max_tokens") {
      return { status: 422, body: { error: "This invoice is longer than the reader can return in one go. Photograph it in two halves and capture each, or enter it by hand." } };
    }
    return { status: result.kind === "capped" ? 429 : 502, body: { error: `${failureMessage(result.kind)} You can also use Enter manually.` } };
  }

  // Structured outputs should make the fence strip unnecessary. It stays because it costs
  // nothing and this is the path a failed capture blocks the receiving door on.
  const raw = result.text.replace(/```json|```/g, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(JSON.stringify({ ai_call: "extract", outcome: "unparseable", chars: raw.length }));
    return { status: 502, body: { error: "The reader returned something unreadable. Try the photo again, or use Enter manually." } };
  }

  const { data, warnings, reason } = normalizeExtraction(parsed);
  if (warnings.length) console.warn(JSON.stringify({ ai_call: "extract", outcome: "coerced", warnings }));
  return { status: 200, body: { ...data, warnings, ...(reason ? { reason } : {}), model: result.model } };
}

// The formats the reader accepts. Anything else is refused before it costs a model call.
export const EXTRACT_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

// Vercel's request body limit is 4.5 MB; base64 inflates by a third, and the capture screen
// already shrinks photos below this. A payload this large is not one the screen sent.
export const EXTRACT_MAX_BASE64 = 4_400_000;
