import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { resolveMember } from "@/lib/serverMember";
import { readTable } from "@/lib/exportPaging";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC). The Supabase project is in
// Toronto, so this keeps the store's vendor, payment and staff data being processed in
// Canada rather than crossing the border on every request, and it is the nearest region
// to the database, which Vercel recommends for latency.
export const preferredRegion = "yul1";

// Full-data export: one Excel workbook, one tab per table, every id column intact so the
// relationships survive the trip (normalize, analyze, or re-import anywhere). Voided (deleted)
// rows are included on purpose, with their voided_at set, because the export is the archival
// record; filter voided_at blank for the live view.
//
// Caller rules mirror /api/import: in enforced mode this needs a signed-in owner or manager
// and exports only their store; in demo mode it exports the store passed as ?store_id.

type TableSpec = {
  name: string;
  // How the table scopes to a store: a direct store_id column, through a parent's id list,
  // the store row itself, or not at all (global reference data).
  scope: "store" | "parent" | "self" | "global";
  parent?: { table: string; column: string };
  what: string;
  links: string;
  // A table a later migration adds. If its script has not run yet, its tab says so instead
  // of the whole export failing.
  optional?: boolean;
};

const TABLES: TableSpec[] = [
  { name: "store", scope: "self", what: "The store itself", links: "" },
  { name: "department", scope: "store", what: "Departments (Grocery, Hardware, ...)", links: "store_id -> store.id; parent_department_id -> department.id" },
  { name: "app_user", scope: "store", what: "App members and their roles", links: "store_id -> store.id" },
  { name: "vendor", scope: "store", what: "Vendors", links: "store_id -> store.id; department_id -> department.id" },
  { name: "item", scope: "store", what: "Products / SKUs", links: "store_id -> store.id; department_id -> department.id; vendor_id -> vendor.id" },
  { name: "retail_price", scope: "parent", parent: { table: "item", column: "item_id" }, what: "Retail price history per item", links: "item_id -> item.id" },
  { name: "purchase_order", scope: "store", what: "Orders / seasonal bookings", links: "store_id -> store.id; vendor_id -> vendor.id; department_id -> department.id" },
  { name: "receiving_event", scope: "store", what: "Captured deliveries", links: "store_id -> store.id; department_id -> department.id; vendor_id -> vendor.id; created_by -> app_user.id" },
  { name: "receiving_line", scope: "parent", parent: { table: "receiving_event", column: "receiving_event_id" }, what: "Line items of each delivery", links: "receiving_event_id -> receiving_event.id; item_id -> item.id" },
  { name: "invoice", scope: "store", what: "Vendor invoices", links: "store_id -> store.id; vendor_id -> vendor.id; receiving_event_id -> receiving_event.id" },
  { name: "payment", scope: "parent", parent: { table: "vendor", column: "vendor_id" }, what: "Payments to vendors (a payment can settle several invoices, or none yet for a deposit)", links: "vendor_id -> vendor.id; invoice_id -> invoice.id (legacy single-invoice link)" },
  { name: "payment_allocation", scope: "parent", parent: { table: "payment", column: "payment_id" }, what: "How each payment splits across invoices", links: "payment_id -> payment.id; invoice_id -> invoice.id" },
  { name: "credit_note", scope: "store", what: "Vendor credits against invoices (returns, damage, overcharges)", links: "store_id -> store.id; vendor_id -> vendor.id; invoice_id -> invoice.id; created_by -> app_user.id" },
  { name: "inventory_count", scope: "store", what: "Dated inventory counts", links: "store_id -> store.id; department_id -> department.id; created_by -> app_user.id" },
  { name: "inventory_count_line", scope: "parent", parent: { table: "inventory_count", column: "inventory_count_id" }, what: "Lines of each count", links: "inventory_count_id -> inventory_count.id; item_id -> item.id" },
  { name: "knowledge_note", scope: "store", what: "Tribal knowledge notes", links: "store_id -> store.id; department_id -> department.id; created_by -> app_user.id" },
  { name: "maintenance_asset", scope: "store", what: "Property assets", links: "store_id -> store.id" },
  { name: "maintenance_task", scope: "store", what: "Recurring maintenance tasks", links: "store_id -> store.id; asset_id -> maintenance_asset.id" },
  { name: "insurance_policy", scope: "store", what: "Insurance policies", links: "store_id -> store.id" },
  { name: "licence", scope: "store", what: "Licences (pesticide vendor licence)", links: "store_id -> store.id" },
  { name: "employee", scope: "store", what: "Employees", links: "store_id -> store.id; department_id -> department.id" },
  { name: "pay_rate", scope: "parent", parent: { table: "employee", column: "employee_id" }, what: "Effective-dated pay rates", links: "employee_id -> employee.id" },
  { name: "shift", scope: "parent", parent: { table: "employee", column: "employee_id" }, what: "Scheduled shifts", links: "employee_id -> employee.id; department_id -> department.id" },
  { name: "tax_rules", scope: "global", what: "Province tax rates (reference)", links: "" },
  { name: "feedback", scope: "store", what: "Owner suggestion box (ideas, problems, screenshots, voice notes)", links: "store_id -> store.id; author_id -> app_user.id" },
  { name: "feedback_summary", scope: "store", what: "What the AI read off each suggestion screenshot", links: "feedback_id -> feedback.id; store_id -> store.id" },
  { name: "department_field", scope: "store", optional: true, what: "Which vendor and invoice questions each department is asked, as changed on the Department fields screen (no row means the usual list)", links: "store_id -> store.id; department_id -> department.id; updated_by -> app_user.id" },
  { name: "activity_log", scope: "parent", parent: { table: "app_user", column: "actor_id" }, what: "Audit trail of every write", links: "actor_id -> app_user.id" },
];

