import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { invoiceTotal, settlementByInvoice, isFutureDate, type AllocationRow } from "@/lib/payments";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC). The Supabase project is in
// Toronto, so this keeps the store's vendor, payment and staff data being processed in
// Canada rather than crossing the border on every request, and it is the nearest region
// to the database, which Vercel recommends for latency.
export const preferredRegion = "yul1";
export const dynamic = "force-dynamic";

// What the app checks about itself after every deploy.
//
// A build going green only proves the code compiled. This route proves the deployed app and
// the deployed database still agree about money, which is the thing that actually matters
// here and the thing a type-checker cannot see. The post-deploy watchdog reads it and
// raises a ticket when a check fails, so a bad release is found by the machine rather than
// by the owner noticing a wrong number a week later.
//
// It never returns a dollar figure. Without CRON_SECRET it answers pass/fail per check plus
// the one sentence saying what to do about a failure; with the secret it adds the database
// error and the counts, so the response is safe to call from anywhere.

// `fix` is the one sentence a person can act on. It is the only detail this route gives
// away without the secret, because a check that only says what is wrong and never what to
// do about it gets raised, read, and ignored, which is what happened six times running to
// the vendor columns in August 2026.
type Check = { name: string; ok: boolean; detail?: string; count?: number; fix?: string };

// Every column the deployed app expects to exist, and the script in supabase/ that adds it.
// A missing one means a migration has not been run, and the screens that read it render
// blank.
//
// KEEP THIS CURRENT. When a change adds a column to any select in the app, add it here in
// the same change, with the script that creates it. The cost of forgetting is a watchdog
// that says the site is fine while a screen is empty, which is what happened on 2026-07-31.
//
// The script sits against the column rather than against the table on purpose. A table can
// be waiting on two different scripts, and the whole point of this check is to name the one
// file that is actually missing instead of every file it could be.
const REQUIRED_COLUMNS: Record<string, Record<string, string>> = {
  vendor: {
    specializes_in: "vendor_specializes_in.sql",
    minimum_order_amount: "vendor_ordering_fields.sql",
    no_minimum_order: "vendor_ordering_fields.sql",
    summer_order_timeline: "vendor_ordering_fields.sql",
    order_location: "vendor_ordering_fields.sql",
    order_location_other: "vendor_ordering_fields.sql",
    reorder_status: "vendor_ordering_fields.sql",
    reorder_comments: "vendor_ordering_fields.sql"
  },
  invoice: {
    tax_mode: "order_invoice_fields.sql",
    delivered_date: "order_invoice_fields.sql",
    delivery_comments: "order_invoice_fields.sql",
    invoice_filing: "filing_locations.sql",
    digital_file_location: "filing_locations.sql"
  },
  purchase_order: {
    order_filing: "order_invoice_fields.sql",
    digital_file_location: "filing_locations.sql"
  },
  payment: {
    digital_file_location: "filing_locations.sql"
  }
};

// Every table a release added after the first schema, and the script that creates it. A
// column list cannot say this: when the whole table is missing even the `id` probe fails,
// and missingColumns reads that as a database problem with no script to run.
//
// KEEP THIS CURRENT the same way: a release that adds a table adds it here in the same change.
const REQUIRED_TABLES: Record<string, string> = {
  department_field: "department_field.sql"
};

// The sentence a person can act on, built from the scripts the missing columns came from.
// Every script in run-order.txt is idempotent, so "run it again" is always a safe answer and
// saying so removes the one reason somebody would hesitate.
function runThese(scripts: string[]): string {
  const list = scripts.map((s) => `supabase/${s}`).join(" and ");
  return `Run ${list} in the Supabase SQL editor, in the order given in docs/SUPABASE_SETUP.md. Safe to run again if it has already been run.`;
}

