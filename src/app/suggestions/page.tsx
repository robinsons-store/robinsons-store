"use client";

// The owner suggestion box. Ravi's feedback used to arrive as WhatsApp screenshots and
// voice notes; this gives those a home INSIDE the app, structured so the developer (and
// the store's AI) can act on them: a note, the screen it is about, an optional screenshot
// (read into text automatically with the store's Anthropic key; the text opens to the same
// people as the screenshot), and an optional voice recording. "Copy developer digest" turns
// everything still open into one markdown block to paste into a chat with the developer.

import { useEffect, useRef, useState } from "react";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { authHeader, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import { docUrls } from "@/lib/docs";
import { documentPath } from "@/lib/documentPath";
import type { Feedback, FeedbackSummary } from "@/lib/types";

const KINDS: { value: Feedback["kind"]; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "problem", label: "Problem" },
  { value: "question", label: "Question" },
  { value: "praise", label: "Working well" }
];

const STATUS_LABEL: Record<Feedback["status"], string> = {
  new: "New",
  planned: "Planned",
  done: "Done",
  declined: "Not doing"
};

export default function Suggestions() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const mayEdit = canEdit(role);

  const [items, setItems] = useState<Feedback[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [summaries, setSummaries] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<Feedback["kind"]>("idea");
  const [page, setPage] = useState("");
  const [body, setBody] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const shotInput = useRef<HTMLInputElement | null>(null);

  // Voice recording via the browser's own recorder; stored as an attachment, listened to
  // by the developer later. No transcription happens in the app.
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function load() {
    let q = supabase
      .from("feedback")
      .select("id, store_id, author_id, kind, page, body, screenshot_path, audio_path, status, created_at, author:author_id(full_name)")
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    if (storeId) q = q.eq("store_id", storeId);
    const { data, error } = await q;
    if (error) {
      setError(error.message);
      return;
    }
    const list = (data as unknown as Feedback[]) || [];
    setItems(list);
    // What the AI read off each screenshot. With login enforced only the descriptions this
    // member may read come back: lead, manager, owner, and the member who attached the
    // screenshot (supabase/auth_setup.sql 3g). Best-effort, like the thumbnails.
    try {
      let sq = supabase.from("feedback_summary").select("feedback_id, summary");
      if (storeId) sq = sq.eq("store_id", storeId);
      const { data: read } = await sq;
      setSummaries(new Map(((read as FeedbackSummary[] | null) || []).map((r) => [r.feedback_id, r.summary])));
    } catch {
      setSummaries(new Map());
    }
    try {
      setUrls(await docUrls(list.flatMap((f) => [f.screenshot_path, f.audio_path])));
    } catch {
      setUrls(new Map());
    }
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("The microphone did not open. Check the browser permission and try again.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function save() {
    if (!body.trim() && !shot && !audioBlob) {
      setError("Write a note, attach a screenshot, or record a voice note first.");
      return;
    }
    const actor = currentActorId(member);
    if (!actor) {
      setError("Pick who you are first: choose your name under Acting as on any main screen.");
      return;
    }
    if (!storeId) {
      setError("The store has not loaded yet. Wait a moment and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      // Attachments open to lead, manager, owner and the member who attached them
      // (supabase/auth_setup.sql 3f), so a staff member's own screenshot can still be read by AI.
      let screenshotPath: string | null = null;
      if (shot) {
        screenshotPath = documentPath(storeId, "feedback", `${Date.now()}_${shot.name.replace(/\s+/g, "_")}`);
        const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(screenshotPath, shot, { upsert: false });
        if (up.error) throw new Error(`storage: ${up.error.message}`);
      }
      let audioPath: string | null = null;
      if (audioBlob) {
        const ext = (audioBlob.type || "").includes("ogg") ? "ogg" : "webm";
        audioPath = documentPath(storeId, "feedback", `${Date.now()}_voice.${ext}`);
        const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(audioPath, audioBlob, { upsert: false, contentType: audioBlob.type || "audio/webm" });
        if (up.error) throw new Error(`storage: ${up.error.message}`);
      }
      const r = await supabase.from("feedback").insert({
        store_id: storeId,
        author_id: actor,
        kind,
        page: page.trim() || null,
        body: body.trim() || null,
        screenshot_path: screenshotPath,
        audio_path: audioPath,
        status: "new"
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await supabase.from("activity_log").insert({ actor_id: actor, action: "feedback_added", entity: "feedback", entity_id: r.data.id });

      setKind("idea");
      setPage("");
      setBody("");
      setShot(null);
      if (shotInput.current) shotInput.current.value = "";
      setAudioBlob(null);
      setOkMsg("Saved. Thank you!");
      await load();

      // Best-effort: have the store's AI read the screenshot into text. The note is already
      // saved; a failure here only leaves the description empty.
      if (screenshotPath) {
        try {
          const headers = { "content-type": "application/json", ...(await authHeader()) };
          const resp = await fetch("/api/feedback-triage", { method: "POST", headers, body: JSON.stringify({ feedbackId: r.data.id }) });
          if (resp.ok) await load();
        } catch {
          /* non-fatal */
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(f: Feedback, status: Feedback["status"]) {
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("feedback").update({ status }).eq("id", f.id);
      if (r.error) throw new Error(r.error.message);
      const actor = currentActorId(member);
      if (actor) await supabase.from("activity_log").insert({ actor_id: actor, action: "feedback_status_changed", entity: "feedback", entity_id: f.id });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: Feedback) {
    if (!window.confirm("Remove this note? It will be hidden but kept in the history.")) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("feedback", f.id, currentActorId(member));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Everything still open, as one markdown block for the developer chat.
  async function copyDigest() {
    const open = items.filter((f) => f.status === "new" || f.status === "planned");
    const lines: string[] = [`# Robinson's General Store: open feedback (${new Date().toISOString().slice(0, 10)})`, ""];
    for (const f of open) {
      lines.push(`## ${KINDS.find((k) => k.value === f.kind)?.label || f.kind} from ${f.author?.full_name || "someone"} on ${f.created_at?.slice(0, 10) || "?"}${f.page ? ` (screen: ${f.page})` : ""} [${STATUS_LABEL[f.status]}]`);
      if (f.body) lines.push(f.body);
      const summary = summaries.get(f.id);
      if (summary) lines.push(`What the attached screenshot shows (AI-read): ${summary}`);
      if (f.screenshot_path && !summary) lines.push(`Screenshot attached: ${f.screenshot_path}`);
      if (f.audio_path) lines.push(`Voice recording attached: ${f.audio_path} (download from the app and share it to be heard)`);
      lines.push("");
    }
    if (open.length === 0) lines.push("Nothing open right now.");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setOkMsg(`Copied ${open.length} open item${open.length === 1 ? "" : "s"} for the developer.`);
    } catch {
      setError("Could not reach the clipboard. Select and copy from the list instead.");
    }
  }

  const groups: { status: Feedback["status"]; items: Feedback[] }[] = (["new", "planned", "done", "declined"] as Feedback["status"][])
    .map((s) => ({ status: s, items: items.filter((f) => f.status === s) }))
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">Suggestions</h1>
          <p className="help" style={{ margin: "6px 0 0" }}>Ideas, problems, screenshots, voice notes. Everything lands with the developer exactly as you wrote it.</p>
        </div>
        <div className="page-actions">
          <button className="btn-ghost" onClick={copyDigest} disabled={loading}>Copy developer digest</button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ padding: 12 }}>
          <span className="chip chip-error">Error</span>
          <span className="help" style={{ marginLeft: 8 }}>{error}</span>
        </div>
      )}
      {okMsg && (
        <div className="card" style={{ padding: 12 }}>
          <span className="chip chip-success">Saved</span>
          <span className="help" style={{ marginLeft: 8 }}>{okMsg}</span>
        </div>
      )}

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {KINDS.map((k) => (
            <button key={k.value} className={kind === k.value ? "btn-primary" : "btn-ghost"} style={{ padding: "6px 12px" }} onClick={() => setKind(k.value)}>
              {k.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <div>
            <label className="label" htmlFor="fb-page">Which screen is this about? (optional)</label>
            <input id="fb-page" className="input" placeholder="Vendors, Payments, Capture." value={page} onChange={(e) => setPage(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fb-shot">Screenshot (optional)</label>
            <input id="fb-shot" ref={shotInput} className="input" type="file" accept="image/*" aria-describedby="fb-shot-help" onChange={(e) => setShot(e.target.files?.[0] || null)} />
            <p id="fb-shot-help" className="help" style={{ margin: "4px 0 0" }}>Screenshots are read by an AI service in the United States. Leave out pay, schedules and staff details.</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="fb-body">The note</label>
          <textarea id="fb-body" className="input" rows={3} placeholder="Say it in any words. Telugu is fine too." value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!recording && <button className="btn-ghost" onClick={startRecording} disabled={busy}>{audioBlob ? "Re-record voice note" : "Record a voice note"}</button>}
          {recording && <button className="btn-primary" onClick={stopRecording}>Stop recording</button>}
          {recording && <span className="chip chip-error">Recording.</span>}
          {audioBlob && !recording && <span className="chip chip-success">Voice note ready</span>}
          {audioBlob && !recording && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => setAudioBlob(null)}>Discard</button>}
        </div>
        <div>
          <button className="btn-primary" onClick={save} disabled={busy || recording}>{busy ? "Saving." : "Send it"}</button>
        </div>
      </div>

      {loading && <p className="help">Loading suggestions.</p>}
      {!loading && items.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing here yet.</p>
          <p className="help" style={{ margin: "6px 0 0" }}>The first idea starts the list.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.status}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>{STATUS_LABEL[g.status]}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {g.items.map((f) => {
              const shotUrl = f.screenshot_path ? urls.get(f.screenshot_path) : undefined;
              const audioUrl = f.audio_path ? urls.get(f.audio_path) : undefined;
              const summary = summaries.get(f.id);
              return (
                <div key={f.id} className="card" style={{ padding: 12, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{KINDS.find((k) => k.value === f.kind)?.label || f.kind}</strong>
                        {f.page && <span className="chip chip-neutral">{f.page}</span>}
                        <span className="help">{f.author?.full_name || ""} . {f.created_at?.slice(0, 10)}</span>
                      </div>
                      {f.body && <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{f.body}</p>}
                      {summary && (
                        <p className="help" style={{ margin: "6px 0 0" }}>
                          <span className="chip chip-neutral" style={{ marginRight: 6 }}>Screenshot, read by AI</span>
                          {summary}
                        </p>
                      )}
                    </div>
                    {mayEdit && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                        <select className="input" style={{ width: "auto", padding: "4px 8px", fontSize: 13 }} value={f.status} onChange={(e) => setStatus(f, e.target.value as Feedback["status"])} disabled={busy} aria-label="status">
                          {(Object.keys(STATUS_LABEL) as Feedback["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => remove(f)} disabled={busy}>Remove</button>
                      </div>
                    )}
                  </div>
                  {(shotUrl || audioUrl) && (
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {shotUrl && (
                        <a href={shotUrl} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={shotUrl} alt="attached screenshot" style={{ maxHeight: 120, maxWidth: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
                        </a>
                      )}
                      {audioUrl && <audio controls src={audioUrl} style={{ height: 36 }} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
