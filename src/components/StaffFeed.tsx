"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD, todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import { docUrls } from "@/lib/docs";
import NeedsCost from "@/components/NeedsCost";
import type { FeedRow } from "@/lib/types";

function rowSubtotal(r: FeedRow): number {
  return (r.receiving_line || []).reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
}

function localISO(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HOWTO_KEY = "rgs_seen_howto";

export default function StaffFeed() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const showMoney = canSeeMoney(role);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [voids, setVoids] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(HOWTO_KEY)) setShowHowTo(true);
  }, []);

  async function load() {
    let query = supabase
      .from("receiving_event")
      .select("id, vendor_name, received_date, status, source_file_path, created_at, department:department_id(name, accent_color), app_user:created_by(full_name), receiving_line(qty, unit_cost)")
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else {
      setRows((data as unknown as FeedRow[]) || []);
    }
  }

  // Invoice photos show prices, so only lead, manager and owner open them (the storage rules
  // refuse staff as well); staff see a plain card, and no link is asked for on their behalf.
  useEffect(() => {
    if (!showMoney) {
      setThumbs(new Map());
      return;
    }
    let alive = true;
    docUrls(rows.map((r) => r.source_file_path))
      .then((m) => {
        if (alive) setThumbs(m);
      })
      .catch(() => {
        if (alive) setThumbs(new Map());
      });
    return () => {
      alive = false;
    };
  }, [rows, showMoney]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  function dismissHowTo() {
    setShowHowTo(false);
    if (typeof window !== "undefined") localStorage.setItem(HOWTO_KEY, "1");
  }

  // The feed has no actor dropdown, so attribute the void to the signed-in member in
  // enforced mode, or the Acting-as pick (rgs_actor) in demo mode. Never a silent null
  // when an identity is known: the audit trail must say who deleted.
  async function removeRow(r: FeedRow) {
    if (!window.confirm(`Delete the ${r.vendor_name || "unknown vendor"} receiving? It will be hidden but kept for the record.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("receiving_event", r.id, currentActorId(member));
      setVoids((n) => n + 1);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Today strip: group today's posts by department from the rows already loaded. No extra query.
  const today = todayISO();
  const todayByDept = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; count: number }>();
    for (const r of rows) {
      if (localISO(r.created_at) !== today) continue;
      const name = r.department?.name || "Unassigned";
      const cur = map.get(name) || { name, color: r.department?.accent_color || null, count: 0 };
      cur.count += 1;
      map.set(name, cur);
    }
    return Array.from(map.values());
  }, [rows, today]);

  return (
    <div>
      {showHowTo && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--progress-base)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <strong>How to receive an order</strong>
            <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={dismissHowTo}>Got it</button>
          </div>
          <ol className="help" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Tap + Capture and drop the vendor invoice, or snap it with the webcam.</li>
            <li>Confirm the fields. Anything in amber was uncertain, so check it.</li>
            <li>Save to the feed. It posts with your name and the time.</li>
          </ol>
        </div>
      )}

      <NeedsCost role={role} member={member} refresh={voids} onSaved={load} />

      {todayByDept.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Today</h2>
            <span className="help">What each department did today</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {todayByDept.map((d) => (
              <div key={d.name} className="card" style={{ padding: 12, minWidth: 140, flexShrink: 0 }}>
                <span className="chip" style={{ background: "#EEF1F4", color: d.color || "#6B7480" }}>{d.name}</span>
                <div className="tabular" style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{d.count}</div>
                <div className="help">{d.count === 1 ? "receiving" : "receivings"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <h2 className="page-title" style={{ fontSize: 17 }}>Recent activity</h2>
        <span className="help">Every entry shows who and when</span>
      </div>

      {loading && <p className="help">Loading the feed.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>No activity yet.</p>
          <p className="help" style={{ margin: "0 0 12px" }}>Capture your first vendor invoice to start the feed.</p>
          <Link href="/capture" className="btn-primary" style={{ textDecoration: "none" }}>Capture the first invoice</Link>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => {
          const url = r.source_file_path ? thumbs.get(r.source_file_path) || null : null;
          const subtotal = rowSubtotal(r);
          const noCost = (r.receiving_line || []).some((l) => l.unit_cost == null);
          return (
            <div key={r.id} className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 8, background: "#EEF1F4", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span className="help">file</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15 }}>{r.vendor_name || "Unknown vendor"}</strong>
                  {r.department && (
                    <span className="chip" style={{ background: "#EEF1F4", color: r.department.accent_color || "#6B7480" }}>{r.department.name}</span>
                  )}
                  <span className={`chip ${chipClass(r.status)}`}>{labelize(r.status)}</span>
                  {showMoney && noCost && (
                    <a href="#needs-cost" className="chip chip-warning" style={{ textDecoration: "none" }}>Needs a cost</a>
                  )}
                </div>
                <div className="help" style={{ marginTop: 4 }}>
                  {r.app_user?.full_name || "Unknown"} . {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {showMoney && subtotal > 0 && (
                <div className="tabular" style={{ textAlign: "right", fontWeight: 600, flexShrink: 0 }}>
                  {formatCAD(subtotal)}
                  <div className="help" style={{ fontWeight: 400 }}>{noCost ? "subtotal so far" : "subtotal"}</div>
                </div>
              )}
              {canEdit(role) && (
                <button className="btn-ghost" style={{ padding: "4px 10px", color: "var(--error-base)", flexShrink: 0 }} onClick={() => removeRow(r)} disabled={busy}>Delete</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