// Which of the required columns the live table does not have.
//
// The fast path is one select for the whole list, because that is the normal answer and it
// costs one query. Only when that fails does this ask column by column, and the extra
// queries buy the difference between "one of these two scripts" and the one file to run.
//
// `id` is the control. Every table here has it, so if the select for `id` alone also fails
// the table or the database is the problem and no migration would fix it. Returning null
// says exactly that, and the caller then reports the error without a fix nobody should act
// on.
async function missingColumns(
  db: ReturnType<typeof healthClient>,
  table: string,
  columns: string[]
): Promise<string[] | null> {
  const probe = async (select: string) => {
    const { error } = await db.from(table).select(select).limit(1);
    return !error;
  };

  if (await probe(columns.join(", "))) return [];
  if (!(await probe("id"))) return null;

  const missing: string[] = [];
  for (const column of columns) {
    if (!(await probe(column))) missing.push(column);
  }
  // Every column answered on its own but not together: not a missing migration, so let the
  // caller fall back to reporting the error it already has.
  return missing.length ? missing : null;
}

function healthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // The service role sees every row once RLS is on; the anon client is the demo fallback.
  if (url && serviceKey) return createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabase;
}

function detailed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

// The status the engine would derive right now, mirroring recompute_invoice_status.
function deriveStatus(total: number, settled: number, scheduled: number): string {
  if (total <= 0) return settled + scheduled > 0 ? "paid" : "unpaid";
  if (settled >= total) return "paid";
  if (settled + scheduled >= total) return "postdated";
  if (settled + scheduled > 0) return "partially_paid";
  return "unpaid";
}

