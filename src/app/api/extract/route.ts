import { NextRequest, NextResponse } from "next/server";
import { resolveMember } from "@/lib/serverMember";
import { callClaude, claudeConfigured, failureMessage } from "@/lib/anthropic";
import { extractReply, EXTRACT_MEDIA_TYPES, EXTRACT_MAX_BASE64 } from "@/lib/extractValidate";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC), the nearest region to the Toronto
// database, which Vercel recommends for latency. The function and its database work run in
// Canada; the invoice image itself still goes to the Anthropic API, which is in the US.
export const preferredRegion = "yul1";
// Long enough for a multi-page invoice read plus one retry; the client times out at 45s.
export const maxDuration = 60;

const PROMPT = `You are extracting a vendor invoice or receipt for a Canadian general store.
Read printed text and any handwritten notes or prices written in the margins.
Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{
  "vendor": string,
  "invoice_date": string in YYYY-MM-DD or empty string if unknown,
  "notes": string,
  "line_items": [
    {
      "description": string,
      "qty": number,
      "unit_cost": number,
      "retail_price_note": number or null,
      "confidence": number between 0 and 1
    }
  ],
  "printed_subtotal": number or null
}
Rules: amounts are in CAD as plain numbers with no currency symbol. retail_price_note is the retail price written by hand next to a line, or null if none. confidence is between 0 and 1; set it low on any field you are unsure about. If a value is missing use 0 for numbers and an empty string for text. printed_subtotal is the subtotal of the goods lines exactly as printed, before tax, freight, deposits, fees and discounts; use null, never 0, if the invoice prints no such figure or its only subtotal already includes any of those. Copy it, never add it up yourself.`;

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
    invoice_date: { type: "string" },
    notes: { type: "string" },
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
    },
    printed_subtotal: { anyOf: [{ type: "number" }, { type: "null" }] }
  },
  required: ["vendor", "invoice_date", "notes", "line_items", "printed_subtotal"],
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
      return NextResponse.json({ error: `${failureMessage("no_key")} You can also use Enter manually.` }, { status: 500 });
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

    const reply = extractReply(result);
    return NextResponse.json(reply.body, { status: reply.status });
  } catch {
    // Fixed words: a thrown message can carry provider or database text.
    return NextResponse.json({ error: "The invoice could not be read just now. Try again, or use Enter manually." }, { status: 500 });
  }
}
