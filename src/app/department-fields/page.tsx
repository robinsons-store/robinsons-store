"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { fieldDepartment, sortDepartments } from "@/lib/departments";
import { VENDOR_FIELDS, asksByDefault } from "@/lib/vendorFields";
import { INVOICE_FIELDS, asksInvoice } from "@/lib/invoiceFields";
import { type FieldChoice, type FieldForm } from "@/lib/fieldChoices";
import { loadFieldChoices } from "@/lib/loadFieldChoices";
import type { Department } from "@/lib/types";

// Department fields. One table of every question on the vendor and invoice forms against
// every department, with a tick where that department is asked it. The forms draw, validate
// and save from the same answer, so a box ticked here is a box on the form.
//
// What a department gets before anybody touches this screen is the code list in
// vendorFields.ts and invoiceFields.ts, shown here as the usual answer. A change writes one
// department_field row per box and nothing else. Locked questions are the ones a save path
// or what-is-owed depends on, and this screen cannot change them. Sections (Clothing, Gifts,
// Garden Center) have no column: they follow the department they sit under.
//
// Payment questions are not on this screen yet. Which ones should vary by department is
// still open with the requester.

type Row = { key: string; label: string; locked: boolean; lockedWhy: string; note: string | null };

const FORMS: { value: FieldForm; label: string }[] = [
  { value: "vendor", label: "Vendor questions" },
  { value: "invoice", label: "Invoice questions" }
];

function rowsFor(form: FieldForm): Row[] {
  if (form === "vendor") {
    return VENDOR_FIELDS.map((f) => ({
      key: f.key,
      label: f.key === "rep_name" ? "Rep name (Technician name for maintenance)" : f.label,
      locked: !!f.locked,
      lockedWhy: "Always asked. The form cannot save without it.",
      note: f.money ? "Never shown to staff" : null
    }));
  }
  return INVOICE_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    locked: !!f.locked,
    lockedWhy: "Fixed. It decides what the invoice owes, when it is due, or where it is filed.",
    note: null
  }));
}

// What the code list alone says for this department, before any change on this screen.
function usual(form: FieldForm, departmentName: string, key: string): boolean {
  return form === "vendor" ? asksByDefault(departmentName, key) : asksInvoice(departmentName, key);
}

const cellKey = (departmentId: string, form: FieldForm, key: string) => `${departmentId}|${form}|${key}`;

