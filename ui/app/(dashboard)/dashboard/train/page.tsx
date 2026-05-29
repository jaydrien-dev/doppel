"use client";

import { useEffect, useRef, useState } from "react";
import { useClone } from "@/lib/hooks/useClone";

type FileUploadItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  result?: string;
};
import { extractStyle, getGithubAuthUrl, getGmailAuthUrl, getNotionAuthUrl, getSlackInstallUrl, getSlackStatus, ingestText, triggerGithubSync, triggerGmailSync, triggerNotionSync } from "@/lib/api";
import { IngestionJobBanner } from "@/components/dashboard/IngestionJobBanner";
import { SeedQAPanel } from "@/components/dashboard/SeedQAPanel";
import { MemoryInspector } from "@/components/dashboard/MemoryInspector";
import { TopicCoverageCard } from "@/components/dashboard/TopicCoverageCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function TrainPage() {
  const { clone, isLoading } = useClone();

  // Memory usage
  const [memoryStats, setMemoryStats] = useState<{ memory_used: number; memory_limit: number } | null>(null);

  useEffect(() => {
    if (!clone) return;
    fetch(`/api/brain/stats?clone_id=${clone.clone_id}`)
      .then((r) => r.json())
      .then((d) => setMemoryStats({ memory_used: d.memory_used ?? d.episodic ?? 0, memory_limit: d.memory_limit ?? 500 }))
      .catch(() => {});
  }, [clone?.clone_id]);

  // Gmail
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [syncStarted, setSyncStarted] = useState(false);

  // GitHub
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubJobId, setGithubJobId] = useState<string | null>(null);

  // Notion
  const [notionConnecting, setNotionConnecting] = useState(false);
  const [notionJobId, setNotionJobId] = useState<string | null>(null);

  // Connector status
  const [connectorStatus, setConnectorStatus] = useState<{
    gmail: { connected: boolean; configured?: boolean };
    github: { connected: boolean; configured?: boolean };
    notion: { connected: boolean; configured?: boolean };
    slack?: { configured?: boolean };
  } | null>(null);

  // Connector errors
  const [connectorError, setConnectorError] = useState<Record<string, string | null>>({});

  // Slack
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackStatus, setSlackStatus] = useState<{ connected: boolean; team_name?: string } | null>(null);

  useEffect(() => {
    if (!clone) return;
    getSlackStatus(clone.clone_id).then(setSlackStatus).catch(() => {});
    fetch(`/api/ingestion/status?clone_id=${clone.clone_id}`)
      .then((r) => r.json())
      .then((d) => {
        setConnectorStatus(d);
        // Propagate Slack configured state
        if (d.slack) setSlackStatus((prev) => prev ? { ...prev, configured: d.slack.configured } : null);
      })
      .catch(() => {});
  }, [clone?.clone_id]);

  // Text upload
  const [uploadText, setUploadText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // File upload
  const [fileQueue, setFileQueue] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Style extraction
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
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

  function setErr(key: string, msg: string | null) {
    setConnectorError((prev) => ({ ...prev, [key]: msg }));
  }

  async function handleGmailConnect() {
    if (!clone) return;
    setGmailConnecting(true);
    setErr("gmail", null);
    try {
      const url = await getGmailAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch (e) {
      setGmailConnecting(false);
      setErr("gmail", e instanceof Error ? e.message : "Failed to connect");
    }
  }

  async function handleGithubConnect() {
    if (!clone) return;
    setGithubConnecting(true);
    setErr("github", null);
    try {
      const url = await getGithubAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch (e) {
      setGithubConnecting(false);
      setErr("github", e instanceof Error ? e.message : "Failed to connect");
    }
  }

  async function handleGithubSync() {
    if (!clone) return;
    try {
      const { job_id } = await triggerGithubSync(clone.clone_id);
      setGithubJobId(job_id);
    } catch {}
  }

  async function handleNotionConnect() {
    if (!clone) return;
    setNotionConnecting(true);
    setErr("notion", null);
    try {
      const url = await getNotionAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch (e) {
      setNotionConnecting(false);
      setErr("notion", e instanceof Error ? e.message : "Failed to connect");
    }
  }

  async function handleNotionSync() {
    if (!clone) return;
    try {
      const { job_id } = await triggerNotionSync(clone.clone_id);
      setNotionJobId(job_id);
    } catch {}
  }

  async function handleGmailSync() {
    if (!clone) return;
    setSyncStarted(true);
    try {
      const { job_id } = await triggerGmailSync(clone.clone_id, clone.display_name);
      setActiveJobId(job_id);
    } catch (e) {
      setSyncStarted(false);
    }
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
      setFileQueue((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f))
      );
      try {
        const fd = new FormData();
        fd.append("clone_id", clone.clone_id);
        fd.append("file", item.file);
        // Use /fastapi/* rewrite (edge layer) to bypass Vercel's 4.5 MB serverless limit
        const res = await fetch("/fastapi/ingestion/file", { method: "POST", body: fd });
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { data = { error: res.statusText || `HTTP ${res.status}` }; }
        if (!res.ok) {
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: "error", result: String(data.detail ?? data.error ?? `Upload failed (${res.status})`) } : f
            )
          );
        } else {
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: "done", result: `${data.chunks_stored} chunks` } : f
            )
          );
        }
      } catch (e) {
        setFileQueue((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: "error", result: String(e) } : f
          )
        );
      }
    }
  }

  async function handleTextUpload() {
    if (!clone || !uploadText.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const { chunks_stored } = await ingestText({
        clone_id: clone.clone_id,
        text: uploadText,
        source: "upload",
      });
      setUploadResult(`${chunks_stored} chunks stored`);
      setUploadText("");
    } catch (e) {
      setUploadResult("Failed to upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleExtractStyle() {
    if (!clone) return;
    setExtracting(true);
    setExtractResult(null);
    try {
      const { samples_used } = await extractStyle(clone.clone_id, clone.display_name);
      setExtractResult(`Style updated from ${samples_used} samples`);
    } catch (e) {
      setExtractResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Train</h1>
        </div>
      </div>

      {/* Memory usage bar */}
      {memoryStats && (
        <MemoryUsageBar used={memoryStats.memory_used} limit={memoryStats.memory_limit} />
      )}

      {/* Connector grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

        {/* Gmail */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5.5l8 5.5 8-5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/></svg>}
          iconColor="#F87171"
          title="Gmail"
          description="Imports your sent mail. Best signal for tone."
          badge="recommended"
          connected={connectorStatus?.gmail.connected}
        >
          {activeJobId ? (
            <IngestionJobBanner jobId={activeJobId} onComplete={() => setActiveJobId(null)} />
          ) : syncStarted ? (
            <IngestionJobBanner jobId={null} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {connectorStatus && connectorStatus.gmail.configured === false ? (
                  <button disabled className="btn btn--primary btn--sm" style={{ opacity: 0.3, cursor: "not-allowed" }}>Connect →</button>
                ) : !connectorStatus?.gmail.connected ? (
                  <button onClick={handleGmailConnect} disabled={gmailConnecting} className="btn btn--primary btn--sm">
                    {gmailConnecting ? "Redirecting…" : "Connect →"}
                  </button>
                ) : (
                  <button onClick={handleGmailSync} className="btn btn--sm">Sync now</button>
                )}
              </div>
              {connectorError["gmail"] && (
                <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", margin: 0 }}>{connectorError["gmail"]}</p>
              )}
            </div>
          )}
        </SourceCard>

        {/* Slack */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 3a2 2 0 100 4H9V3H7zM3 7a2 2 0 104 0V5H3v2zM13 17a2 2 0 100-4h-2v4h2zM17 13a2 2 0 10-4 0v2h4v-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M13 3a2 2 0 100 4h2V3h-2zM17 7a2 2 0 10-4 0v2h4V7zM7 17a2 2 0 100-4H5v4h2zM3 13a2 2 0 104 0v-2H3v2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>}
          iconColor="#A78BFA"
          title="Slack"
          description="Threads where you actually decide things."
          connected={slackStatus?.connected}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {connectorStatus && connectorStatus.slack?.configured === false ? (
              <button disabled className="btn btn--primary btn--sm" style={{ opacity: 0.3, cursor: "not-allowed" }}>Connect →</button>
            ) : slackStatus?.connected ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>{slackStatus.team_name ?? "Connected"}</span>
                <button onClick={async () => { if (!clone) return; setSlackConnecting(true); setErr("slack", null); try { window.location.href = await getSlackInstallUrl(clone.clone_id); } catch (e) { setSlackConnecting(false); setErr("slack", e instanceof Error ? e.message : "Failed"); } }} disabled={slackConnecting} style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reconnect</button>
              </div>
            ) : (
              <button onClick={async () => { if (!clone) return; setSlackConnecting(true); setErr("slack", null); try { window.location.href = await getSlackInstallUrl(clone.clone_id); } catch (e) { setSlackConnecting(false); setErr("slack", e instanceof Error ? e.message : "Failed"); } }} disabled={slackConnecting} className="btn btn--primary btn--sm">
                {slackConnecting ? "Redirecting…" : "Connect →"}
              </button>
            )}
            {connectorError["slack"] && (
              <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", margin: 0 }}>{connectorError["slack"]}</p>
            )}
          </div>
        </SourceCard>

        {/* Notion */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          iconColor="rgba(255,255,255,0.55)"
          title="Notion"
          description="Docs, RFCs, playbooks — your written thinking."
          connected={connectorStatus?.notion.connected}
        >
          {notionJobId ? (
            <IngestionJobBanner jobId={notionJobId} onComplete={() => setNotionJobId(null)} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {connectorStatus && connectorStatus.notion.configured === false ? (
                  <button disabled className="btn btn--primary btn--sm" style={{ opacity: 0.3, cursor: "not-allowed" }}>Connect →</button>
                ) : !connectorStatus?.notion.connected ? (
                  <button onClick={handleNotionConnect} disabled={notionConnecting} className="btn btn--primary btn--sm">
                    {notionConnecting ? "Redirecting…" : "Connect →"}
                  </button>
                ) : (
                  <button onClick={handleNotionSync} className="btn btn--sm">Sync now</button>
                )}
              </div>
              {connectorError["notion"] && (
                <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", margin: 0 }}>{connectorError["notion"]}</p>
              )}
            </div>
          )}
        </SourceCard>

        {/* GitHub */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 14c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5M10 6.5v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          iconColor="rgba(255,255,255,0.55)"
          title="GitHub"
          description="PR threads and reviews. Best for technical voice."
          connected={connectorStatus?.github.connected}
        >
          {githubJobId ? (
            <IngestionJobBanner jobId={githubJobId} onComplete={() => setGithubJobId(null)} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {connectorStatus && connectorStatus.github.configured === false ? (
                  <button disabled className="btn btn--primary btn--sm" style={{ opacity: 0.3, cursor: "not-allowed" }}>Connect →</button>
                ) : !connectorStatus?.github.connected ? (
                  <button onClick={handleGithubConnect} disabled={githubConnecting} className="btn btn--primary btn--sm">
                    {githubConnecting ? "Redirecting…" : "Connect →"}
                  </button>
                ) : (
                  <button onClick={handleGithubSync} className="btn btn--sm">Sync now</button>
                )}
              </div>
              {connectorError["github"] && (
                <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", margin: 0 }}>{connectorError["github"]}</p>
              )}
            </div>
          )}
        </SourceCard>

        {/* Upload files */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 13V5M10 5L7 8M10 5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 14v1.5A1.5 1.5 0 004.5 17h11a1.5 1.5 0 001.5-1.5V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          iconColor="#60A5FA"
          title="Upload files"
          description="Drop PDFs, docs, transcripts."
          stat="Any format"
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: isDragging ? "1.5px dashed rgba(255,255,255,0.30)" : "1.5px dashed rgba(255,255,255,0.10)", borderRadius: 12, padding: "14px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isDragging ? "rgba(255,255,255,0.04)" : "transparent", transition: "border-color 180ms, background 180ms" }}
          >
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Drop or click to browse</p>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.html" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }} />
          {fileQueue.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {fileQueue.map((item) => (
                <div key={item.id} className="act-row">
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "monospace", flexShrink: 0 }}>{item.file.name.split(".").pop()?.toUpperCase()}</span>
                  <span className="act-row__text" style={{ fontSize: 12 }}>{item.file.name}</span>
                  <span className="act-row__meta">
                    {item.status === "uploading" && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Uploading…</span>}
                    {item.status === "done" && <span style={{ fontSize: 11, color: "rgba(52,211,153,0.60)" }}>{item.result}</span>}
                    {item.status === "error" && <span style={{ fontSize: 11, color: "rgba(248,113,113,0.60)" }}>{item.result}</span>}
                    {item.status === "pending" && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Queued</span>}
                    <button onClick={(e) => { e.stopPropagation(); setFileQueue((prev) => prev.filter((f) => f.id !== item.id)); }} style={{ color: "rgba(255,255,255,0.15)", background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                </div>
              ))}
              {fileQueue.some((f) => f.status === "done" || f.status === "error") && (
                <button onClick={() => setFileQueue((prev) => prev.filter((f) => f.status === "uploading" || f.status === "pending"))} style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>Clear finished</button>
              )}
            </div>
          )}
        </SourceCard>

        {/* Paste text */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 7h6M7 10h6M7 13h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 2v1a1 1 0 001 1h2a1 1 0 001-1V2" stroke="currentColor" strokeWidth="1.3"/></svg>}
          iconColor="#FBBF24"
          title="Paste text"
          description="Just paste a doc — fastest way to start."
          stat="Up to 50k words"
        >
          <textarea
            ref={textareaRef}
            value={uploadText}
            onChange={(e) => setUploadText(e.target.value)}
            placeholder="Paste anything you've written…"
            rows={4}
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.75)", outline: "none", resize: "none", lineHeight: 1.6, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <button onClick={handleTextUpload} disabled={uploading || !uploadText.trim()} className="btn btn--primary btn--sm">
              {uploading ? "Uploading…" : "Upload"}
            </button>
            {uploadResult && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{uploadResult}</span>}
          </div>
        </SourceCard>

        {/* Voice */}
        <VoiceTrainPanel cloneId={clone.clone_id} />

        {/* YouTube / Podcast — stub */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8.5 8.5l4 2-4 2V8.5z" fill="currentColor" opacity="0.7"/></svg>}
          iconColor="#F87171"
          title="YouTube & Podcasts"
          description="Ingest your spoken content from video or audio."
          badge="soon"
        >
          <button disabled className="btn btn--sm" style={{ opacity: 0.35, cursor: "not-allowed" }}>Coming soon</button>
        </SourceCard>

        {/* Twitter — stub */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M3 17L17 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>}
          iconColor="rgba(255,255,255,0.45)"
          title="Twitter / X"
          description="Your public opinions and hot takes."
          badge="soon"
        >
          <button disabled className="btn btn--sm" style={{ opacity: 0.35, cursor: "not-allowed" }}>Coming soon</button>
        </SourceCard>

        {/* Style extraction */}
        <SourceCard
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          iconColor="#34D399"
          title="Refresh style"
          description="Recompute writing style from all ingested content."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={handleExtractStyle} disabled={extracting} className="btn btn--primary btn--sm">
              {extracting ? "Extracting…" : "Extract style"}
            </button>
            {extractResult && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{extractResult}</span>}
          </div>
        </SourceCard>

      </div>

      {/* Full-width: Seed Q&A */}
      <SeedQAPanel cloneId={clone.clone_id} />

      {/* Full-width: Topic coverage */}
      <TopicCoverageCard cloneId={clone.clone_id} />

      {/* Full-width: Memory Inspector */}
      <MemoryInspector cloneId={clone.clone_id} />

    </div>
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

function VoiceTrainPanel({ cloneId }: { cloneId: string }) {
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
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  badge?: "recommended" | "soon";
  connected?: boolean;
  stat?: string;
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
    </div>
  );
}
