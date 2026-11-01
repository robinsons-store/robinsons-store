// Deterministic scorers for the golden cases in cases/. No imports, no model, no network:
// the same function scores a live answer, an offline plumbing run, and the hand-written
// samples the CI tests feed it.
//
// A case passes only when every check passes. The checks are named so a failing run says
// which field or fact went wrong, not just that something did.

export type Check = { name: string; pass: boolean; detail?: string };
export type Score = { pass: boolean; checks: Check[] };

// What a route handed back: the HTTP status and the parsed JSON body.
export type RouteOutput = { status: number; body: any };

const done = (checks: Check[]): Score => ({ pass: checks.every((c) => c.pass), checks });

// The capture screen's amber line, from src/app/capture/page.tsx. check.js pins the two
// together so a change there fails CI here instead of quietly moving the bar.
export const LOW_CONFIDENCE = 0.7;

// ---------- extract ----------

export type ExpectedLine = {
  // Words that must all appear in the line's description. Short and distinctive.
  match: string[];
  qty?: number | null;
  unit_cost?: number | null;
  retail_price_note?: number | null;
  // true: the line must land in the amber band the capture screen makes a person check.
  flagged?: boolean;
};

export type ExtractExpect = {
  // "" means the field must come back blank: nothing invented.
  vendor?: string;
  // Letters and digits only, after any leading label: "Invoice no. NB-20417" is "NB-20417".
  invoice_number?: string;
  invoice_date?: string;
  // The figures printed under the table, copied rather than worked out from the lines. null
  // means not printed. Within costTolerance.
  printed_subtotal?: number | null;
  printed_hst?: number | null;
  printed_total?: number | null;
  // What the totals check in src/lib/extractValidate.ts must conclude.
  totals_mismatch?: boolean;
  lines?: ExpectedLine[];
  // Default true when lines are given: no extra lines, no missing ones.
  exactLineCount?: boolean;
  // Words that must not appear in any line's description (a Subtotal or HST row read as a
  // purchase double-counts tax, because capture adds HST on top of the line subtotal).
  forbiddenLines?: string[];
  // Absolute tolerance on unit cost and retail note, in dollars. Default one cent.
  costTolerance?: number;
};

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(s: unknown): string[] {
  return fold(typeof s === "string" ? s : "").split(/[^a-z0-9]+/).filter(Boolean);
}

const SUFFIXES = new Set(["ltd", "limited", "inc", "incorporated", "co", "corp", "corporation", "llc", "ltee"]);

// "Northbay Hardware Supply Ltd." and "NORTHBAY HARDWARE SUPPLY" are the same vendor;
// "Bancroft Feed & Seed" and "Bancroft Feed and Seed" too.
export function vendorKey(s: unknown): string {
  return tokens(typeof s === "string" ? s.replace(/&/g, " and ") : "")
    .filter((t) => !SUFFIXES.has(t))
    .join(" ");
}

const NUMBER_LABELS = new Set(["invoice", "facture", "inv", "no", "nr", "number", "num", "n"]);

// "NB-20417", "nb 20417" and "Invoice No. NB-20417" are the same invoice number; so are
// "55-0418" and "Facture no 55-0418".
export function invoiceKey(s: unknown): string {
  const t = tokens(s);
  while (t.length > 1 && NUMBER_LABELS.has(t[0])) t.shift();
  return t.join("");
}

// "sirop|syrup" accepts either word, for a reader that may or may not translate. A plural
// ending is accepted so "rope" finds "ropes".
function hasWord(desc: string[], word: string): boolean {
  return fold(word)
    .split("|")
    .some((w) => desc.some((t) => t === w || t === w + "s" || t === w + "es"));
}

function sameAmount(a: unknown, b: number | null, tol: number): boolean {
  if (b === null) return a === null;
  return typeof a === "number" && Math.abs(a - b) <= tol + 1e-9;
}

const show = (v: unknown) => (v === null ? "null" : v === undefined ? "missing" : JSON.stringify(v));