export default function DepartmentFields() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const canChange = role === "owner";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [saved, setSaved] = useState<FieldChoice[]>([]);
  // Boxes changed on screen and not saved yet. A box changed back to what it was drops out,
  // so the count on the Save button is always the number of real changes.
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  const [form, setForm] = useState<FieldForm>("vendor");
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
    if (storeId) dq = dq.eq("store_id", storeId);
    const { data: ds, error: derr } = await dq;
    if (derr) setError(derr.message);
    setDepartments((ds as Department[]) || []);
    const choices = await loadFieldChoices(storeId);
    setSaved(choices.rows);
    setMissing(choices.missing);
    if (choices.error && !choices.missing) setError(choices.error);
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    // Department ids belong to one store, so unsaved boxes never carry across a store switch.
    setDraft(new Map());
    (async () => {
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  // The columns: departments in the owner's sequence. Sections are folded into the
  // department they follow and listed under the table instead.
  const columns = useMemo(() => sortDepartments(departments.filter((d) => !d.parent_department_id)), [departments]);
  const sections = useMemo(() => {
    const out: { name: string; follows: string }[] = [];
    for (const d of sortDepartments(departments.filter((x) => x.parent_department_id))) {
      const top = fieldDepartment(d.id, departments);
      if (top && top.id !== d.id) out.push({ name: d.name, follows: top.name });
    }
    return out;
  }, [departments]);

  const savedByCell = useMemo(() => {
    const m = new Map<string, FieldChoice>();
    for (const r of saved) m.set(cellKey(r.department_id, r.form, r.field_key), r);
    return m;
  }, [saved]);

  const rows = useMemo(() => rowsFor(form), [form]);

  // What a box shows before this screen's unsaved changes: the saved choice, else usual.
  function savedAnswer(d: Department, row: Row): boolean {
    // A locked question is whatever the code list says, which for freight is "not on the
    // Payrolls & Taxes form" and for everything else is "asked".
    if (row.locked) return usual(form, d.name, row.key);
    const s = savedByCell.get(cellKey(d.id, form, row.key));
    return s ? s.asked : usual(form, d.name, row.key);
  }

  function shown(d: Department, row: Row): boolean {
    const k = cellKey(d.id, form, row.key);
    return draft.has(k) ? (draft.get(k) as boolean) : savedAnswer(d, row);
  }

  function toggle(d: Department, row: Row, next: boolean) {
    if (row.locked || !canChange) return;
    const k = cellKey(d.id, form, row.key);
    setNotice(null);
    setDraft((prev) => {
      const m = new Map(prev);
      if (next === savedAnswer(d, row)) m.delete(k);
      else m.set(k, next);
      return m;
    });
  }

  const changedFromUsual = useMemo(() => {
    let n = 0;
    for (const d of columns) for (const row of rows) if (!row.locked && shown(d, row) !== usual(form, d.name, row.key)) n++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, rows, form, draft, savedByCell]);

  async function save() {
    if (!storeId || !draft.size) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const actor = currentActorId(member);
      const now = new Date().toISOString();
      const payload = [...draft].map(([k, asked]) => {
        const [department_id, f, field_key] = k.split("|");
        return { store_id: storeId, department_id, form: f, field_key, asked, updated_by: actor, updated_at: now };
      });
      const { data, error: uerr } = await supabase
        .from("department_field")
        .upsert(payload, { onConflict: "department_id,form,field_key" })
        .select("id");
      if (uerr) throw new Error(uerr.message);
      const ids = ((data as { id: string }[]) || []).map((r) => r.id);
      if (actor && ids.length) {
        await supabase.from("activity_log").insert(
          ids.map((id) => ({ actor_id: actor, action: "department_field_changed", entity: "department_field", entity_id: id }))
        );
      }
      const n = draft.size;
      setDraft(new Map());
      await load();
      setNotice(`Saved ${n} ${n === 1 ? "change" : "changes"}. The forms ask the new questions from now on.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const unsaved = draft.size;

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Department fields</h1>
          <p className="page-sub">
            Tick the questions each department&apos;s vendor and invoice forms ask. Unticking a question hides the box on the form. Anything already saved in it stays on file and still shows.
          </p>
        </div>
        {canChange && (
          <div className="page-actions">
            {unsaved > 0 && (
              <button className="btn-ghost" onClick={() => { setDraft(new Map()); setNotice(null); }} disabled={busy}>Discard changes</button>
            )}
            <button className="btn-primary" onClick={save} disabled={busy || !unsaved || missing}>
              {busy ? "Saving." : unsaved ? `Save ${unsaved} ${unsaved === 1 ? "change" : "changes"}` : "No changes"}
            </button>
          </div>
        )}
      </header>

      {loading && <p className="help">Loading departments.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {missing && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-warning">Not set up yet</span>
          <p className="help" style={{ marginTop: 8 }}>
            This screen needs supabase/department_field.sql, which runs by itself when this change reaches the live site. If this message stays, run that file in the Supabase SQL editor. Until then every form asks its usual questions.
          </p>
        </div>
      )}
      {notice && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-success">Saved</span>
          <p className="help" style={{ marginTop: 8 }}>{notice}</p>
        </div>
      )}
      {!loading && !canChange && (
        <p className="help" style={{ marginBottom: 12 }}>Only the owner can change these. This is what each department is asked today.</p>
      )}

      {!loading && (
        <>
          <div role="tablist" aria-label="Which form" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {FORMS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={form === f.value}
                className={form === f.value ? "btn-primary" : "btn-ghost"}
                onClick={() => setForm(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {columns.length === 0 ? (
            !error && (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p className="help" style={{ margin: 0 }}>No departments in this store yet.</p>
              </div>
            )
          ) : (
            <div className="card tbl-wrap" style={{ padding: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, background: "var(--panel)", minWidth: 190, zIndex: 1 }}>Question</th>
                    {columns.map((d) => (
                      <th key={d.id} style={{ textAlign: "center", minWidth: 92 }}>{d.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td style={{ position: "sticky", left: 0, background: "var(--panel)", zIndex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{row.label}</div>
                        {row.locked && <div className="help">{row.lockedWhy}</div>}
                        {row.note && <div className="help">{row.note}</div>}
                      </td>
                      {columns.map((d) => {
                        const on = shown(d, row);
                        const isUsual = on === usual(form, d.name, row.key);
                        const pending = draft.has(cellKey(d.id, form, row.key));
                        return (
                          <td key={d.id} style={{ textAlign: "center", verticalAlign: "middle" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: row.locked || !canChange ? "default" : "pointer", padding: 6 }}>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={row.locked || !canChange || busy || missing}
                                onChange={(e) => toggle(d, row, e.target.checked)}
                                aria-label={`${row.label}, ${d.name}`}
                                style={{ width: 18, height: 18 }}
                              />
                              {!row.locked && !isUsual && (
                                <span className="help" title={`Usually ${on ? "not asked" : "asked"} in ${d.name}`}>{pending ? "unsaved" : "changed"}</span>
                              )}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {changedFromUsual > 0 && (
              <p className="help" style={{ margin: 0 }}>
                {changedFromUsual} {changedFromUsual === 1 ? "box differs" : "boxes differ"} from the usual answer on this form, marked changed. Tick or untick a box again to put it back.
              </p>
            )}
            {sections.length > 0 && (
              <p className="help" style={{ margin: 0 }}>
                Sections follow the department they sit under: {sections.map((s) => `${s.name} follows ${s.follows}`).join(", ")}.
              </p>
            )}
            <p className="help" style={{ margin: 0 }}>
              The vendor forms also keep their button that adds back any question the department is not asked, for the one vendor that needs it.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
