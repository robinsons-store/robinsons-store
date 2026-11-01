"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";
import { formatCAD, round2 } from "@/lib/format";
import { sortDepartments } from "@/lib/departments";
import { useActiveStore } from "@/lib/store";
import { documentPath } from "@/lib/documentPath";
import { REQUIRE_AUTH, authHeader, canSeeMoney, useEffectiveActor } from "@/lib/auth";
import type { AppUser, Department, Draft, LineItem } from "@/lib/types";
import { prepareForExtraction, readableSize } from "@/lib/imagePrep";
import { editLine, linesToSave } from "@/lib/captureLines";

type VendorLite = { id: string; name: string; department_id: string | null; default_terms: string | null };
type POLite = { vendor_id: string | null; order_amount: number | null };

// Reading the file for the model now lives in lib/imagePrep, which shrinks the COPY sent for
// extraction when a phone photo is too big to send. The original still goes to Storage at
// full size: that upload is the store's six-year record of the invoice.

const LOW_CONFIDENCE = 0.7;

export default function Capture() {
  const router = useRouter();
  const { storeId, ready } = useActiveStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [pos, setPos] = useState<POLite[]>([]);
  const [taxRate, setTaxRate] = useState(0.13);
  const [deptId, setDeptId] = useState("");
  const [userId, setUserId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Set when the copy sent for reading was shrunk, so the screen can say so quietly.
  const [reduced, setReduced] = useState<{ from: number; to: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(false);
  const [ack, setAck] = useState(false);
  const [lowAck, setLowAck] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Effective actor and role: the signed-in member in enforced auth, else the dropdown.
  const { effectiveActorId, role } = useEffectiveActor(users, userId);
  const showMoney = canSeeMoney(role);
  // Line grid drops the unit cost column for staff, keeping description, qty, and retail note.
  const lineGrid = showMoney ? "3fr 1fr 1.2fr 1.2fr 32px" : "3fr 1fr 1.2fr 32px";

  useEffect(() => {
    if (!ready) return;
    (async () => {
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const { data: depts } = await dq;
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      // Staff capture too, and once login is on the vendor table returns them no rows
      // (supabase/money_by_role.sql), so the match list comes from the money-free view for
      // every role. Order amounts stay on purchase_order, which only a money role can read:
      // the discrepancy check below only runs for those roles anyway. A database that has
      // not run money_by_role.sql yet has no view; the vendor table answers then, so a deploy
      // that lands before its migration does not lose the vendor match or the order check.
      const vendorList = (from: "vendor_directory" | "vendor") => {
        const q = supabase.from(from).select("id, name, department_id, default_terms").is("voided_at", null);
        return storeId ? q.eq("store_id", storeId) : q;
      };
      let { data: vs, error: ve } = await vendorList("vendor_directory");
      if (ve) ({ data: vs } = await vendorList("vendor"));
      let pq = supabase.from("purchase_order").select("vendor_id, order_amount").is("voided_at", null);
      if (storeId) pq = pq.eq("store_id", storeId);
      const { data: po } = await pq;
      const { data: tr } = await supabase.from("tax_rules").select("rate").eq("region", "Ontario").limit(1).maybeSingle();
      const ds = (depts as Department[]) || [];
      const usr = (us as AppUser[]) || [];
      setDepartments(sortDepartments(ds));
      setUsers(usr);
      setVendors((vs as VendorLite[]) || []);
      setPos((po as POLite[]) || []);
      if (tr && tr.rate != null) setTaxRate(Number(tr.rate));
      setDeptId(ds.find((d) => d.name === "Hardware")?.id || ds[0]?.id || "");
      if (usr[0]) setUserId(usr.find((u) => u.role === "staff")?.id || usr[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  function pickFile(f: File | null) {
    setError(null);
    setSaved(false);
    setDraft(null);
    setManual(false);
    setAck(false);
    setLowAck(false);
    setReduced(null);
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  // Fallback for a phone order with no document: open the same confirm form, blank, so it
  // can be typed and posted to the feed with author and time. Photo-first stays the default.
  function startManual() {
    setError(null);
    setSaved(false);
    setFile(null);
    setReduced(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setAck(false);
    setLowAck(false);
    setManual(true);
    setDraft({ vendor: "", invoice_date: "", notes: "", line_items: [{ description: "", qty: null, unit_cost: null, retail_price_note: null, confidence: 1 }] });
  }

  async function extract() {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      // Shrinks a large phone photo before sending, automatically. Nobody is asked to do
      // anything: a 12 megapixel picture would otherwise exceed the request body limit and
      // fail at the receiving door. The file itself is untouched and is what gets stored.
      const prepared = await prepareForExtraction(file);
      setReduced(prepared.reduced ? { from: prepared.originalBytes, to: prepared.sentBytes } : null);
      const resp = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ imageBase64: prepared.base64, mediaType: prepared.mediaType, store_id: storeId })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "extraction failed");
      setAck(false);
      setLowAck(false);
      setDraft({
        vendor: data.vendor || "",
        invoice_date: data.invoice_date || "",
        notes: data.notes || "",
        line_items: (data.line_items || []).map((l: any) => ({
          description: l.description || "",
          qty: l.qty ?? null,
          unit_cost: l.unit_cost ?? null,
          retail_price_note: l.retail_price_note ?? null,
          confidence: l.confidence ?? null
        }))
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  }

  function updateLine(i: number, patch: Partial<LineItem>) {
    if (!draft) return;
    const next = [...draft.line_items];
    // Only a person retyping the unit cost clears the line's low-confidence flag (see
    // lib/captureLines). Fixing the description or qty leaves the line amber.
    next[i] = editLine(next[i], patch);
    setDraft({ ...draft, line_items: next });
  }

  function addLine() {
    if (!draft) return;
    setDraft({ ...draft, line_items: [...draft.line_items, { description: "", qty: null, unit_cost: null, retail_price_note: null, confidence: 1 }] });
  }

  function removeLine(i: number) {
    if (!draft) return;
    setDraft({ ...draft, line_items: draft.line_items.filter((_, idx) => idx !== i) });
  }

  // Totals (pre-tax subtotal, HST, total). Money is dollars in the demo.
  const subtotal = draft ? round2(draft.line_items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)) : 0;
  const hst = round2(subtotal * taxRate);
  const total = round2(subtotal + hst);

  // Match the typed vendor to a known vendor in this department, then look for an order to reconcile against.
  const matchedVendor = draft
    ? vendors.find((v) => v.department_id === deptId && v.name.trim().toLowerCase() === draft.vendor.trim().toLowerCase())
    : undefined;
  const matchedPO = matchedVendor ? pos.find((p) => p.vendor_id === matchedVendor.id && p.order_amount != null) : undefined;
  const orderAmount = matchedPO?.order_amount ?? null;
  const discrepancy = orderAmount != null ? round2(subtotal - orderAmount) : null;
  // The order-vs-invoiced check compares dollar amounts, so it is only surfaced (and only
  // gates the save) for roles that can see money. Staff capture quantities and post.
  const hasDiscrepancy = showMoney && discrepancy != null && Math.abs(discrepancy) >= 0.01;

  // The hard low-confidence gate: any line still flagged amber blocks the save until the
  // person either retypes its unit cost (that clears the flag) or explicitly confirms they
  // checked it. Staff never see the cost, so their amber lines are saved without one for the
  // owner to enter. The acknowledgement is stored on the event, and the database trigger
  // refuses a low-confidence dollar line whose event lacks it, so the rule holds outside
  // this screen too.
  const lowLines = draft ? draft.line_items.filter((l) => l.confidence !== null && l.confidence < LOW_CONFIDENCE).length : 0;
  const hasLowFlags = lowLines > 0;

  async function save() {
    if (!draft || (!file && !manual) || !deptId || !effectiveActorId || !storeId) return;
    if (hasDiscrepancy && !ack) return;
    if (hasLowFlags && !lowAck) return;
    setSaving(true);
    setError(null);
    try {
      // Photo capture uploads the document; a manual phone-order entry has no file to store.
      // Staff may save the photo but not open it again: it shows prices (supabase/auth_setup.sql 3f).
      let path: string | null = null;
      if (file) {
        path = documentPath(storeId, "invoices", deptId, `${Date.now()}_${file.name.replace(/\s+/g, "_")}`);
        const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, { upsert: false });
        if (up.error) throw new Error(`storage: ${up.error.message}`);
      }

      const ev = await supabase
        .from("receiving_event")
        .insert({
          store_id: storeId,
          department_id: deptId,
          vendor_id: matchedVendor?.id ?? null,
          vendor_name: draft.vendor,
          received_date: draft.invoice_date || null,
          notes: draft.notes || null,
          source_file_path: path,
          status: "confirmed",
          discrepancy_ack: hasDiscrepancy ? ack : false,
          low_confidence_ack: hasLowFlags ? lowAck : false,
          created_by: effectiveActorId
        })
        .select("id")
        .single();
      if (ev.error) throw new Error(`event: ${ev.error.message}`);

      const eventId = ev.data.id as string;
      if (draft.line_items.length) {
        const lines = linesToSave(draft.line_items, showMoney, LOW_CONFIDENCE).map((l) => ({ receiving_event_id: eventId, ...l }));
        const li = await supabase.from("receiving_line").insert(lines);
        if (li.error) throw new Error(`lines: ${li.error.message}`);
      }

      await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "received", entity: "receiving_event", entity_id: eventId });

      // Clear the form fields directly. Do not call pickFile(null) here: it resets `saved`
      // to false in the same React batch, which would hide the confirmation card.
      setSaved(true);
      setDraft(null);
      setFile(null);
      setManual(false);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setAck(false);
      setLowAck(false);
      setTimeout(() => router.push("/"), 900);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Capture a receiving</h1>
          <p className="page-sub">Drop the invoice, confirm, done</p>
        </div>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: REQUIRE_AUTH ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <label className="label" htmlFor="dept">Department</label>
            <select id="dept" className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {!REQUIRE_AUTH && (
            <div>
              <label className="label" htmlFor="user">Acting as</label>
              <select id="user" className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] || null); }}
          onClick={() => inputRef.current?.click()}
          style={{ width: "100%", border: "2px dashed var(--border-strong)", borderRadius: 14, padding: file || preview ? 16 : "44px 20px", textAlign: "center", cursor: "pointer", background: "#fff" }}
        >
          {preview ? (
            <img src={preview} alt="preview" style={{ maxHeight: 220, maxWidth: "100%", borderRadius: 8 }} />
          ) : file ? (
            <p style={{ margin: 0 }}>{file.name}</p>
          ) : (
            <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
              <span className="kpi-icon" style={{ width: 46, height: 46, borderRadius: 12, marginBottom: 6 }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.6" /><path d="M9 7l1.4-2.5h3.2L15 7" />
                </svg>
              </span>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>Take a photo or choose a file</p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Drop a vendor invoice here</p>
              <p className="help" style={{ margin: 0 }}>or click to choose an image or PDF</p>
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
        </div>

        {/* Said once, quietly, and only when it happened. Staff took a big photo and it
            worked; they do not need to change anything. The line exists so that a person
            comparing the crisp original on the vendor page against the copy that was read
            is not left wondering, not to ask anybody to do something. */}
        {reduced && (
          <p className="help" style={{ margin: 0 }}>
            Large photo, so a smaller copy was sent to be read ({readableSize(reduced.from)} to {readableSize(reduced.to)}). Your original is saved at full size.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" style={{ flex: "1 1 180px", minWidth: 160 }} onClick={extract} disabled={!file || extracting}>
            {extracting ? "Reading the invoice." : "Extract"}
          </button>
          {!file && !manual && <button className="btn-ghost" style={{ flex: "1 1 160px", minWidth: 160 }} onClick={startManual}>Enter manually</button>}
          {(file || manual) && <button className="btn-ghost" style={{ flex: "1 1 160px", minWidth: 160 }} onClick={() => pickFile(null)}>Clear</button>}
        </div>
        {!file && !draft && !saved && (
          <p className="help" style={{ margin: 0 }}>The invoice photo fills the form for you. You confirm one screen, then save. No document? Enter a phone order by hand.</p>
        )}
      </div>

      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}</p>
        </div>
      )}

      {saved && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-success">Saved</span>
          <p className="help" style={{ marginTop: 8 }}>Posted to the feed. Taking you there.</p>
        </div>
      )}

      {draft && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{manual ? "Enter the order" : "Confirm"}</h2>
            <span className="chip chip-progress">{manual ? "Type the vendor, date, and lines, then save" : "Fields in amber were uncertain, check them"}</span>
          </div>

          {hasDiscrepancy && (
            <div className="card" style={{ padding: 12, background: "var(--warning-tint)", borderColor: "var(--warning-base)" }}>
              <span className="chip chip-warning">&#9888; Order vs invoiced</span>
              <p className="help" style={{ marginTop: 8, color: "var(--text-primary)" }}>
                Ordered {formatCAD(orderAmount)} vs invoiced {formatCAD(subtotal)} (pre-tax).{" "}
                {discrepancy! < 0
                  ? `Short by ${formatCAD(Math.abs(discrepancy!))}. Check for missing items.`
                  : `Over by ${formatCAD(discrepancy!)}. Check for extra or unordered items.`}
              </p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I checked this discrepancy
              </label>
            </div>
          )}
          {showMoney && matchedVendor && !matchedPO && (
            <p className="help">No order amount on file for {matchedVendor.name} to compare against.</p>
          )}

          {hasLowFlags && (
            <div className="card" style={{ padding: 12, background: "var(--warning-tint)", borderColor: "var(--warning-base)" }}>
              <span className="chip chip-warning">&#9888; Uncertain fields</span>
              <p className="help" style={{ marginTop: 8, color: "var(--text-primary)" }}>
                {lowLines === 1 ? "1 line was" : `${lowLines} lines were`} read with low confidence and {lowLines === 1 ? "is" : "are"} shown in amber.{" "}
                {showMoney
                  ? "Retyping the unit cost clears a line. Tick the box once you have checked the rest."
                  : "Amber lines are saved without a cost, for the owner to enter. Check the description and qty, then tick the box."}
              </p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13 }}>
                <input type="checkbox" checked={lowAck} onChange={(e) => setLowAck(e.target.checked)} />
                I checked every amber line
              </label>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div>
              <label className="label">Vendor</label>
              <input className="input" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
            </div>
            <div>
              <label className="label">Invoice date</label>
              <input className="input" type="date" value={draft.invoice_date} onChange={(e) => setDraft({ ...draft, invoice_date: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Line items</label>
            <div className="tbl-wrap">
              <div style={{ display: "grid", gap: 8, minWidth: showMoney ? 640 : 520 }}>
                <div className="help" style={{ display: "grid", gridTemplateColumns: lineGrid, gap: 8 }}>
                  <span>Description</span><span>Qty</span>{showMoney && <span>Unit cost</span>}<span>Retail note</span><span></span>
                </div>
                {draft.line_items.map((l, i) => {
                  const low = l.confidence !== null && l.confidence < LOW_CONFIDENCE;
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: lineGrid, gap: 8 }}>
                      <input className={`input ${low ? "field-flag" : ""}`} style={{ minWidth: 0 }} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                      <input className={`input tabular ${low ? "field-flag" : ""}`} style={{ minWidth: 0 }} value={l.qty ?? ""} onChange={(e) => updateLine(i, { qty: e.target.value === "" ? null : Number(e.target.value) })} />
                      {showMoney && <input className={`input tabular ${low ? "field-flag" : ""}`} style={{ minWidth: 0 }} value={l.unit_cost ?? ""} onChange={(e) => updateLine(i, { unit_cost: e.target.value === "" ? null : Number(e.target.value) })} />}
                      <input className="input tabular" style={{ minWidth: 0 }} value={l.retail_price_note ?? ""} onChange={(e) => updateLine(i, { retail_price_note: e.target.value === "" ? null : Number(e.target.value) })} />
                      <button className="btn-ghost" style={{ padding: "6px 8px" }} onClick={() => removeLine(i)} aria-label="remove line">x</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={addLine}>Add line</button>
          </div>

          {showMoney && (
            <div style={{ maxWidth: 280, marginLeft: "auto", width: "100%" }}>
              <div className="totals-row"><span className="help">Subtotal</span><span className="tabular">{formatCAD(subtotal)}</span></div>
              <div className="totals-row"><span className="help">HST ({Math.round(taxRate * 100)}%)</span><span className="tabular">{formatCAD(hst)}</span></div>
              <div className="totals-row total"><span>Total</span><span className="tabular">{formatCAD(total)}</span></div>
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-primary" style={{ flex: "1 1 200px", minWidth: 160, maxWidth: 360 }} onClick={save} disabled={saving || !storeId || (hasDiscrepancy && !ack) || (hasLowFlags && !lowAck)}>
              {saving ? "Saving." : "Save to feed"}
            </button>
            {hasDiscrepancy && !ack && (
              <span className="help">Acknowledge the discrepancy to save.</span>
            )}
            {hasLowFlags && !lowAck && (
              <span className="help">Check the amber lines to save.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
