// Notification computation for the bell. One place to read the alerts a store owner or
// manager cares about: overdue invoices, licence expiry, insurance renewals, maintenance due.
// Every query filters the active store and excludes voided rows. Degrades to [] on any error
// so the bell never throws, even with blank Supabase env.

import { supabase } from "@/lib/supabaseClient";
import { formatCAD, todayISO, daysOverdue } from "@/lib/format";
import { canSeeMoney, type Role } from "@/lib/auth";
import { invoiceTotal } from "@/lib/payments";

export type Notification = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail?: string;
  href: string;
};

// The bell quotes the same figure as every other money screen, so it needs the whole
// invoice: goods, freight, and the tax mode that decides whether HST is added on top.
type InvRow = { amount: number | null; hst_amount: number | null; freight_charges: number | null; tax_mode: string | null; due_date: string | null; status: string };
type LicRow = { id: string; name: string; expiry_date: string | null };
type PolRow = { id: string; name: string; renewal_date: string | null };
type TaskRow = { id: string; due_date: string | null; status: string };

// A latest count at or below this flags the item as low, matching the Reorder screen.
const LOW_STOCK = 3;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Low stock, bounded: only the lines of the ten most recent counts are read (the bell is a
// hint, not a report; /reorder is the full view). Latest-per-item ties resolve by count
// recency, matching how a same-day recount supersedes the morning's numbers.
async function lowStockCount(storeId: string): Promise<number> {
  const { data: counts, error } = await supabase
    .from("inventory_count")
    .select("id")
    .eq("store_id", storeId)
    .is("voided_at", null)
    .order("counted_date", { ascending: false })
    .limit(10);
  if (error || !counts?.length) return 0;
  const ordered = (counts as { id: string }[]).map((c) => c.id);
  const { data: lines, error: le } = await supabase
    .from("inventory_count_line")
    .select("item_id, counted_qty, inventory_count_id")
    .in("inventory_count_id", ordered);
  if (le) return 0;
  const rank = new Map(ordered.map((id, idx) => [id, idx]));
  const latest = new Map<string, { qty: number; rank: number }>();
  for (const l of (lines as { item_id: string | null; counted_qty: number | null; inventory_count_id: string }[]) || []) {
    if (!l.item_id || l.counted_qty == null) continue;
    const rk = rank.get(l.inventory_count_id) ?? Number.MAX_SAFE_INTEGER;
    const cur = latest.get(l.item_id);
    if (!cur || rk < cur.rank) latest.set(l.item_id, { qty: Number(l.counted_qty), rank: rk });
  }
  let low = 0;
  for (const v of latest.values()) if (v.qty <= LOW_STOCK) low++;
  return low;
}

export async function loadNotifications(storeId: string, role?: Role | null): Promise<Notification[]> {
  if (!storeId) return [];
  const out: Notification[] = [];
  const today = todayISO();
  // The bell shows for every role, so dollar details only render for money roles.
  const showMoney = canSeeMoney(role);

  try {
    // The five checks are independent; run them together so the bell costs one round trip
    // of latency, not five. A role that cannot see money reads the invoice_due and
    // insurance_renewal views instead of the tables: once login is on, invoice and
    // insurance_policy return no rows to staff (supabase/money_by_role.sql), and neither view
    // has a dollar column. Without a total the overdue item shows only its count.
    const [inv, lic, pol, task, low] = await Promise.all([
      showMoney
        ? supabase.from("invoice").select("amount, hst_amount, freight_charges, tax_mode, due_date, status").eq("store_id", storeId).is("voided_at", null).in("status", ["unpaid", "partially_paid"])
        : supabase.from("invoice_due").select("due_date, status").eq("store_id", storeId).is("voided_at", null).in("status", ["unpaid", "partially_paid"]),
      supabase.from("licence").select("id, name, expiry_date").eq("store_id", storeId).is("voided_at", null),
      supabase.from(showMoney ? "insurance_policy" : "insurance_renewal").select("id, name, renewal_date").eq("store_id", storeId).is("voided_at", null),
      supabase.from("maintenance_task").select("id, due_date, status").eq("store_id", storeId).is("voided_at", null).neq("status", "done"),
      lowStockCount(storeId)
    ]);

    // Overdue invoices: unpaid and past due. One rolled-up item with the total past due.
    if (!inv.error) {
      const rows = (inv.data as unknown as InvRow[]) || [];
      let count = 0;
      let total = 0;
      for (const r of rows) {
        const d = daysOverdue(r.due_date);
        if (d != null && d > 0) {
          count++;
          if (showMoney) total += invoiceTotal(r);
        }
      }
      if (count > 0) {
        out.push({
          id: "overdue-invoices",
          severity: "error",
          title: `${plural(count, "invoice", "invoices")} overdue`,
          detail: showMoney ? formatCAD(total) : undefined,
          href: "/overdue"
        });
      }
    }

    // Licence expiry: each licence within 30 days or already past gets an item.
    if (!lic.error) {
      for (const l of ((lic.data as unknown as LicRow[]) || [])) {
        const d = daysOverdue(l.expiry_date);
        if (d == null) continue;
        if (d > 0) {
          out.push({
            id: `licence-${l.id}`,
            severity: "error",
            title: `${l.name} expired`,
            detail: `${plural(d, "day", "days")} ago`,
            href: "/compliance"
          });
        } else if (-d <= 30) {
          const remaining = -d;
          out.push({
            id: `licence-${l.id}`,
            severity: "warning",
            title: `${l.name} expiring`,
            detail: remaining === 0 ? "expires today" : `in ${plural(remaining, "day", "days")}`,
            href: "/compliance"
          });
        }
      }
    }

    // Insurance renewals: each policy within 30 days or past renewal date gets an item.
    if (!pol.error) {
      for (const p of ((pol.data as unknown as PolRow[]) || [])) {
        const d = daysOverdue(p.renewal_date);
        if (d == null) continue;
        if (d >= 0 || -d <= 30) {
          const detail =
            d > 0 ? `${plural(d, "day", "days")} overdue` : d === 0 ? "renews today" : `in ${plural(-d, "day", "days")}`;
          out.push({
            id: `policy-${p.id}`,
            severity: "warning",
            title: `${p.name} renewal`,
            detail,
            href: "/compliance"
          });
        }
      }
    }

    // Maintenance due: open or in-progress tasks due within the next 7 days (or already due).
    if (!task.error) {
      const rows = (task.data as unknown as TaskRow[]) || [];
      let due = 0;
      for (const t of rows) {
        const d = daysOverdue(t.due_date);
        if (d != null && d >= -7) due++;
      }
      if (due > 0) {
        out.push({
          id: "maintenance-due",
          severity: "warning",
          title: `${plural(due, "maintenance task", "maintenance tasks")} due`,
          detail: "within 7 days",
          href: "/maintenance"
        });
      }
    }

    // Low stock: items whose most recent count is at or below the threshold. Quantities are
    // not money, so every role sees this one.
    if (low > 0) {
      out.push({
        id: "low-stock",
        severity: "info",
        title: `${plural(low, "item looks", "items look")} low`,
        detail: `at or below ${LOW_STOCK} on the last count`,
        href: "/reorder"
      });
    }
  } catch {
    return [];
  }

  return out;
}