// Every table is read through readTable (src/lib/exportPaging.ts): keyset pages on id, so a
// shift deleted or a row added while the export runs cannot make the archive drop or repeat
// another row. scripts/importexport-check runs it against a fake that refuses offset paging.

export async function GET(req: NextRequest) {
  try {
    const resolved = await resolveMember(req);
    if (!resolved.ok) {
      return Response.json({ error: resolved.message }, { status: resolved.status });
    }
    const { client: db, member } = resolved;
    if (member && member.role !== "owner" && member.role !== "manager") {
      return Response.json({ error: "The full export includes money and pay, so it needs an owner or manager login." }, { status: 403 });
    }
    const storeId = member?.store_id || req.nextUrl.searchParams.get("store_id") || null;
    if (!storeId) {
      return Response.json({ error: "No store selected." }, { status: 400 });
    }

    // Taken before the first read. The README names it so the archive says which moment it
    // describes: rows written while the export ran may or may not be in it.
    const startedAt = new Date().toISOString();
    const wb = XLSX.utils.book_new();
    const readme: any[] = [];
    const parentIds = new Map<string, string[]>();

    for (const spec of TABLES) {
      let rows: any[] = [];
      if (spec.scope === "self") {
        rows = await readTable(db, spec.name, (q) => q.eq("id", storeId));
      } else if (spec.scope === "store" && spec.optional) {
        try {
          rows = await readTable(db, spec.name, (q) => q.eq("store_id", storeId));
        } catch (err: any) {
          if (err?.code !== "42P01" && err?.code !== "PGRST205") throw err;
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`(${spec.name} is not set up on this database yet)`]]), spec.name.slice(0, 31));
          readme.push({ table: spec.name, rows: 0, what: spec.what, relationships: spec.links, note: "Not set up on this database yet" });
          continue;
        }
      } else if (spec.scope === "store") {
        rows = await readTable(db, spec.name, (q) => q.eq("store_id", storeId));
      } else if (spec.scope === "global") {
        rows = await readTable(db, spec.name, (q) => q);
      } else if (spec.scope === "parent" && spec.parent) {
        const ids = parentIds.get(spec.parent.table) || [];
        if (ids.length) {
          // .in() has practical URL-length limits; chunk the id list.
          for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            rows.push(...await readTable(db, spec.name, (q) => q.in(spec.parent!.column, chunk)));
          }
        }
      }
      parentIds.set(spec.name, rows.map((r) => r.id).filter(Boolean));

      const sheet = rows.length
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([["(no rows)"]]);
      // Sheet names cap at 31 chars in Excel.
      XLSX.utils.book_append_sheet(wb, sheet, spec.name.slice(0, 31));
      const voidedCount = rows.filter((r) => r.voided_at).length;
      readme.push({
        table: spec.name, rows: rows.length, what: spec.what, relationships: spec.links,
        note: voidedCount ? `${voidedCount} deleted row${voidedCount === 1 ? "" : "s"} included (voided_at set); filter voided_at blank to match the app` : ""
      });
    }

    const intro = XLSX.utils.aoa_to_sheet([
      ["Export started", startedAt],
      ["", "Time is UTC. Changes made while the export was running may or may not be included."],
      []
    ]);
    XLSX.utils.sheet_add_json(intro, readme, { origin: "A4" });
    XLSX.utils.book_append_sheet(wb, intro, "README");
    // Move README to the front so it opens first.
    wb.SheetNames.unshift(wb.SheetNames.pop() as string);

    const stamp = startedAt.slice(0, 10);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="robinsons-export-${stamp}.xlsx"`
      }
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "export failed" }, { status: 500 });
  }
}
