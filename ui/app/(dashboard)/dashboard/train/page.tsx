"use client";

import { useEffect, useRef, useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import type { CloneOwnerInfo } from "@/lib/types";
import { getGmailAuthUrl, triggerGmailSync } from "@/lib/api";
import { IngestionJobBanner } from "@/components/dashboard/IngestionJobBanner";
import { TopicCoverageCard } from "@/components/dashboard/TopicCoverageCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAdvancedMode } from "@/lib/context/AdvancedModeContext";

type FileUploadItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  result?: string;
};

export default function TrainPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (clones.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Get started →
          </a>
        </p>
      </div>
    );
  }

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Feed Data</h1>
        </div>
        <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
      </div>
      <TrainCloneContent key={clone.clone_id} clone={clone} />
    </div>
  );
}

function TrainCloneContent({ clone }: { clone: CloneOwnerInfo }) {
  const { advanced } = useAdvancedMode();
  const [memoryStats, setMemoryStats] = useState<{ memory_used: number; memory_limit: number } | null>(null);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [syncStarted, setSyncStarted] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState<boolean | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [fileQueue, setFileQueue] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clone) return;
    fetch(`/api/brain/stats?clone_id=${clone.clone_id}`)
      .then((r) => r.json())
      .then((d) => setMemoryStats({ memory_used: d.memory_used ?? d.episodic ?? 0, memory_limit: d.memory_limit ?? 500 }))
      .catch(() => {});
    fetch(`/api/ingestion/status?clone_id=${clone.clone_id}`)
      .then((r) => r.json())
      .then((d) => {
        setGmailConnected(d.gmail?.connected ?? false);
        setGmailConfigured(d.gmail?.configured ?? null);
      })
      .catch(() => {});
  }, [clone?.clone_id]);

  async function handleGmailConnect() {
    if (!clone) return;
    setGmailConnecting(true);
    setGmailError(null);
    try {
      const url = await getGmailAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch (e) {
      setGmailConnecting(false);
      setGmailError(e instanceof Error ? e.message : "Failed to connect");
    }
  }

  async function handleGmailSync() {
    if (!clone) return;
    setSyncStarted(true);
    try {
      const { job_id } = await triggerGmailSync(clone.clone_id, clone.display_name);
      setActiveJobId(job_id);
    } catch { setSyncStarted(false); }
  }

  function addFiles(files: FileList | File[]) {
    if (!clone) return;
    const items: FileUploadItem[] = Array.from(files).map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: "pending",
    }));
    setFileQueue((prev) => [...prev, ...items]);
    uploadFiles(items);
  }

  async function uploadFiles(items: FileUploadItem[]) {
    if (!clone) return;
    for (const item of items) {
      setFileQueue((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f)));
      try {
        const fd = new FormData();
        fd.append("clone_id", clone.clone_id);
        fd.append("file", item.file);
        const res = await fetch("/fastapi/ingestion/file", { method: "POST", body: fd });
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { data = { error: res.statusText || `HTTP ${res.status}` }; }
        if (!res.ok) {
          setFileQueue((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "error", result: String(data.detail ?? data.error ?? `Upload failed (${res.status})`) } : f));
        } else {
          setFileQueue((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "done", result: `${data.chunks_stored} chunks` } : f));
        }
      } catch (e) {
        setFileQueue((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "error", result: String(e) } : f));
      }
    }
  }

  return (
    <>
      <DataPrivacyCard />
      {advanced && memoryStats && <MemoryUsageBar used={memoryStats.memory_used} limit={memoryStats.memory_limit} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Gmail ── */}
        <div className="card" style={{ display: "flex", gap: 24, padding: "28px 32px", alignItems: "flex-start" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.20)", color: "#F87171" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <p style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.90)", margin: 0 }}>Gmail</p>
              <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.75)", border: "1px solid rgba(52,211,153,0.18)" }}>
                Recommended
              </span>
              {gmailConnected && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "rgba(52,211,153,0.08)", color: "rgba(52,211,153,0.65)", border: "1px solid rgba(52,211,153,0.15)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.75)", display: "inline-block" }} /> Connected
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 16px", maxWidth: 520 }}>
              Imports your sent mail — only what you've written, not received. This is the richest signal for capturing your tone, vocabulary, and communication patterns.
            </p>
            {activeJobId ? (
              <IngestionJobBanner jobId={activeJobId} onComplete={() => setActiveJobId(null)} />
            ) : syncStarted ? (
              <IngestionJobBanner jobId={null} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {gmailConfigured === false ? (
                  <button disabled className="btn btn--primary" style={{ opacity: 0.3, cursor: "not-allowed" }}>Connect Gmail →</button>
                ) : !gmailConnected ? (
                  <button onClick={handleGmailConnect} disabled={gmailConnecting} className="btn btn--primary" style={{ fontSize: 13, padding: "8px 20px" }}>
                    {gmailConnecting ? "Redirecting…" : "Connect Gmail →"}
                  </button>
                ) : (
                  <button onClick={handleGmailSync} className="btn" style={{ fontSize: 13, padding: "8px 20px" }}>Sync now</button>
                )}
                {gmailError && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.7)", margin: 0 }}>{gmailError}</p>}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 14, padding: "8px 12px", borderRadius: 9, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2, color: "rgba(255,255,255,0.25)" }}>
                <path d="M7 1L2 3.5V7c0 2.8 2.1 5.4 5 6 2.9-.6 5-3.2 5-6V3.5L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.55, margin: 0 }}>Source emails are processed and deleted within 24h. Only extracted knowledge is retained.</p>
            </div>
          </div>
        </div>

        {/* ── Voice ── */}
        <VoiceTrainPanelHero cloneId={clone.clone_id} />

        {/* ── Upload documents ── */}
        <div className="card" style={{ display: "flex", gap: 24, padding: "28px 32px", alignItems: "flex-start" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.20)", color: "#60A5FA" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V6M12 6L8 10M12 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.90)", margin: "0 0 6px" }}>Upload documents</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 16px", maxWidth: 520 }}>
              Drop PDFs, Word docs, CSVs, transcripts, markdown — anything you've written. Files are parsed and the knowledge is extracted automatically.
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: isDragging ? "1.5px dashed rgba(96,165,250,0.45)" : "1.5px dashed rgba(255,255,255,0.12)", borderRadius: 14, padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isDragging ? "rgba(96,165,250,0.05)" : "rgba(255,255,255,0.01)", transition: "border-color 180ms, background 180ms", gap: 6 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>
                <path d="M12 16V6M12 6L8 10M12 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>Drop files here or click to browse</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", margin: 0 }}>PDF · DOCX · TXT · MD · CSV · JSON</p>
            </div>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.html" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }} />
            {fileQueue.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {fileQueue.map((item) => (
                  <div key={item.id} className="act-row">
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "monospace", flexShrink: 0 }}>{item.file.name.split(".").pop()?.toUpperCase()}</span>
                    <span className="act-row__text" style={{ fontSize: 12 }}>{item.file.name}</span>
                    <span className="act-row__meta">
                      {item.status === "uploading" && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Uploading…</span>}
                      {item.status === "done"     && <span style={{ fontSize: 11, color: "rgba(52,211,153,0.60)" }}>{item.result}</span>}
                      {item.status === "error"    && <span style={{ fontSize: 11, color: "rgba(248,113,113,0.60)" }}>{item.result}</span>}
                      {item.status === "pending"  && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Queued</span>}
                      <button onClick={() => setFileQueue((prev) => prev.filter((f) => f.id !== item.id))} style={{ color: "rgba(255,255,255,0.15)", background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  </div>
                ))}
                {fileQueue.some((f) => f.status === "done" || f.status === "error") && (
                  <button onClick={() => setFileQueue((prev) => prev.filter((f) => f.status === "uploading" || f.status === "pending"))} style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>Clear finished</button>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 14, padding: "8px 12px", borderRadius: 9, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2, color: "rgba(255,255,255,0.25)" }}>
                <path d="M7 1L2 3.5V7c0 2.8 2.1 5.4 5 6 2.9-.6 5-3.2 5-6V3.5L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.55, margin: 0 }}>Files are processed and deleted after extraction. Raw content is never stored.</p>
            </div>
          </div>
        </div>

      </div>

      <TopicCoverageCard cloneId={clone.clone_id} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Voice training panel (Web Speech API — no extra API keys)
// ---------------------------------------------------------------------------

type SpeechRecognitionEvent = {
  results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean } };
  resultIndex: number;
};
type SpeechRecognitionErrorEvent = { error: string };

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function chunkTranscript(text: string): string[] {
  // Split on sentence boundaries; group into ~250-word chunks
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    const joined = (current + " " + s).trim();
    if (joined.split(/\s+/).length > 250 && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = joined;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.split(/\s+/).length >= 5);
}