export function scoreExtract(expect: ExtractExpect, out: RouteOutput): Score {
  const body = out.body || {};
  if (out.status !== 200 || body.error || !Array.isArray(body.line_items)) {
    return done([{ name: "answered", pass: false, detail: `status ${out.status}: ${body.error || body.message || "no line_items"}` }]);
  }
  const checks: Check[] = [{ name: "answered", pass: true }];
  const tol = expect.costTolerance ?? 0.01;

  if (expect.vendor !== undefined) {
    const pass = vendorKey(body.vendor) === vendorKey(expect.vendor);
    checks.push({ name: "vendor", pass, detail: pass ? undefined : `got ${show(body.vendor)}, expected ${show(expect.vendor)}` });
  }
  if (expect.invoice_number !== undefined) {
    const pass = invoiceKey(body.invoice_number) === invoiceKey(expect.invoice_number);
    checks.push({ name: "invoice_number", pass, detail: pass ? undefined : `got ${show(body.invoice_number)}, expected ${show(expect.invoice_number)}` });
  }
  if (expect.invoice_date !== undefined) {
    const pass = body.invoice_date === expect.invoice_date;
    checks.push({ name: "invoice_date", pass, detail: pass ? undefined : `got ${show(body.invoice_date)}, expected ${show(expect.invoice_date)}` });
  }
  for (const field of ["printed_subtotal", "printed_hst", "printed_total"] as const) {
    const want = expect[field];
    if (want === undefined) continue;
    const pass = sameAmount(body[field], want, tol);
    checks.push({ name: field, pass, detail: pass ? undefined : `got ${show(body[field])}, expected ${show(want)}` });
  }
  if (expect.totals_mismatch !== undefined) {
    const pass = body.totals_mismatch === expect.totals_mismatch;
    checks.push({ name: "totals_mismatch", pass, detail: pass ? undefined : `got ${show(body.totals_mismatch)}, expected ${expect.totals_mismatch}` });
  }

  const actual: any[] = body.line_items;
  const used = new Set<number>();
  for (const e of expect.lines || []) {
    const label = `line ${e.match.join(" ")}`;
    const idx = actual.findIndex((l, i) => !used.has(i) && e.match.every((w) => hasWord(tokens(l?.description), w)));
    if (idx < 0) {
      checks.push({ name: `${label}: present`, pass: false, detail: "no line with those words" });
      continue;
    }
    used.add(idx);
    const l = actual[idx];
    checks.push({ name: `${label}: present`, pass: true });
    if (e.qty !== undefined) {
      const pass = sameAmount(l.qty, e.qty, 1e-6);
      checks.push({ name: `${label}: qty`, pass, detail: pass ? undefined : `got ${show(l.qty)}, expected ${show(e.qty)}` });
    }
    if (e.unit_cost !== undefined) {
      const pass = sameAmount(l.unit_cost, e.unit_cost, tol);
      checks.push({ name: `${label}: unit_cost`, pass, detail: pass ? undefined : `got ${show(l.unit_cost)}, expected ${show(e.unit_cost)}` });
    }
    if (e.retail_price_note !== undefined) {
      const pass = sameAmount(l.retail_price_note, e.retail_price_note, tol);
      checks.push({ name: `${label}: retail_price_note`, pass, detail: pass ? undefined : `got ${show(l.retail_price_note)}, expected ${show(e.retail_price_note)}` });
    }
    if (e.flagged !== undefined) {
      const isFlagged = typeof l.confidence === "number" && l.confidence < LOW_CONFIDENCE;
      const pass = isFlagged === e.flagged;
      checks.push({ name: `${label}: flagged`, pass, detail: pass ? undefined : `confidence ${show(l.confidence)}, expected ${e.flagged ? "below" : "at or above"} ${LOW_CONFIDENCE}` });
    }
  }

  if (expect.lines && expect.exactLineCount !== false) {
    const pass = actual.length === expect.lines.length;
    const extra = actual.filter((_, i) => !used.has(i)).map((l) => show(l?.description)).join(", ");
    checks.push({ name: "line count", pass, detail: pass ? undefined : `got ${actual.length}, expected ${expect.lines.length}${extra ? "; unmatched: " + extra : ""}` });
  }

  for (const word of expect.forbiddenLines || []) {
    const hit = actual.find((l) => hasWord(tokens(l?.description), word));
    checks.push({ name: `no ${word} line`, pass: !hit, detail: hit ? `line ${show(hit.description)}` : undefined });
  }

  return done(checks);
}

