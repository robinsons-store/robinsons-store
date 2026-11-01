"use client";

import { useEffect, useState } from "react";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";
import { sortDepartments } from "@/lib/departments";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, authHeader, useMember } from "@/lib/auth";
import { formatCAD } from "@/lib/format";
import { docUrls } from "@/lib/docs";
import { documentPath } from "@/lib/documentPath";
import type { Department } from "@/lib/types";

// The shape the import API returns. The route auto-detects the bookings ledger, the weekly
// schedule, or a category inventory workbook and tags the result with `kind`; `message`
// summarizes what loaded, and the bookings result also carries a per-sheet breakdown.
type ImportResult = {
  ok: boolean;
  kind?: "bookings" | "bookings_v2" | "schedule" | "inventory";
  message?: string;
  summary?: any;
  inserted?: Record<string, number>;
  skippedVendors?: number;
  skippedShifts?: number;
};

// Current session access token for the Authorization header. Null when not signed in or when
// env is blank (the call fails and we degrade rather than throw).
async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function Import() {
  const { storeId, ready } = useActiveStore();
  const { member } = useMember();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId, setDeptId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Every recognized upload is archived under imports/ in the documents bucket, so the
  // owner's workbook versions live inside the app and stay downloadable.
  const [archive, setArchive] = useState<Array<{ name: string; url: string | null }>>([]);

  // The store's own imports/ folder, plus the shared imports/ folder that older workbooks were
  // archived in; the storage rules show each member only their own store's workbooks.
  async function loadArchive() {
    if (!storeId) return;
    try {
      const folders = [documentPath(storeId, "imports"), "imports"];
      const listed = await Promise.all(folders.map((folder) =>
        supabase.storage.from(DOCUMENTS_BUCKET).list(folder, { limit: 12, sortBy: { column: "name", order: "desc" } })
      ));
      const files = listed
        .flatMap(({ data }, i) => (data || []).map((f) => ({ name: f.name, path: `${folders[i]}/${f.name}` })))
        .filter((f) => f.name && !f.name.startsWith("."))
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 12);
      const urls = await docUrls(files.map((f) => f.path));
      setArchive(files.map((f) => ({ name: f.name, url: urls.get(f.path) || null })));
    } catch {
      setArchive([]);
    }
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const { data } = await dq;
      const ds = (data as Department[]) || [];
      setDepartments(sortDepartments(ds));
      setDeptId(ds.find((d) => d.name === "Hardware")?.id || "");
      await loadArchive();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  async function submit() {
    if (!file || !storeId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("store_id", storeId);
      if (deptId) fd.append("department_id", deptId);
      if (member?.id) fd.append("actor_id", member.id);

      const headers: Record<string, string> = {};
      if (REQUIRE_AUTH) {
        const token = await getToken();
        if (token) headers.authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/import", { method: "POST", body: fd, headers });
      const data = (await res.json().catch(() => ({}))) as ImportResult;
      if (data.ok) {
        setResult(data);
        await loadArchive();
      } else setError(data.message || "The import did not finish.");
    } catch (e: any) {
      setError(e?.message || "The import did not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">Import a spreadsheet</h1>
          <p className="page-sub">
            Upload the 2026 bookings workbook (original or updated layout), the weekly schedule, or a category inventory sheet (SKU,
            description, stock). It detects which one and loads it into the current store. Anything already
            on file is skipped, so it is safe to re-run.
          </p>
        </div>
      </header>

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div>
          <label className="label" htmlFor="bookings-file">Workbook (.xlsx): bookings ledger, weekly schedule, or inventory sheet</label>
          <input
            id="bookings-file"
            className="input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="inv-dept">Department for inventory sheets</label>
          <select id="inv-dept" className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <option value="">Hardware (default)</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <p className="help" style={{ margin: "4px 0 0" }}>Only used when the file is an inventory sheet; the ledger and schedule carry their own departments.</p>
        </div>
        <div>
          <button className="btn-primary" onClick={submit} disabled={busy || !file || !ready || !storeId}>
            {busy ? "Loading." : "Upload and load"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Could not load</span>
          <p className="help" style={{ marginTop: 8, marginBottom: 0 }}>{error}</p>
        </div>
      )}

      {result?.ok && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <span className="chip chip-progress">Done</span>
          {result.message && <p style={{ margin: 0 }}>{result.message}</p>}
          {(result.kind === "bookings" || result.kind === "bookings_v2") && Array.isArray(result.summary?.perSheet) && (
            <div style={{ display: "grid", gap: 8 }}>
              {result.summary.perSheet.map((s: any) => (
                <div
                  key={s.sheet}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                >
                  <strong style={{ fontSize: 14 }}>{s.sheet}</strong>
                  <span className="help tabular">
                    {s.vendors} vendors . orders {formatCAD(s.orderSum)} . invoices {formatCAD(s.invSum)}
                    {s.paySum != null && s.paySum > 0 ? ` . payments ${formatCAD(s.paySum)}` : ""}
                    {s.credits ? ` . ${s.credits} credit${s.credits === 1 ? "" : "s"}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {result.kind === "inventory" && Array.isArray(result.summary?.perSheet) && (
            <div style={{ display: "grid", gap: 8 }}>
              {result.summary.perSheet.map((s: any) => (
                <div
                  key={s.sheet}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                >
                  <strong style={{ fontSize: 14 }}>{s.sheet}</strong>
                  <span className="help tabular">{s.lines} lines{s.skipped ? ` . ${s.skipped} skipped` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        {archive.length > 0 && (
          <div>
            <h2 style={{ fontSize: 16, margin: 0 }}>Previous uploads</h2>
            <p className="help" style={{ margin: "4px 0 8px" }}>
              Every workbook loaded here is kept as a version. Drop a new copy any time; the app applies
              what changed and the older files stay downloadable.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {archive.map((f) => (
                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name.replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})_/, "$1 $2:$3 . ")}
                  </span>
                  {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>Download</a>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>Export everything</h2>
          <p className="help" style={{ margin: "4px 0 0" }}>
            One Excel workbook with a tab per table (vendors, orders, invoices, payments, items, counts,
            people, the audit trail) and a README tab mapping how the tables link. Every id is kept, so the
            relationships hold wherever you take it. Deleted rows are included with their voided date, since
            this is the archival record.
          </p>
        </div>
        <div>
          <button
            className="btn-ghost"
            onClick={async () => {
              setExporting(true);
              setExportError(null);
              try {
                const qs = REQUIRE_AUTH ? "" : `?store_id=${storeId}`;
                const res = await fetch(`/api/export${qs}`, { headers: await authHeader() });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data.error || "export failed");
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `robinsons-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (e: any) {
                setExportError(e?.message || "export failed");
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting || !ready || !storeId}
          >
            {exporting ? "Building the workbook." : "Download the full export (.xlsx)"}
          </button>
          {exportError && <p className="help" style={{ margin: "6px 0 0", color: "var(--error-base)" }}>{exportError}</p>}
        </div>
      </div>
    </div>
  );
}
