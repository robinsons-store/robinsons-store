"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, dueBand } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, canSeeMoney, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import type { Licence, InsurancePolicy, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";

export default function Compliance() {
  const { storeId, ready } = useActiveStore();
  const [licences, setLicences] = useState<Licence[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addLic, setAddLic] = useState(false);
  const [editLic, setEditLic] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", authority: "", number: "", holder: "", expiry_date: "" });

  const [addPol, setAddPol] = useState(false);
  const [editPol, setEditPol] = useState<string | null>(null);
  const [polForm, setPolForm] = useState({ name: "", provider: "", policy_number: "", coverage: "", premium: "", renewal_date: "", notes: "" });

  // Effective actor and role: the signed-in member in enforced auth, else the dropdown.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);
  const showMoney = canSeeMoney(role);

  async function load() {
    let lq = supabase.from("licence").select("id, store_id, name, authority, number, holder, expiry_date").is("voided_at", null).order("expiry_date", { ascending: true, nullsFirst: false });
    if (storeId) lq = lq.eq("store_id", storeId);
    const l = await lq;
    if (l.error) { setError(l.error.message); return; }
    setLicences((l.data as unknown as Licence[]) || []);
    let pq = supabase.from("insurance_policy").select("id, store_id, name, provider, policy_number, coverage, premium, renewal_date, notes").is("voided_at", null).order("renewal_date", { ascending: true, nullsFirst: false });
    if (storeId) pq = pq.eq("store_id", storeId);
    const p = await pq;
    let list = (p.data as unknown as InsurancePolicy[]) || [];
    // Once login is on, a role that cannot see money gets no policy rows (the premium is on the
    // row; supabase/money_by_role.sql). It reads names and renewal dates from the
    // insurance_renewal view instead. A money role gets the same policies from either.
    if (!p.error && list.length === 0) {
      let rq = supabase.from("insurance_renewal").select("id, store_id, name, renewal_date").is("voided_at", null).order("renewal_date", { ascending: true, nullsFirst: false });
      if (storeId) rq = rq.eq("store_id", storeId);
      const r = await rq;
      if (!r.error) list = (r.data as unknown as InsurancePolicy[]) || [];
    }
    setPolicies(list);
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      await load();
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const usr = (us as AppUser[]) || [];
      setUsers(usr);
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTOR_KEY) : null;
      setActorId(saved || usr[0]?.id || "");
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  function setActor(uid: string) {
    setActorId(uid);
    if (typeof window !== "undefined") localStorage.setItem(ACTOR_KEY, uid);
  }

  function startAdd() {
    setEditLic(null);
    setForm({ name: "", authority: "", number: "", holder: "", expiry_date: "" });
    setAddLic(true);
  }
  function startEdit(l: Licence) {
    setAddLic(false);
    setForm({ name: l.name, authority: l.authority || "", number: l.number || "", holder: l.holder || "", expiry_date: l.expiry_date || "" });
    setEditLic(l.id);
  }

  async function saveLic() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const row = {
        name: form.name.trim(),
        authority: form.authority || null,
        number: form.number || null,
        holder: form.holder || null,
        expiry_date: form.expiry_date || null
      };
      if (editLic) {
        const r = await supabase.from("licence").update(row).eq("id", editLic);
        if (r.error) throw new Error(r.error.message);
        if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "licence_edited", entity: "licence", entity_id: editLic });
      } else {
        const r = await supabase.from("licence").insert({ ...row, store_id: storeId }).select("id").single();
        if (r.error) throw new Error(r.error.message);
        if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "licence_added", entity: "licence", entity_id: r.data.id as string });
      }
      setAddLic(false);
      setEditLic(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startAddPol() {
    setEditPol(null);
    setPolForm({ name: "", provider: "", policy_number: "", coverage: "", premium: "", renewal_date: "", notes: "" });
    setAddPol(true);
  }
  function startEditPol(p: InsurancePolicy) {
    setAddPol(false);
    setPolForm({ name: p.name, provider: p.provider || "", policy_number: p.policy_number || "", coverage: p.coverage || "", premium: p.premium != null ? String(p.premium) : "", renewal_date: p.renewal_date || "", notes: p.notes || "" });
    setEditPol(p.id);
  }
  async function savePol() {
    if (!polForm.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const row = {
        name: polForm.name.trim(),
        provider: polForm.provider || null,
        policy_number: polForm.policy_number || null,
        coverage: polForm.coverage || null,
        premium: polForm.premium.trim() === "" ? null : Number(polForm.premium),
        renewal_date: polForm.renewal_date || null,
        notes: polForm.notes || null
      };
      if (editPol) {
        const r = await supabase.from("insurance_policy").update(row).eq("id", editPol);
        if (r.error) throw new Error(r.error.message);
        if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "insurance_edited", entity: "insurance_policy", entity_id: editPol });
      } else {
        const r = await supabase.from("insurance_policy").insert({ ...row, store_id: storeId }).select("id").single();
        if (r.error) throw new Error(r.error.message);
        if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "insurance_added", entity: "insurance_policy", entity_id: r.data.id as string });
      }
      setAddPol(false);
      setEditPol(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteLic(id: string) {
    if (!window.confirm("Delete this licence? This cannot be undone from here.")) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("licence", id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePol(id: string) {
    if (!window.confirm("Delete this policy? This cannot be undone from here.")) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("insurance_policy", id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">Compliance</h1>
          <p className="page-sub">Licences, certifications, and insurance renewals. The store sells regulated pesticides under an Ontario vendor licence that must be kept current.</p>
        </div>
        <div className="page-actions">
          {!REQUIRE_AUTH && (
            <div>
              <label className="help" htmlFor="actor">Acting as </label>
              <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </div>
          )}
        </div>
      </header>

      {loading && <p className="help">Loading.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && (
        <>
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Licences and certifications</h2>
              <button className="btn-ghost" onClick={startAdd}>{addLic ? "Close" : "+ Add licence"}</button>
            </div>
            {(addLic || editLic) && (
              <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><label className="label">Authority</label><input className="input" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} /></div>
                  <div><label className="label">Number</label><input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
                  <div><label className="label">Holder</label><input className="input" value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} /></div>
                  <div><label className="label">Expiry date</label><input className="input" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={saveLic} disabled={busy || !form.name.trim()}>{busy ? "Saving." : "Save licence"}</button>
                  <button className="btn-ghost" onClick={() => { setAddLic(false); setEditLic(null); }}>Cancel</button>
                </div>
              </div>
            )}
            {licences.length === 0 && <p className="help">No licences on file. Add the Ontario pesticide vendor licence with + Add licence.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {licences.map((l) => {
                const band = dueBand(l.expiry_date, 30);
                return (
                  <div key={l.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{l.name}</strong>
                        {l.expiry_date
                          ? <span className={`chip ${band.cls}`}>{band.cls === "chip-error" ? band.text : `expires ${band.text}`}</span>
                          : <span className="chip chip-neutral">no expiry on file</span>}
                      </div>
                      <div className="help" style={{ marginTop: 4 }}>
                        {[l.authority, l.number ? `no. ${l.number}` : "", l.holder, l.expiry_date ? `expiry ${l.expiry_date}` : ""].filter(Boolean).join(" . ")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEdit(l)}>Edit</button>
                      {canEdit(role) && (
                        <button className="btn-ghost" style={{ padding: "4px 10px", color: "var(--error-base)" }} onClick={() => deleteLic(l.id)} disabled={busy}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Insurance renewals</h2>
              <button className="btn-ghost" onClick={startAddPol}>{addPol ? "Close" : "+ Add policy"}</button>
            </div>
            {(addPol || editPol) && (
              <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div><label className="label">Name</label><input className="input" value={polForm.name} onChange={(e) => setPolForm({ ...polForm, name: e.target.value })} /></div>
                  <div><label className="label">Provider</label><input className="input" value={polForm.provider} onChange={(e) => setPolForm({ ...polForm, provider: e.target.value })} /></div>
                  <div><label className="label">Policy number</label><input className="input" value={polForm.policy_number} onChange={(e) => setPolForm({ ...polForm, policy_number: e.target.value })} /></div>
                  <div><label className="label">Coverage</label><input className="input" value={polForm.coverage} onChange={(e) => setPolForm({ ...polForm, coverage: e.target.value })} /></div>
                  {showMoney && <div><label className="label">Premium</label><input className="input tabular" type="number" step="0.01" value={polForm.premium} onChange={(e) => setPolForm({ ...polForm, premium: e.target.value })} /></div>}
                  <div><label className="label">Renewal date</label><input className="input" type="date" value={polForm.renewal_date} onChange={(e) => setPolForm({ ...polForm, renewal_date: e.target.value })} /></div>
                </div>
                <div><label className="label">Notes</label><input className="input" value={polForm.notes} onChange={(e) => setPolForm({ ...polForm, notes: e.target.value })} /></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={savePol} disabled={busy || !polForm.name.trim()}>{busy ? "Saving." : "Save policy"}</button>
                  <button className="btn-ghost" onClick={() => { setAddPol(false); setEditPol(null); }}>Cancel</button>
                </div>
              </div>
            )}
            {policies.length === 0 && <p className="help">No policies on file.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {policies.map((p) => {
                const band = dueBand(p.renewal_date, 30);
                return (
                  <div key={p.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{p.name}</strong>
                        {p.renewal_date
                          ? <span className={`chip ${band.cls}`}>{band.cls === "chip-error" ? band.text : `renews ${band.text}`}</span>
                          : <span className="chip chip-neutral">no renewal date</span>}
                      </div>
                      <div className="help" style={{ marginTop: 4 }}>
                        {[p.provider, p.policy_number ? `no. ${p.policy_number}` : "", p.coverage, p.renewal_date ? `renewal ${p.renewal_date}` : ""].filter(Boolean).join(" . ")}
                      </div>
                      {p.notes && <div className="help" style={{ marginTop: 2 }}>{p.notes}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {showMoney && p.premium != null && <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(p.premium)}<div className="help" style={{ fontWeight: 400 }}>premium</div></div>}
                      {canEdit(role) && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPol(p)}>Edit</button>
                          <button className="btn-ghost" style={{ padding: "4px 10px", color: "var(--error-base)" }} onClick={() => deletePol(p.id)} disabled={busy}>Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Compliance documents</h2>
            <div className="card" style={{ padding: 16 }}>
              <p className="help" style={{ margin: 0 }}>
                Store the licence PDF, certificates, and insurance documents in the documents bucket and link them here.
                Capture a photo of the pesticide licence through + Capture so it lives with the audit trail.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