export async function GET(req: NextRequest) {
  const checks: Check[] = [];
  const full = detailed(req);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Blank env is a valid state for this app (the build must pass without it), so say so
    // plainly rather than reporting a failure the owner cannot act on.
    return NextResponse.json({ ok: true, configured: false, checks: [], note: "No database configured. Nothing to check." });
  }

  const db = healthClient();

  // 1. The database answers at all.
  try {
    const { error } = await db.from("invoice").select("id", { count: "exact", head: true }).limit(1);
    checks.push({ name: "database reachable", ok: !error, detail: error?.message });
  } catch (e: any) {
    checks.push({ name: "database reachable", ok: false, detail: e?.message });
  }

  // 2. The money rule in the database matches the one in the app. A tax-included invoice of
  // 113 with 13 of embedded HST owes 113, not 126. If the migration was skipped or someone
  // edited one side only, this is where it shows up.
  try {
    const { data, error } = await db.rpc("invoice_owed_total", {
      p_amount: 113, p_freight: 0, p_hst: 13, p_tax_mode: "included"
    });
    const fromDb = Number(data);
    const fromApp = invoiceTotal({ amount: 113, hst_amount: 13, freight_charges: 0, tax_mode: "included" });
    checks.push({
      name: "database and app agree on what an invoice owes",
      ok: !error && fromDb === fromApp,
      detail: error ? error.message : fromDb === fromApp ? undefined : `database says ${fromDb}, app says ${fromApp}`
    });
  } catch (e: any) {
    checks.push({ name: "database and app agree on what an invoice owes", ok: false, detail: e?.message });
  }

  // 3. The payments engine is installed. Calling recompute on an id that cannot exist is a
  // no-op, so this proves the function is there without touching a real invoice.
  try {
    const { error } = await db.rpc("recompute_invoice_status", { p_invoice_id: "00000000-0000-0000-0000-000000000000" });
    checks.push({ name: "payments engine installed", ok: !error, detail: error?.message });
  } catch (e: any) {
    checks.push({ name: "payments engine installed", ok: false, detail: e?.message });
  }

  // 4. No invoice is showing a status that disagrees with its own payments. This is the
  // check that catches a bad release: if a deploy breaks the total, statuses drift.
  try {
    const { data: inv, error: invErr } = await db
      .from("invoice")
      .select("id, amount, hst_amount, freight_charges, tax_mode, status")
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (invErr) throw new Error(invErr.message);

    const rows = (inv as any[]) || [];
    const ids = rows.map((r) => r.id);
    let drift = 0;
    if (ids.length) {
      const { data: allocs, error: aErr } = await db
        .from("payment_allocation")
        .select("invoice_id, amount, payment:payment_id(paid_date, voided_at)")
        .in("invoice_id", ids);
      if (aErr) throw new Error(aErr.message);
      const settlements = settlementByInvoice(((allocs as unknown) as AllocationRow[]) || []);
      for (const r of rows) {
        const s = settlements.get(r.id) || { settled: 0, scheduled: 0 };
        const expected = deriveStatus(invoiceTotal(r), s.settled, s.scheduled);
        if (expected !== r.status) drift++;
      }
    }
    checks.push({
      name: "invoice statuses match their payments",
      ok: drift === 0,
      count: drift,
      detail: drift ? `${drift} of ${rows.length} recent invoices disagree with their payments` : undefined
    });
  } catch (e: any) {
    checks.push({ name: "invoice statuses match their payments", ok: false, detail: e?.message });
  }

  // 5. The columns the current release needs actually exist. A missing migration is the
  // most common way a good deploy still breaks the forms.
  // The columns this release needs. This list is the check, and it went wrong once in
  // exactly the way a hardcoded list does: a release added invoice_filing and
  // digital_file_location, nobody updated the check, and the watchdog reported the site
  // healthy while the payouts screen was blank because those columns did not exist yet.
  //
  // So the list now lives beside the queries that need it, and the rule for changing it is
  // in the comment above each entry: if you add a column to a select anywhere in the app,
  // add it here in the same change. It is still a list a person maintains, but it is one
  // list rather than one per screen, and it fails loudly instead of quietly.
  //
  // Failing loudly was not enough on its own. The vendor columns failed on six checks
  // running because the check said "vendor columns present" and nothing else, so whoever
  // read the ticket had no way to know that one named file in the SQL editor would end it.
  // Each column now carries the script that supplies it, and a failure names the missing
  // columns and the file to run for them.
  for (const [table, scriptByColumn] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = Object.keys(scriptByColumn);
    try {
      const missing = await missingColumns(db, table, columns);
      if (missing && missing.length === 0) {
        checks.push({ name: `${table} columns present`, ok: true });
        continue;
      }
      if (!missing) {
        // The table did not answer at all, or answered for every column separately and not
        // together. Either way this is not a script somebody forgot to run, so say what
        // happened and do not send anyone to the SQL editor.
        const { error } = await db.from(table).select(columns.join(", ")).limit(1);
        checks.push({
          name: `${table} columns present`,
          ok: false,
          detail: `${error?.message || "the table did not answer"}. Expected: ${columns.join(", ")}`
        });
        continue;
      }
      const scripts = [...new Set(missing.map((c) => scriptByColumn[c]))];
      const fix = `${table} is missing ${missing.join(", ")}. ${runThese(scripts)}`;
      checks.push({ name: `${table} columns present`, ok: false, detail: fix, fix });
    } catch (e: any) {
      checks.push({ name: `${table} columns present`, ok: false, detail: e?.message });
    }
  }

  // 6. The tables the current release needs exist. A missing one is a script nobody ran, and
  // the screen that writes it cannot save; the forms that read it carry on with their usual
  // questions, so nothing else shows the gap.
  for (const [table, script] of Object.entries(REQUIRED_TABLES)) {
    try {
      const { error } = await db.from(table).select("id").limit(1);
      if (!error) {
        checks.push({ name: `${table} table present`, ok: true });
        continue;
      }
      // Only a missing table earns the script. Any other error (the database not answering,
      // a refused read) is reported as it is, without sending anyone to the SQL editor.
      const absent = error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message || "");
      if (!absent) {
        checks.push({ name: `${table} table present`, ok: false, detail: error.message });
        continue;
      }
      const fix = `${table} does not exist yet. ${runThese([script])}`;
      checks.push({ name: `${table} table present`, ok: false, detail: full ? `${error.message}. ${fix}` : fix, fix });
    } catch (e: any) {
      checks.push({ name: `${table} table present`, ok: false, detail: e?.message });
    }
  }

  const ok = checks.every((c) => c.ok);
  // Without the secret a failing check still says what to do about it. The fix names a
  // script that is already public in this repository, so it gives away nothing the store
  // would not want said out loud, and it is the difference between a ticket somebody can
  // close and a ticket that comes back after every deploy.
  const body = full
    ? { ok, configured: true, checks }
    : {
        ok,
        configured: true,
        checks: checks.map((c) => (c.ok || !c.fix ? { name: c.name, ok: c.ok } : { name: c.name, ok: c.ok, detail: c.fix }))
      };
  // Always 200: the watchdog reads `ok`, and a non-200 would be indistinguishable from the
  // site being down, which is a different problem with a different fix.
  return NextResponse.json(body);
}
