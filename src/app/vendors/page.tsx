"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { fieldDepartment, sortDepartments } from "@/lib/departments";
import { choicesFor, type FieldChoice } from "@/lib/fieldChoices";
import { loadFieldChoices } from "@/lib/loadFieldChoices";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, canSeeMoney, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import { FieldError, fieldInputClass, type FieldErrors } from "@/components/FieldError";
import { VendorOrderingFields, type OrderingProfile } from "@/components/VendorOrderingFields";
import { OTHER_LOCATION, validateMinimumOrder, validateReorder } from "@/lib/vendorOrdering";
import { SERVICE_CATEGORIES } from "@/lib/payments";
import { asksFor, hiddenFieldCount, labelForKey } from "@/lib/vendorFields";
import type { Vendor, Department, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
// The two views that are not a department: everyone at once, and the vendors still waiting
// to be filed. Both are reachable from the department list so no vendor is ever stranded.
const ALL = "all";
const NONE = "none";
const EMPTY_FORM = {
  name: "", department_id: "", rep_name: "", phone: "", email: "", products_we_carry: "",
  default_terms: "", status: "active", notes: "", specializes_in: "",
  // The ordering profile, in the owner's screen order: below Products, above Notes.
  minimum_order_amount: "", no_minimum_order: false,
  summer_order_timeline: "", order_location: [] as string[], order_location_other: "",
  reorder_status: "", reorder_comments: ""
};

export default function Vendors() {
  const { storeId, ready } = useActiveStore();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  // The Department fields screen's ticks. Empty when nothing was changed there, or when the
  // table cannot be read, and empty means the code lists: a vendor can always be recorded.
  const [fieldRows, setFieldRows] = useState<FieldChoice[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // The directory opens on the department list, the way the store is organized. null means
  // that list; a department id, ALL, or NONE means we are inside one of them.
  const [open, setOpen] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // The escape hatch. The department decides which questions this form asks, and that map is
  // the owner's best guess; when it is wrong for one vendor, this puts every question back
  // rather than leaving somebody unable to record something true.
  const [showAllFields, setShowAllFields] = useState(false);
  // Validation messages sit under the field they are about, not in a card at the top.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Effective actor: the signed-in member in enforced auth, else the dropdown selection.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);
  const showMoney = canSeeMoney(role);

  async function load() {
    let query = supabase
      .from("vendor")
      .select("id, name, department_id, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
      .is("voided_at", null)
      .order("name");
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setVendors((data as unknown as Vendor[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    // Switching stores must land back on the department list: department ids belong to one
    // store, so a leftover selection (or a half-typed vendor) would file the next vendor
    // under the wrong store's department.
    setOpen(null);
    setQ("");
    setAdding(false);
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
    setShowAllFields(false);
    (async () => {
      await load();
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const { data: ds, error: derr } = await dq;
      if (derr) setError(derr.message);
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const dList = (ds as Department[]) || [];
      const usr = (us as AppUser[]) || [];
      setDepartments(dList);
      setFieldRows((await loadFieldChoices(storeId)).rows);
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

  // Open a department (or one of the two special views) with a clean search box.
  function openView(id: string | null) {
    setOpen(id);
    setQ("");
    setAdding(false);
    // Drop any half-typed vendor: an abandoned draft reappearing under a different
    // department is how a vendor ends up filed in the wrong place.
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
    setShowAllFields(false);
  }

  async function save() {
    if (!form.name.trim()) {
      setFieldErrors({ name: "Enter the company or vendor name." });
      return;
    }
    // Every message lands under its own field. Collect them all in one pass rather than
    // stopping at the first: fixing one problem only to be told about the next is the
    // thing that makes a long form feel like an argument.
    const errs: FieldErrors = {};
    // The minimum order is the only rule here that demands an answer where none was given, so
    // it is the only one that has to agree with what the form actually asked. Two ways in:
    // the department is asked for a minimum, or somebody answered anyway through the button
    // that puts the other questions back. The two rules below only fire on an answer already
    // given, so they need no gate and must keep running whatever the department map says.
    const answeredMinimum = !!form.minimum_order_amount.trim() || form.no_minimum_order;
    // The money gate is inside asksFor and repeated on the second branch: a required field
    // nobody can see is a form that cannot be submitted, so it fails closed on both paths.
    const askMinimum = asksFor(entryDeptName, "minimum_order", { showMoney, choices: entryChoices }) || (showMoney && answeredMinimum);
    const minErr = askMinimum ? validateMinimumOrder(form.minimum_order_amount, form.no_minimum_order) : null;
    if (minErr) errs.minimum_order_amount = minErr;
    const reErr = validateReorder(form.reorder_status, form.reorder_comments);
    if (reErr) errs.reorder_comments = reErr;
    if (form.order_location.includes(OTHER_LOCATION) && !form.order_location_other.trim()) {
      errs.order_location_other = "Say where, since Other is ticked.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      // Inside a department the department is already chosen: the form does not ask again.
      const deptId = open && open !== ALL && open !== NONE ? open : form.department_id || null;
      const r = await supabase.from("vendor").insert({
        store_id: storeId,
        name: form.name.trim(),
        department_id: deptId,
        rep_name: form.rep_name || null,
        phone: form.phone || null,
        email: form.email || null,
        products_we_carry: form.products_we_carry || null,
        default_terms: form.default_terms || null,
        specializes_in: form.specializes_in || null,
        status: form.status,
        // No minimum and an amount are mutually exclusive, so the unused side is written as
        // null rather than left to whatever was typed before the tick box was ticked. Blank
        // is null too, never 0: the check constraint refuses a zero minimum, and someone
        // who cannot see money never saw the field to fill it in.
        minimum_order_amount: form.no_minimum_order || !form.minimum_order_amount.trim() ? null : Number(form.minimum_order_amount),
        no_minimum_order: form.no_minimum_order,
        summer_order_timeline: form.summer_order_timeline.trim() || null,
        order_location: form.order_location.length ? form.order_location : null,
        order_location_other: form.order_location.includes(OTHER_LOCATION) ? form.order_location_other.trim() || null : null,
        reorder_status: form.reorder_status || null,
        // Written whatever the status says. The owner asked that a reorder note never be
        // deleted just because the status moved on; clearing it is a deliberate click.
        reorder_comments: form.reorder_comments.trim() || null,
        notes: form.notes.trim() || null
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "vendor_added", entity: "vendor", entity_id: r.data.id as string });
      setForm({ ...EMPTY_FORM });
      setFieldErrors({});
      setShowAllFields(false);
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor(v: Vendor) {
    if (!window.confirm(`Delete ${v.name}? It will be hidden from the directory but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("vendor", v.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Departments in the owner's sequence, sections rolled into their parent.
  const topCats = useMemo(() => sortDepartments(departments.filter((d) => !d.parent_department_id)), [departments]);
  const topOf = useMemo(() => {
    const parent = new Map(departments.map((d) => [d.id, d.parent_department_id]));
    return (id: string | null | undefined): string | null => {
      if (!id) return null;
      const p = parent.get(id);
      return (p as string | null) || id;
    };
  }, [departments]);

  // The department this new vendor is being filed under, as the TOP-LEVEL department, because
  // that is what the field registry and the Department fields screen key on. Inside a
  // department that is the open card; from All vendors it is the picker, which can name a
  // section such as Gifts whose questions belong to its parent. Null when no department is
  // chosen yet, which asks everything.
  const entryDept = useMemo(() => {
    const id = open && open !== ALL && open !== NONE ? open : form.department_id || null;
    return fieldDepartment(id, departments);
  }, [open, form.department_id, departments]);
  const entryDeptName = entryDept?.name ?? null;
  // That department's ticks on the Department fields screen. The form, its validation and
  // the ordering block all read these same ones.
  const entryChoices = useMemo(() => choicesFor(fieldRows, entryDept?.id, "vendor"), [fieldRows, entryDept]);

  // What the form DRAWS. Pressing the button below passes null, and null is the
  // unrecognised-department case, which already means ask everything. Validation deliberately
  // keeps using entryDeptName: putting a question back on the screen should not make it
  // mandatory, or the button would punish the person who pressed it.
  const askDept = showAllFields ? null : entryDeptName;
  const asks = (key: string) => asksFor(askDept, key, { showMoney, choices: entryChoices });
  const hiddenCount = hiddenFieldCount(entryDeptName, { showMoney, choices: entryChoices });

  // Which card a vendor belongs to. A vendor filed under a department that did not load
  // falls into NONE rather than vanishing: every vendor is reachable from the list.
  const bucketOf = useMemo(() => {
    const tops = new Set(topCats.map((d) => d.id));
    return (v: Vendor): string => {
      const t = topOf(v.department_id);
      return t && tops.has(t) ? t : NONE;
    };
  }, [topCats, topOf]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vendors) {
      const b = bucketOf(v);
      m.set(b, (m.get(b) || 0) + 1);
    }
    return m;
  }, [vendors, bucketOf]);

  // Vendors in the open view, then narrowed by the search box.
  const inView = useMemo(() => {
    if (open === null || open === ALL) return vendors;
    return vendors.filter((v) => bucketOf(v) === open);
  }, [vendors, open, bucketOf]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return inView;
    return inView.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.products_we_carry || "").toLowerCase().includes(term) ||
        (v.rep_name || "").toLowerCase().includes(term)
    );
  }, [inView, q]);

  const openName =
    open === ALL ? "All vendors" : open === NONE ? "No department yet" : topCats.find((d) => d.id === open)?.name || "Vendors";
  const inDepartment = !!open && open !== ALL && open !== NONE;

  const vendorRow = (v: Vendor) => (
    <Link key={v.id} href={`/vendors/${v.id}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{v.name}</strong>
        {v.department && (
          <button
            className="chip"
            style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480", cursor: "pointer", border: "none" }}
            title={`Show all ${v.department.name} vendors`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openView(bucketOf(v)); }}
          >
            {v.department.name}
          </button>
        )}
        <span className={`chip ${chipClass(v.status)}`}>{labelize(v.status)}</span>
        {v.default_terms && <span className="chip chip-neutral">{v.default_terms}</span>}
        {canEdit(role) && (
          <button
            className="btn-ghost"
            style={{ marginLeft: "auto", padding: "4px 10px" }}
            disabled={busy}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeVendor(v); }}
          >
            Delete
          </button>
        )}
      </div>
      {v.products_we_carry && <div className="help" style={{ marginTop: 6 }}>{v.products_we_carry}</div>}
      {(v.rep_name || v.phone) && (
        <div className="help" style={{ marginTop: 4 }}>
          {v.rep_name}{v.rep_name && v.phone ? " . " : ""}{v.phone}
        </div>
      )}
    </Link>
  );

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-sub">
            {open === null ? `${vendors.length} in the directory, by department` : `${openName} . ${inView.length}`}
          </p>
        </div>
        <div className="page-actions">
          {open !== null && (
            <button className="btn-ghost" onClick={() => openView(null)}>All departments</button>
          )}
          {open !== null && open !== NONE && (
            <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add vendor"}</button>
          )}
        </div>
      </header>

      {loading && <p className="help">Loading vendors.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {/* Step one: pick a department. */}
      {!loading && open === null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
          {topCats.map((d) => (
            <button
              key={d.id}
              className="card"
              style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", display: "grid", gap: 6 }}
              onClick={() => openView(d.id)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: d.accent_color || "#6B7480", flex: "0 0 auto" }} />
                <strong style={{ fontSize: 15 }}>{d.name}</strong>
              </span>
              <span className="help">{counts.get(d.id) || 0} {(counts.get(d.id) || 0) === 1 ? "vendor" : "vendors"}</span>
            </button>
          ))}
          <button
            className="card"
            style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", display: "grid", gap: 6 }}
            onClick={() => openView(ALL)}
          >
            <strong style={{ fontSize: 15 }}>All vendors</strong>
            <span className="help">{vendors.length} in the directory</span>
          </button>
          {(counts.get(NONE) || 0) > 0 && (
            <button
              className="card"
              style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", display: "grid", gap: 6 }}
              onClick={() => openView(NONE)}
            >
              <strong style={{ fontSize: 15 }}>No department yet</strong>
              <span className="help">{counts.get(NONE)} waiting to be filed</span>
            </button>
          )}
        </div>
      )}

      {/* Step two: the vendors in that department. */}
      {!loading && open !== null && (
        <>
          {adding && (
            <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10 }}>
              {inDepartment && <p className="help" style={{ margin: 0 }}>Filed under {openName}.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <div><label className="label">Company or vendor name</label><input className={fieldInputClass(fieldErrors, "name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <FieldError errors={fieldErrors} name="name" />
                </div>
                {!inDepartment && (
                  <div><label className="label">Department</label>
                    <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">Multi-department / Unknown</option>
                      {sortDepartments(departments).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
                {asks("rep_name") && (
                  <div><label className="label">{labelForKey("rep_name", entryDeptName)}</label><input className="input" value={form.rep_name} onChange={(e) => setForm({ ...form, rep_name: e.target.value })} /></div>
                )}
                {asks("phone") && (
                  <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                )}
                {asks("email") && (
                  <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                )}
                {asks("default_terms") && (
                  <div><label className="label">Payment terms</label><input className="input" placeholder="Net 30" value={form.default_terms} onChange={(e) => setForm({ ...form, default_terms: e.target.value })} /></div>
                )}
                {asks("specializes_in") && (
                  <div><label className="label">{labelForKey("specializes_in", entryDeptName)}</label>
                    <select className="input" value={form.specializes_in} onChange={(e) => setForm({ ...form, specializes_in: e.target.value })}>
                      <option value="">Not said</option>
                      {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <p className="help" style={{ margin: "4px 0 0" }}>The trade this contractor does, so you can find them when something breaks.</p>
                  </div>
                )}
                <div><label className="label">Status</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {["active", "skip", "discontinue", "bankrupt"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {!REQUIRE_AUTH && (
                  <div><label className="label">Acting as</label>
                    <select className="input" value={actorId} onChange={(e) => setActor(e.target.value)}>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {asks("products_we_carry") && (
                <div><label className="label">{labelForKey("products_we_carry", entryDeptName)}</label><input className="input" placeholder="Mugs, wallets, everyday gifts (comma-separated)" value={form.products_we_carry} onChange={(e) => setForm({ ...form, products_we_carry: e.target.value })} /></div>
              )}
              {/* Below Products, above Notes: the owner's placement. */}
              <VendorOrderingFields
                value={form as OrderingProfile}
                onChange={(patch) => setForm({ ...form, ...patch })}
                errors={fieldErrors}
                showMoney={showMoney}
                departmentName={askDept}
                choices={entryChoices}
              />
              {asks("notes") && (
                <div><label className="label">Notes and rules (optional)</label><input className="input" placeholder="Rep visits in summer, order by March" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              )}
              {/* The way out when the department map is wrong for one vendor. Nothing typed is
                  ever thrown away by pressing it either way: hiding a question hides the box,
                  not the answer, and the answer still saves and still shows on the vendor. */}
              {hiddenCount > 0 && (
                <div>
                  <button type="button" className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => setShowAllFields((v) => !v)}>
                    {showAllFields ? "Hide the extra questions" : `Add the other questions (${hiddenCount})`}
                  </button>
                  <p className="help" style={{ margin: "4px 0 0" }}>
                    {showAllFields
                      ? "Every question is showing. Leave blank anything this vendor does not need."
                      : `${entryDeptName || "This department"} is not usually asked these. Add them if this vendor needs them.`}
                  </p>
                </div>
              )}
              <div><button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving." : "Save vendor"}</button></div>
            </div>
          )}

          <input
            className="input"
            placeholder={inDepartment ? `Search ${openName} by name, product, or rep` : "Search by name, product, or rep"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginBottom: 16 }}
            aria-label="Search vendors"
          />

          {rows.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p className="help" style={{ margin: 0 }}>
                {q.trim() ? "No vendors match that search." : `No vendors in ${openName} yet.`}
              </p>
            </div>
          )}
          <div style={{ display: "grid", gap: 10 }}>{rows.map(vendorRow)}</div>
        </>
      )}
    </div>
  );
}
