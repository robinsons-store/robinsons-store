// Renders a golden case's invoice into a small, valid PDF, so the live run sends the reader a
// real document instead of a description of one. No dependencies: standard PDF fonts,
// WinAnsi text, one content stream per page.
//
// The table works out each line's amount and the totals itself, so a case only states
// quantities and unit prices and cannot carry an arithmetic slip into the golden set.

export type Row = string | { bold: string };
export type Note = { hand: string };
// Quantity, description, unit price (a string such as "TO FOLLOW" prints as-is and counts as
// nothing), and an optional handwritten margin note.
export type TableRow = [number, string, number | string] | [number, string, number | string, Note];

export type DocSpec = {
  header?: Row[];
  table?: {
    columns: [string, string, string, string];
    money?: "plain" | "dollar" | "fr";
    // A balance brought from an earlier page, printed above the rows and counted in the
    // subtotal: the second page of an invoice photographed on its own.
    carried?: { label: string; amount: number };
    rows: TableRow[];
  };
  // Labels for the rows under the table. HST is Ontario's 13 percent of the subtotal.
  totals?: { subtotal?: string; hst?: string; total?: string };
  footer?: Row[];
};

const TOP = 740;
const BOTTOM = 60;
const LEFT = 50;
const LEAD = 16;
const CHAR = 6; // Courier at 10pt
const W = { qty: 5, desc: 40, unit: 11, amount: 12 };
const TABLE_WIDTH = W.qty + 2 + W.desc + 2 + W.unit + 2 + W.amount;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function money(n: number, style: "plain" | "dollar" | "fr"): string {
  const neg = n < 0 ? "-" : "";
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  if (style === "plain") return `${neg}${whole}.${cents}`;
  if (style === "dollar") return `${neg}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
  return `${neg}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${cents} $`;
}

function pdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = (ch.codePointAt(0) as number) < 256 ? ch : "?";
    out += c === "\\" || c === "(" || c === ")" ? "\\" + c : c;
  }
  return `(${out})`;
}

// The figures under the table, as printed: null for a row the case does not print.
export function printedTotals(spec: DocSpec): { subtotal: number | null; hst: number | null; total: number | null } {
  const t = spec.table;
  let subtotal = t?.carried ? t.carried.amount : 0;
  for (const [qty, , unit] of t?.rows || []) subtotal = round2(subtotal + (typeof unit === "number" ? round2(qty * unit) : 0));
  const labels = spec.totals || {};
  const hst = labels.hst ? round2(subtotal * 0.13) : 0;
  return {
    subtotal: labels.subtotal ? subtotal : null,
    hst: labels.hst ? hst : null,
    total: labels.total ? round2(subtotal + hst) : null
  };
}

export function tableLines(spec: DocSpec): { text: string; note?: string }[] {
  const t = spec.table;
  if (!t) return [];
  const style = t.money || "plain";
  const out: { text: string; note?: string }[] = [];
  if (t.carried) {
    out.push({ text: " ".repeat(W.qty + 2) + t.carried.label.padEnd(W.desc) + "  " + " ".repeat(W.unit) + "  " + money(t.carried.amount, style).padStart(W.amount) });
  }
  for (const [qty, desc, unit, note] of t.rows) {
    const priced = typeof unit === "number";
    const amount = priced ? round2(qty * unit) : 0;
    out.push({
      text:
        String(qty).padStart(W.qty) +
        "  " +
        desc.padEnd(W.desc) +
        "  " +
        (priced ? money(unit, style) : unit).padStart(W.unit) +
        "  " +
        (priced ? money(amount, style) : "").padStart(W.amount),
      note: note?.hand
    });
  }
  const labels = spec.totals || {};
  const printed = printedTotals(spec);
  const sum = (label: string, n: number | null) => ({ text: label.padStart(W.qty + 2 + W.desc + 2 + W.unit) + "  " + money(n ?? 0, style).padStart(W.amount) });
  if (labels.subtotal || labels.hst || labels.total) out.push({ text: "" });
  if (labels.subtotal) out.push(sum(labels.subtotal, printed.subtotal));
  if (labels.hst) out.push(sum(labels.hst, printed.hst));
  if (labels.total) out.push(sum(labels.total, printed.total));
  return out;
}

export function renderPdf(spec: DocSpec): Buffer {
  const pages: string[][] = [[]];
  let y = TOP;
  const draw = (ops: string) => pages[pages.length - 1].push(ops);
  const advance = () => {
    y -= LEAD;
    if (y < BOTTOM) {
      pages.push([]);
      y = TOP;
    }
  };
  const write = (text: string, font = "F1", size = 10) => {
    if (text) draw(`BT /${font} ${size} Tf 1 0 0 1 ${LEFT} ${y} Tm ${pdfText(text)} Tj ET`);
    advance();
  };
  const rows = (list: Row[] = []) => {
    for (const r of list) {
      if (typeof r === "string") write(r);
      else write(r.bold, "F2", 11);
    }
  };

  rows(spec.header);
  if (spec.table) {
    advance();
    const [q, d, u, a] = spec.table.columns;
    write(q.padStart(W.qty) + "  " + d.padEnd(W.desc) + "  " + u.padStart(W.unit) + "  " + a.padStart(W.amount), "F2", 10);
    draw(`0.5 w ${LEFT} ${y + LEAD - 4} m ${LEFT + TABLE_WIDTH * CHAR} ${y + LEAD - 4} l S`);
    for (const line of tableLines(spec)) {
      const lineY = y;
      write(line.text);
      // Blue ink, a little crooked, in the right margin of the line it belongs to: the
      // retail price somebody wrote on the paper at the receiving door.
      if (line.note) {
        const x = LEFT + TABLE_WIDTH * CHAR + 12;
        draw(`0.1 0.2 0.6 rg BT /F3 13 Tf 0.998 -0.07 0.07 0.998 ${x} ${lineY} Tm ${pdfText(line.note)} Tj ET 0 g`);
      }
    }
  }
  if (spec.footer?.length) {
    advance();
    rows(spec.footer);
  }

  const objects: string[] = [];
  const fonts = ["Courier", "Courier-Bold", "Times-Italic"];
  const firstPage = 3 + fonts.length;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  for (const f of fonts) objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`);
  pages.forEach((ops, i) => {
    const stream = ops.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${firstPage + i * 2 + 1} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  // Every character is one byte in latin1, so string length is the byte offset.
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
