import { NextRequest, NextResponse } from "next/server";
import { resolveMember } from "@/lib/serverMember";
import { callClaude, claudeConfigured, failureMessage } from "@/lib/anthropic";
import { normalizeExtraction, EXTRACT_MEDIA_TYPES, EXTRACT_MAX_BASE64 } from "@/lib/extractValidate";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC). The Supabase project is in
// Toronto, so this keeps the store's vendor, payment and staff data being processed in
// Canada rather than crossing the border on every request, and it is the nearest region
// to the database, which Vercel recommends for latency.
export const preferredRegion = "yul1";
// Long enough for a multi-page invoice read plus one retry; the client times out at 45s.
export const maxDuration = 60;

const PROMPT = `You are extracting a vendor invoice or receipt for a Canadian general store.
Read printed text and any handwritten notes or prices written in the margins.
Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{
  "vendor": string,
  "invoice_number": string,
  "invoice_date": string in YYYY-MM-DD or empty string if unknown,
  "notes": string,
  "printed_subtotal": number or null,
  "printed_hst": number or null,
  "printed_total": number or null,
  "line_items": [
    {
      "description": string,
      "qty": number,
      "unit_cost": number,
      "retail_price_note": number or null,
      "confidence": number between 0 and 1
    }
  ]
}
Rules: amounts are in CAD as plain numbers with no currency symbol. retail_price_note is the retail price written by hand next to a line, or null if none. confidence is between 0 and 1; set it low on any field you are unsure about. If a line value is missing use 0 for numbers and an empty string for text; the printed_ fields below follow their own rule.
invoice_number is the invoice or receipt number exactly as printed, or an empty string if there is none. printed_subtotal, printed_hst and printed_total are the subtotal before tax, the HST or other sales tax, and the final total or amount due, copied exactly as printed on the document. Never work them out from the lines: use null for any of the three that is not printed. Subtotal, tax and total rows go in these three fields and never in line_items.`;

// The same contract as the prompt, enforced by the API instead of asked for politely.
// Structured outputs constrain the response to this schema, so "the model wrapped it in a
// code fence" and "the model added a sentence before the JSON" stop being failure modes.
//
// Restrictions worth knowing before editing this (from the structured outputs docs):
// no recursive schemas, no minimum/maximum, no minLength/maxLength, and additionalProperties
// may only be false. That is why the 0-to-1 bound on confidence lives in the prompt above
// rather than here: the schema cannot express it, and a schema the API rejects would fail
// every capture rather than one.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: "string" },
    invoice_number: { type: "string" },
    invoice_date: { type: "string" },
    notes: { type: "string" },
    printed_subtotal: { anyOf: [{ type: "number" }, { type: "null" }] },
    printed_hst: { anyOf: [{ type: "number" }, { type: "null" }] },
    printed_total: { anyOf: [{ type: "number" }, { type: "null" }] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          qty: { type: "number" },
          unit_cost: { type: "number" },
          retail_price_note: { anyOf: [{ type: "number" }, { type: "null" }] },
          confidence: { type: "number" }
        },
        required: ["description", "qty", "unit_cost", "retail_price_note", "confidence"],
        additionalProperties: false
      }
    }
  },
  required: ["vendor", "invoice_number", "invoice_date", "notes", "printed_subtotal", "printed_hst", "printed_total", "line_items"],
  additionalProperties: false
} as const;

export async function POST(req: NextRequest) {
  try {
    // Any signed-in member can extract (capture is the staff job); what enforced mode blocks
    // is anonymous use of the store's Anthropic key as a free OCR proxy. Demo mode stays open.
    const resolved = await resolveMember(req);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const { imageBase64, mediaType, store_id } = await req.json();
    // Whose daily AI allowance this read counts against: a signed-in member's own store,
    // whatever the body says; in demo mode, the store picked on the screen.
    const storeId: string | null = resolved.member?.store_id || store_id || null;
    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ error: "imageBase64 and mediaType are required" }, { status: 400 });
    }
    if (!EXTRACT_MEDIA_TYPES.has(mediaType)) {
      return NextResponse.json({ error: "That file type cannot be read. Use a photo (JPG or PNG) or a PDF." }, { status: 415 });
    }
    if (typeof imageBase64 !== "string" || imageBase64.length > EXTRACT_MAX_BASE64) {
      return NextResponse.json({ error: "That file is too large to read. Take a closer photo of just the invoice." }, { status: 413 });
    }

    if (!claudeConfigured()) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
    }

    const block =
      mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
        : { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } };

    const result = await callClaude({
      route: "extract",
      scope: { db: resolved.client, storeId },
      // Was 2000, which a long delivery could exceed. Running out of room mid-answer
      // truncates the JSON, and the store was then told "could not parse model output"
      // for what was really a full invoice with too many lines to fit.
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
      timeoutMs: 45000
    });

    if (!result.ok) {
      // A refusal and a cut-off get their own words because each points at a different fix
      // for the person holding the invoice: a seasonal employee at the receiving door, who
      // is never asked to debug. Tell them what to do next instead.
      if (result.kind === "refusal") {
        return NextResponse.json(
          { error: "The reader would not process this document. Enter the invoice by hand using Enter manually, and tell the owner which invoice it was." },
          { status: 422 }
        );
      }
      // Ran out of room. The invoice was read fine, there were just more lines than would
      // fit, and saying so points at the real fix (capture it in two photos).
      if (result.kind === "max_tokens") {
        return NextResponse.json(
          { error: "This invoice is longer than the reader can return in one go. Photograph it in two halves and capture each, or enter it by hand." },
          { status: 422 }
        );
      }
      return NextResponse.json({ error: `${failureMessage(result.kind)} You can also use Enter manually.` }, { status: result.kind === "capped" ? 429 : 502 });
    }

    // Structured outputs should make the fence strip unnecessary, since the response is
    // constrained to the schema. It stays because it costs nothing and this is the path a
    // failed capture blocks the receiving door on.
    const raw = result.text.replace(/```json|```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(JSON.stringify({ ai_call: "extract", outcome: "unparseable", chars: raw.length }));
      return NextResponse.json({ error: "The reader returned something unreadable. Try the photo again, or use Enter manually." }, { status: 502 });
    }

    const { data, warnings } = normalizeExtraction(parsed);
    if (warnings.length) console.warn(JSON.stringify({ ai_call: "extract", outcome: "coerced", warnings }));
    return NextResponse.json({ ...data, warnings, model: result.model });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "unexpected error" }, { status: 500 });
  }
}