// ---------------------------------------------------------------------------
// Voice training — hero card version (full-width layout)
// ---------------------------------------------------------------------------

function VoiceTrainPanelHero({ cloneId }: { cloneId: string }) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef("");
  const supported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function startRecording() {
    if (!supported) return;
    setError(null); setResult(null); setTranscript(""); setInterim(""); finalRef.current = "";
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const res = e.results[i];
        if (res.isFinal) { finalRef.current += res[0].transcript + " "; setTranscript(finalRef.current); }
        else interimText += res[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => { if (e.error !== "no-speech") setError(`Mic error: ${e.error}`); };
    rec.onend = () => { setRecording(false); setInterim(""); };
    recognitionRef.current = rec; rec.start(); setRecording(true);
  }

  function stopRecording() { recognitionRef.current?.stop(); setRecording(false); }

  async function handleIngest() {
    const text = finalRef.current.trim();
    if (!text) return;
    const chunks = chunkTranscript(text);
    if (chunks.length === 0) { setError("Too short — speak at least a few sentences."); return; }
    setIngesting(true); setError(null);
    try {
      let total = 0;
      for (const chunk of chunks) {
        const res = await fetch("/api/ingestion/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, text: chunk, source: "voice" }) });
        const d = await res.json(); total += d.chunks_stored ?? 0;
      }
      setResult(`${total} chunk${total !== 1 ? "s" : ""} stored`);
      setTranscript(""); finalRef.current = "";
    } catch { setError("Ingestion failed"); }
    finally { setIngesting(false); }
  }

  const wordCount = (transcript + " " + interim).trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="card" style={{ display: "flex", gap: 24, padding: "28px 32px", alignItems: "flex-start" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: recording ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.05)", border: `1px solid ${recording ? "rgba(239,68,68,0.28)" : "rgba(255,255,255,0.10)"}`, color: recording ? "rgba(239,68,68,0.80)" : "rgba(255,255,255,0.55)", transition: "all 300ms" }}>
        {recording ? (
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(239,68,68,0.85)", animation: "voice-pulse 1s ease-in-out infinite" }} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 11a8 8 0 0016 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M12 19v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.90)", margin: "0 0 6px" }}>Voice</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 16px", maxWidth: 520 }}>
          Speak naturally — your clone learns from the way you talk through ideas, not just how you write them. Great for capturing reasoning style and opinions.
        </p>
        {!supported && (
          <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: "0 0 12px" }}>Voice input is not supported in this browser. Use Chrome or Edge.</p>
        )}
        {(transcript || interim || recording) && (
          <div style={{ minHeight: 80, maxHeight: 220, overflowY: "auto", padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, marginBottom: 12 }}>
            {transcript}
            {interim && <span style={{ color: "rgba(255,255,255,0.30)" }}>{interim}</span>}
            {recording && !transcript && !interim && <span style={{ color: "rgba(255,255,255,0.25)" }}>Listening…</span>}
          </div>
        )}
        {wordCount > 0 && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "0 0 12px" }}>{wordCount} words · {chunkTranscript(transcript).length} chunk{chunkTranscript(transcript).length !== 1 ? "s" : ""} estimated</p>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!recording ? (
            <button onClick={startRecording} disabled={!supported} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.75)", cursor: supported ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: !supported ? 0.4 : 1 }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4.5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 7a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M7 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Start recording
            </button>
          ) : (
            <button onClick={stopRecording} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)", color: "rgba(239,68,68,0.80)", cursor: "pointer", fontFamily: "inherit", animation: "voice-pulse 1.5s ease-in-out infinite" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "currentColor" }} /> Stop
            </button>
          )}
          {transcript && !recording && (
            <button onClick={handleIngest} disabled={ingesting} style={{ padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: ingesting ? "rgba(255,255,255,0.04)" : "rgba(26,115,232,0.18)", border: `1px solid ${ingesting ? "rgba(255,255,255,0.08)" : "rgba(26,115,232,0.35)"}`, color: ingesting ? "rgba(255,255,255,0.30)" : "rgba(107,174,255,0.85)", cursor: ingesting ? "default" : "pointer", fontFamily: "inherit" }}>
              {ingesting ? "Ingesting…" : "Train from this"}
            </button>
          )}
          {transcript && !recording && (
            <button onClick={() => { setTranscript(""); setInterim(""); setResult(null); setError(null); finalRef.current = ""; }} style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Clear</button>
          )}
        </div>
        {result && <p style={{ fontSize: 12, color: "rgba(52,211,153,0.70)", margin: "10px 0 0" }}>{result} — transcript ingested</p>}
        {error && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: "10px 0 0" }}>{error}</p>}
      </div>
      <style>{`@keyframes voice-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice training panel (legacy grid-slot version — unused, kept for compilation)
// ---------------------------------------------------------------------------

function VoiceTrainPanel({ cloneId: _cloneId }: { cloneId: string }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef("");

  const supported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function startRecording() {
    if (!supported) return;
    setError(null);
    setResult(null);
    setTranscript("");
    setInterim("");
    finalRef.current = "";

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript + " ";
          setTranscript(finalRef.current);
        } else {
          interimText += res[0].transcript;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "no-speech") setError(`Mic error: ${e.error}`);
    };

    rec.onend = () => {
      setRecording(false);
      setInterim("");
    };

    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  async function handleIngest() {
    const text = finalRef.current.trim();
    if (!text) return;
    const chunks = chunkTranscript(text);
    if (chunks.length === 0) { setError("Too short — speak at least a few sentences."); return; }
    setIngesting(true);
    setError(null);
    try {
      let total = 0;
      for (const chunk of chunks) {
        const res = await fetch("/api/ingestion/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clone_id: cloneId, text: chunk, source: "voice" }),
        });
        const d = await res.json();
        total += d.chunks_stored ?? 0;
      }
      setResult(`${total} chunk${total !== 1 ? "s" : ""} stored`);
      setTranscript("");
      finalRef.current = "";
    } catch {
      setError("Ingestion failed");
    } finally {
      setIngesting(false);
    }
  }

  function handleClear() {
    setTranscript("");
    setInterim("");
    setResult(null);
    setError(null);
    finalRef.current = "";
  }

  const wordCount = (transcript + " " + interim).trim().split(/\s+/).filter(Boolean).length;

  return (
    <>
      {/* Inline card in the grid — clicking opens the panel */}
      <div
        style={{
          gridColumn: "span 1",
          padding: "18px 20px", borderRadius: 16, cursor: "pointer",
          background: open ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
          border: open ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.07)",
          display: "flex", flexDirection: "column", gap: 10,
          transition: "all 200ms",
        }}
        onClick={() => !open && setOpen(true)}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: recording ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${recording ? "rgba(239,68,68,0.30)" : "rgba(255,255,255,0.10)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: recording ? "rgba(239,68,68,0.80)" : "rgba(255,255,255,0.50)",
              transition: "all 300ms",
            }}>
              {recording ? (
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(239,68,68,0.85)", animation: "voice-pulse 1s ease-in-out infinite" }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="4.5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M2 7a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M7 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              )}
            </span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>Voice</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: "2px 0 0" }}>
                {recording ? "Recording…" : "Speak to train"}
              </p>
            </div>
          </div>
          {open && (
            <button onClick={(e) => { e.stopPropagation(); stopRecording(); setOpen(false); }}
              style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>

        {open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} onClick={(e) => e.stopPropagation()}>
            {!supported && (
              <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: 0 }}>
                Voice input not supported in this browser. Try Chrome or Edge.
              </p>
            )}

            {/* Live transcript */}
            {(transcript || interim || recording) && (
              <div style={{
                minHeight: 80, maxHeight: 200, overflowY: "auto",
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6,
              }}>
                {transcript}
                {interim && <span style={{ color: "rgba(255,255,255,0.30)" }}>{interim}</span>}
                {recording && !transcript && !interim && (
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>Listening…</span>
                )}
              </div>
            )}

            {wordCount > 0 && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: 0 }}>
                {wordCount} words · {chunkTranscript(transcript).length} chunk{chunkTranscript(transcript).length !== 1 ? "s" : ""} estimated
              </p>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!recording ? (
                <button
                  onClick={startRecording}
                  disabled={!supported}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 500,
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
                    color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit",
                    opacity: !supported ? 0.4 : 1,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <rect x="4.5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M2 7a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M7 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Start recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 500,
                    background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)",
                    color: "rgba(239,68,68,0.80)", cursor: "pointer", fontFamily: "inherit",
                    animation: "voice-pulse 1.5s ease-in-out infinite",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "currentColor" }} />
                  Stop
                </button>
              )}
              {transcript && !recording && (
                <button
                  onClick={handleIngest}
                  disabled={ingesting}
                  style={{
                    padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 500,
                    background: ingesting ? "rgba(255,255,255,0.04)" : "rgba(26,115,232,0.18)",
                    border: `1px solid ${ingesting ? "rgba(255,255,255,0.08)" : "rgba(26,115,232,0.35)"}`,
                    color: ingesting ? "rgba(255,255,255,0.30)" : "rgba(107,174,255,0.85)",
                    cursor: ingesting ? "default" : "pointer", fontFamily: "inherit",
                  }}
                >
                  {ingesting ? "Ingesting…" : "Train from this"}
                </button>
              )}
              {transcript && !recording && (
                <button onClick={handleClear}
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Clear
                </button>
              )}
            </div>

            {result && (
              <p style={{ fontSize: 12, color: "rgba(52,211,153,0.70)", margin: 0 }}>{result} — transcript ingested</p>
            )}
            {error && (
              <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: 0 }}>{error}</p>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes voice-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

function MemoryUsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isNear = pct >= 80;
  const isAt = pct >= 100;
  const barColor = isAt ? "rgba(248,113,113,0.70)" : isNear ? "rgba(251,191,36,0.70)" : "rgba(52,211,153,0.60)";

  return (
    <div style={{
      padding: "14px 18px", borderRadius: 14,
      background: isAt ? "rgba(248,113,113,0.05)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isAt ? "rgba(248,113,113,0.15)" : isNear ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.07)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)", margin: 0 }}>Memory usage</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            <span style={{ color: "rgba(255,255,255,0.70)", fontWeight: 500 }}>{used.toLocaleString()}</span>
            {" / "}{limit.toLocaleString()} chunks
          </span>
          {isAt && (
            <a href="/dashboard/billing" style={{
              fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8,
              background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)",
              color: "rgba(248,113,113,0.80)", textDecoration: "none",
            }}>
              Upgrade plan
            </a>
          )}
          {isNear && !isAt && (
            <a href="/dashboard/billing" style={{
              fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8,
              background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.20)",
              color: "rgba(251,191,36,0.70)", textDecoration: "none",
            }}>
              Upgrade plan
            </a>
          )}
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: barColor, transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}

function SourceCard({
  icon,
  iconColor,
  title,
  description,
  badge,
  connected,
  stat,
  privacyNote,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  badge?: "recommended" | "soon";
  connected?: boolean;
  stat?: string;
  privacyNote?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
      {/* Icon row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `color-mix(in srgb, ${iconColor} 14%, transparent)`,
          color: iconColor,
        }}>
          {icon}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {badge === "recommended" && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.75)", border: "1px solid rgba(52,211,153,0.18)" }}>
              Recommended
            </span>
          )}
          {badge === "soon" && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.30)", border: "1px solid rgba(255,255,255,0.08)" }}>
              Soon
            </span>
          )}
          {connected === true && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: "rgba(52,211,153,0.08)", color: "rgba(52,211,153,0.65)", border: "1px solid rgba(52,211,153,0.15)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.75)", display: "inline-block" }} />
              Connected
            </span>
          )}
        </div>
      </div>

      {/* Text */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>{title}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.55 }}>{description}</p>
        {stat && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>· {stat}</p>}
      </div>

      {/* Actions */}
      {children && <div>{children}</div>}

      {/* Privacy note */}
      {privacyNote && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: "rgba(255,255,255,0.25)" }}>
            <path d="M7 1L2 3.5V7c0 2.8 2.1 5.4 5 6 2.9-.6 5-3.2 5-6V3.5L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", lineHeight: 1.5, margin: 0 }}>{privacyNote}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Privacy Card
// ---------------------------------------------------------------------------

function DataPrivacyCard() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("doppel:privacyCardDismissed") === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px",
      borderRadius: 14, background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.45)" }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L2 4v5c0 3.2 2.4 6.2 6 7 3.6-.8 6-3.8 6-7V4L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.72)", margin: "0 0 5px" }}>Your data is processed, not stored</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.6, margin: 0 }}>
          Source files and messages are deleted within 24 hours of ingestion. Only the extracted knowledge — beliefs, writing patterns, frameworks — is retained in your clone.
          Emails, names, and identifiers are redacted automatically before anything is stored.
          Your data trains only your clone — never a shared model.{" "}
          <a href="/privacy" style={{ color: "rgba(255,255,255,0.45)", textDecoration: "underline", textUnderlineOffset: 2 }}>Full privacy policy →</a>
        </p>
      </div>
      <button
        onClick={() => { try { localStorage.setItem("doppel:privacyCardDismissed", "1"); } catch {} setDismissed(true); }}
        style={{ color: "rgba(255,255,255,0.22)", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 0 0 4px", flexShrink: 0 }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