// ---------- ask ----------

// A fact is a phrase (matched case-insensitively, thousands separators ignored), a list of
// phrases where any one will do, or a dollar amount matched as a number so "$1,186.50",
// "1186.50" and "1,186.5" all count.
export type Fact = string | string[] | { amount: number };

export type AskExpect = {
  // A fact written "@NAME" is the shared phrase list of that name in cases/ask.json.
  mustInclude?: Fact[];
  mustNotInclude?: Fact[];
  // Regular expressions (case-insensitive) the answer must not match.
  mustNotMatch?: string[];
  // Tables the route may write to while answering. Default none: a question is not an
  // instruction to file anything.
  writes?: string[];
};

// Swap each "@NAME" fact for its phrase list. An unknown name throws: a typo in a case must
// not turn into a fact nothing can ever contain.
export function expandPhrases(expect: AskExpect, phrases: Record<string, string[]>): AskExpect {
  const swap = (f: Fact): Fact => {
    if (typeof f !== "string" || !f.startsWith("@")) return f;
    const list = phrases[f.slice(1)];
    if (!list) throw new Error(`unknown phrase list ${f}`);
    return list;
  };
  return {
    ...expect,
    mustInclude: expect.mustInclude?.map(swap),
    mustNotInclude: expect.mustNotInclude?.map(swap)
  };
}

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-–−]/g, "-")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function amountsIn(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

function factLabel(f: Fact): string {
  if (typeof f === "string") return `"${f}"`;
  if (Array.isArray(f)) return f.map((x) => `"${x}"`).join(" or ");
  return `$${f.amount.toFixed(2)}`;
}

function factIn(text: string, f: Fact): boolean {
  if (typeof f === "string") return text.includes(normalizeAnswer(f));
  if (Array.isArray(f)) return f.some((x) => text.includes(normalizeAnswer(x)));
  return amountsIn(text).some((n) => Math.abs(n - f.amount) < 0.005);
}

export function scoreAsk(expect: AskExpect, out: RouteOutput, writes: string[] = []): Score {
  const body = out.body || {};
  if (out.status !== 200 || typeof body.answer !== "string") {
    return done([{ name: "answered", pass: false, detail: `status ${out.status}: ${body.error || body.message || "no answer"}` }]);
  }
  const raw: string = body.answer;
  const text = normalizeAnswer(raw);
  const checks: Check[] = [{ name: "answered", pass: true }];

  for (const f of expect.mustInclude || []) {
    checks.push({ name: `includes ${factLabel(f)}`, pass: factIn(text, f) });
  }
  for (const f of expect.mustNotInclude || []) {
    checks.push({ name: `excludes ${factLabel(f)}`, pass: !factIn(text, f) });
  }
  for (const re of expect.mustNotMatch || []) {
    const m = text.match(new RegExp(re, "i"));
    checks.push({ name: `excludes /${re}/`, pass: !m, detail: m ? `matched "${m[0]}"` : undefined });
  }

  // House rules for every answer a person reads: plain text, no em dashes.
  checks.push({ name: "no em dash", pass: !raw.includes("—") });
  const md = raw.match(/\*\*|^#{1,6}\s|^\s*\*\s/m);
  checks.push({ name: "no markdown", pass: !md, detail: md ? `found "${md[0].trim()}"` : undefined });

  const want = [...(expect.writes || [])].sort().join(",");
  const got = [...writes].sort().join(",");
  checks.push({ name: "writes", pass: want === got, detail: want === got ? undefined : `wrote [${got}], expected [${want}]` });

  return done(checks);
}

// The prompt the route actually built, checked before any model reads it. This is the
// deterministic half of the must-not-say cases: if a staff prompt already carries a dollar
// figure, or another store's vendor, no answer check can be trusted to catch it.
export type PromptExpect = { promptExcludes?: string[]; promptIncludes?: string[] };

export function scorePrompt(expect: PromptExpect, prompt: string): Score {
  const checks: Check[] = [];
  for (const s of expect.promptIncludes || []) checks.push({ name: `prompt includes "${s}"`, pass: prompt.includes(s) });
  for (const s of expect.promptExcludes || []) checks.push({ name: `prompt excludes "${s}"`, pass: !prompt.includes(s) });
  return done(checks);
}
