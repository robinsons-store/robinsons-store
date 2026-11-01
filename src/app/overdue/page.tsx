"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue, round2, todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit } from "@/lib/edit";
import {
  PAYMENT_METHODS, CONFIRMATION_FILING, referenceLabel, referenceHelp, invoiceTotal, isFutureDate,
  recordPaymentRpc, reconcilePostdated, fetchSettlements,
  remainingOwed, remainingToAllocate, type InvoiceSettlement
} from "@/lib/payments";
import type { Invoice } from "@/lib/types";

export default function Overdue() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const showMoney = canSeeMoney(role);
  const mayEdit = canEdit(role);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  // Demo mode identity: the error "pick who you are" must be fixable RIGHT HERE, not by
  // navigating away and losing the filled-in form.
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [actorId, setActorIdState] = useState("");
  function setActor(uid: string) {
    setActorIdState(uid);
    if (typeof window !== "undefined") localStorage.setItem("rgs_actor", uid);
  }
  const [payForm, setPayForm] = useState({ amount: "", paid_date: todayISO(), method: "cheque", reference: "", notes: "", filing: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    // Post-dated cheques whose date has arrived flip to paid on their own here. Editors
    // only: a status write should never be triggered by a viewer's page load.
    if (mayEdit) await reconcilePostdated();
    let query = supabase
      .from("invoice")
      .select("id, vendor_id, invoice_number, amount, hst_amount, freight_charges, tax_mode, terms, due_date, status, vendor:vendor_id(name)")
      .is("voided_at", null)
      .in("status", ["unpaid", "partially_paid", "postdated"])
      .order("due_date", { ascending: true });
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      return;
    }
    let list = (data as unknown as Invoice[]) || [];
    // Once login is on, a role that cannot see money gets no invoice rows at all
    // (supabase/money_by_role.sql). It reads the same open invoices, with no amounts, from the
    // invoice_due view, and vendor names from vendor_directory. A money role gets the same rows
    // from either, so an empty table means nothing is outstanding and the view says the same.
    if (list.length === 0) list = await dueWithoutAmounts();
    setInvoices(list);
    try {
      setSettlements(await fetchSettlements(list.map((i) => i.id)));
    } catch {
      setSettlements(new Map());
    }
  }

  async function dueWithoutAmounts(): Promise<Invoice[]> {
    let dq = supabase
      .from("invoice_due")
      .select("id, vendor_id, invoice_number, terms, due_date, status")
      .is("voided_at", null)
      .in("status", ["unpaid", "partially_paid", "postdated"])
      .order("due_date", { ascending: true });
    let vq = supabase.from("vendor_directory").select("id, name");
    if (storeId) {
      dq = dq.eq("store_id", storeId);
      vq = vq.eq("store_id", storeId);
    }
    const [due, vendors] = await Promise.all([dq, vq]);
    if (due.error || vendors.error) return [];
    const names = new Map(((vendors.data as { id: string; name: string }[]) || []).map((v) => [v.id, v.name]));
    return ((due.data as any[]) || []).map((r) => ({
      ...r,
      amount: null,
      hst_amount: null,
      freight_charges: null,
      tax_mode: null,
      vendor: r.vendor_id ? { name: names.get(r.vendor_id) || "" } : null
    })) as unknown as Invoice[];
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      await load();
      if (!REQUIRE_AUTH) {
        const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
        setUsers((us as any[]) || []);
        const saved = typeof window !== "undefined" ? localStorage.getItem("rgs_actor") : null;
        setActorIdState(saved || "");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  const total = (i: Invoice) => invoiceTotal(i);
  // Owed = invoice total minus settled payments. Post-dated money has not left the account,
  // so it still counts as owed; the chip shows the invoice is covered.
  const owed = (i: Invoice) => remainingOwed(total(i), settlements.get(i.id));
  const toPay = (i: Invoice) => round2(remainingToAllocate(total(i), settlements.get(i.id)));
  const outstanding = useMemo(
    () => invoices.reduce((s, i) => s + owed(i), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, settlements]
  );

  // Record what is left on the invoice through the record_payment RPC: payment row,
  // allocation, recomputed invoice status, and the audit entries in one transaction.
  // A future paid date records it as post-dated and the invoice stays here until it clears.
  async function recordPayment(i: Invoice) {
    if (payForm.method === "other" && !payForm.notes.trim()) {
      setError("Method is Other: say what it was in the notes.");
      return;
    }
    const actor = currentActorId(member);
    if (!actor) {
      setError("Pick who you are first: choose your name under Acting as on any main screen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // What is left to pay, from the database as of right now, not from what this screen
      // loaded earlier: this is the double-payment guard when a retry or a second person
      // already settled the invoice.
      const fresh = await fetchSettlements([i.id]);
      const left = round2(remainingToAllocate(total(i), fresh.get(i.id)));
      if (left <= 0) {
        setError("Nothing left to pay on this invoice; a payment already covers it. Refreshing the list.");
        await load();
        return;
      }
      const amount = round2(Number(payForm.amount) || 0);
      if (amount <= 0) {
        setError("Enter the payment amount.");
        return;
      }
      if (amount > left) {
        setError(`That is more than the ${formatCAD(left)} still owed on this invoice. Lower the amount, or record the extra as a deposit on the Vendor payouts screen.`);
        return;
      }
      await recordPaymentRpc({
        vendorId: i.vendor_id as string,
        method: payForm.method,
        paidDate: payForm.paid_date || todayISO(),
        reference: payForm.reference,
        notes: payForm.notes,
        confirmationFiling: payForm.filing,
        actorId: actor,
        allocations: [{ invoice_id: i.id, amount }]
      });
      setPayingId(null);
      // Statuses may have shifted (paid, or post-dated with a future date); reload the list.
      await load();
    } catch (e: any) {
      setError(e.message);
      // Refresh anyway: if the payment committed and only the response was lost, the
      // reloaded settlements show it, so a retry cannot double-pay.
      await load();
    } finally {
      setBusy(false);
    }
  }

  function band(status: string, d: number | null): { cls: string; text: string } {
    if (status === "postdated") return { cls: "chip-progress", text: "post-dated" };
    if (d == null) return { cls: "chip-neutral", text: "no due date" };
    if (d > 0) return { cls: "chip-error", text: `${d} days overdue` };
    if (d >= -7) return { cls: "chip-warning", text: d === 0 ? "due today" : `due in ${-d} days` };
    return { cls: "chip-neutral", text: `due in ${-d} days` };
  }

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Outstanding and overdue</h1>
        </div>
        <div className="page-actions">
          {!REQUIRE_AUTH && users.length > 0 && (
            <>
              <label className="help" htmlFor="od-actor">Acting as </label>
              <select id="od-actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px", marginRight: 10 }} value={actorId} onChange={(e) => setActor(e.target.value)}>
                <option value="">Pick your name</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </>
          )}
          {showMoney && <span className="tabular help">{formatCAD(outstanding)} owed</span>}
        </div>
      </header>

      {loading && <p className="help">Loading invoices.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}</p>
        </div>
      )}
      {!loading && !error && invoices.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing outstanding.</p>
          <p className="help" style={{ margin: "6px 0 0" }}>Every invoice on file is paid.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {invoices.map((i) => {
          const d = daysOverdue(i.due_date);
          const b = band(i.status, d);
          return (
            <div key={i.id} className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {/* The name opens the vendor's full ledger, so an overdue row is never a dead end.
                        The ledger is money, so a role that cannot see money gets the name alone. */}
                    {i.vendor_id && showMoney ? (
                      <Link href={`/vendors/${i.vendor_id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{i.vendor?.name || "Vendor"}</Link>
                    ) : (
                      <strong>{i.vendor?.name || "Vendor"}</strong>
                    )}
                    <span className={`chip ${b.cls}`}>{b.text}</span>
                    {i.status === "partially_paid" && <span className="chip chip-progress">partially paid</span>}
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {i.invoice_number || ""}{i.due_date ? ` . due ${i.due_date}` : ""}{i.terms ? ` . ${i.terms}` : ""}
                    {showMoney && i.status === "partially_paid" ? ` . ${formatCAD(owed(i))} of ${formatCAD(total(i))} still owed` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {showMoney && <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(owed(i))}</div>}
                  {showMoney && mayEdit && payingId !== i.id && i.status !== "postdated" && (
                    <button
                      className="btn-ghost"
                      style={{ padding: "4px 10px" }}
                      onClick={() => { setPayingId(i.id); setPayForm({ amount: String(toPay(i) || ""), paid_date: todayISO(), method: "cheque", reference: "", notes: "", filing: "" }); }}
                      disabled={busy}
                    >
                      Record payment
                    </button>
                  )}
                </div>
              </div>
              {showMoney && mayEdit && payingId === i.id && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label className="label" htmlFor={`pay-amt-${i.id}`}>Amount</label>
                    <input id={`pay-amt-${i.id}`} className="input tabular" style={{ width: 120 }} type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                    <p className="help" style={{ margin: "4px 0 0" }}>A smaller amount records a partial payment.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-date-${i.id}`}>Paid date</label>
                    <input id={`pay-date-${i.id}`} className="input" type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} />
                    {isFutureDate(payForm.paid_date) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: records as post-dated.</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-method-${i.id}`}>Method</label>
                    <select id={`pay-method-${i.id}`} className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-ref-${i.id}`}>{referenceLabel(payForm.method)}</label>
                    <input id={`pay-ref-${i.id}`} className="input" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
                    <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(payForm.method)}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-filing-${i.id}`}>Confirmation filed</label>
                    <select id={`pay-filing-${i.id}`} className="input" value={payForm.filing} onChange={(e) => setPayForm({ ...payForm, filing: e.target.value })}>
                      <option value="">Not said</option>
                      {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-notes-${i.id}`}>{payForm.method === "other" ? "Notes (say what the method was)" : "Notes"}</label>
                    <input id={`pay-notes-${i.id}`} className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
                  </div>
                  <button className="btn-primary" onClick={() => recordPayment(i)} disabled={busy}>
                    {busy ? "Saving." : `Record ${formatCAD(round2(Number(payForm.amount) || 0))}`}
                  </button>
                  <button className="btn-ghost" onClick={() => setPayingId(null)} disabled={busy}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
