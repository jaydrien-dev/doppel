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
    gmail: { connected: boolean };
    github: { connected: boolean };
    notion: { connected: boolean };
  } | null>(null);

  // Slack
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackStatus, setSlackStatus] = useState<{ connected: boolean; team_name?: string } | null>(null);

  useEffect(() => {
    if (!clone) return;
    getSlackStatus(clone.clone_id).then(setSlackStatus).catch(() => {});
    fetch(`/api/ingestion/status?clone_id=${clone.clone_id}`)
      .then((r) => r.json())
      .then(setConnectorStatus)
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
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first from the{" "}
          <a href="/dashboard" className="text-white/60 hover:text-white/80 underline underline-offset-2">
            overview
          </a>
          .
        </p>
      </div>
    );
  }

  async function handleGmailConnect() {
    if (!clone) return;
    setGmailConnecting(true);
    try {
      const url = await getGmailAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch {
      setGmailConnecting(false);
    }
  }

  async function handleGithubConnect() {
    if (!clone) return;
    setGithubConnecting(true);
    try {
      const url = await getGithubAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch {
      setGithubConnecting(false);
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
    try {
      const url = await getNotionAuthUrl(clone.clone_id);
      window.location.href = url;
    } catch {
      setNotionConnecting(false);
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
    // Upload each sequentially
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
        const res = await fetch("/api/ingestion/file", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: "error", result: data.detail ?? data.error ?? `${res.status}` } : f
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
    <div className="p-8 max-w-2xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Train</h1>
        <p className="text-sm text-white/35 mt-1">Feed your clone data to make it think like you.</p>
      </div>

      {/* Gmail */}
      <Section title="Gmail" sub="Import your sent emails to learn your writing style and knowledge." connected={connectorStatus?.gmail.connected}>
        {activeJobId ? (
          <IngestionJobBanner jobId={activeJobId} onComplete={() => setActiveJobId(null)} />
        ) : syncStarted ? (
          <IngestionJobBanner jobId={null} />
        ) : (
          <div className="flex gap-3 flex-wrap">
            {!connectorStatus?.gmail.connected && (
              <button
                onClick={handleGmailConnect}
                disabled={gmailConnecting}
                className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
              >
                {gmailConnecting ? "Redirecting…" : "Connect Gmail →"}
              </button>
            )}
            <button
              onClick={handleGmailSync}
              className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all"
            >
              {connectorStatus?.gmail.connected ? "Sync now" : "Re-sync (already connected)"}
            </button>
          </div>
        )}
      </Section>

      {/* Slack */}
      <Section title="Slack" sub="Connect your workspace so your clone can respond to @mentions in any channel.">
        {slackStatus?.connected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 glass rounded-xl px-4 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
              <span className="text-sm text-white/60">{slackStatus.team_name ?? "Connected"}</span>
            </div>
            <button
              onClick={async () => {
                if (!clone) return;
                setSlackConnecting(true);
                try {
                  const url = await getSlackInstallUrl(clone.clone_id);
                  window.location.href = url;
                } catch { setSlackConnecting(false); }
              }}
              disabled={slackConnecting}
              className="text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Reconnect
            </button>
          </div>
        ) : (
          <button
            onClick={async () => {
              if (!clone) return;
              setSlackConnecting(true);
              try {
                const url = await getSlackInstallUrl(clone.clone_id);
                window.location.href = url;
              } catch { setSlackConnecting(false); }
            }}
            disabled={slackConnecting}
            className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
          >
            {slackConnecting ? "Redirecting…" : "Connect Slack →"}
          </button>
        )}
      </Section>

      {/* Notion */}
      <Section title="Notion" sub="Import your Notion pages and databases — docs, notes, meeting notes." connected={connectorStatus?.notion.connected}>
        {notionJobId ? (
          <IngestionJobBanner jobId={notionJobId} onComplete={() => setNotionJobId(null)} />
        ) : (
          <div className="flex gap-3 flex-wrap">
            {!connectorStatus?.notion.connected && (
              <button
                onClick={handleNotionConnect}
                disabled={notionConnecting}
                className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
              >
                {notionConnecting ? "Redirecting…" : "Connect Notion →"}
              </button>
            )}
            <button
              onClick={handleNotionSync}
              className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all"
            >
              {connectorStatus?.notion.connected ? "Sync now" : "Re-sync (already connected)"}
            </button>
          </div>
        )}
      </Section>

      {/* Text upload */}
      <Section title="Upload text" sub="Paste documents, notes, blog posts, or any text you've written.">
        <textarea
          ref={textareaRef}
          value={uploadText}
          onChange={(e) => setUploadText(e.target.value)}
          placeholder="Paste your text here…"
          rows={6}
          className="w-full glass rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/25 outline-none resize-none leading-relaxed"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleTextUpload}
            disabled={uploading || !uploadText.trim()}
            className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {uploadResult && <span className="text-xs text-white/35">{uploadResult}</span>}
        </div>
      </Section>

      {/* File Upload */}
      <Section title="Upload files" sub="PDF, Word, Excel, PowerPoint, CSV, Markdown — any document you've written or worked on.">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 cursor-pointer transition-all ${
            isDragging ? "border-white/30 bg-white/[0.06]" : "border-white/[0.10] hover:border-white/20 hover:bg-white/[0.03]"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-white/25">
            <path d="M11 14V4M11 4L7 8M11 4L15 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 16v1a2 2 0 002 2h12a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <p className="text-sm text-white/40">Drop files here or click to browse</p>
          <p className="text-xs text-white/20">PDF · DOCX · XLSX · PPTX · CSV · TXT · MD</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.html"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }}
        />
        {fileQueue.length > 0 && (
          <div className="mt-3 space-y-2">
            {fileQueue.map((item) => (
              <div key={item.id} className="flex items-center justify-between glass rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-white/20 font-mono shrink-0">
                    {item.file.name.split(".").pop()?.toUpperCase()}
                  </span>
                  <p className="text-sm text-white/60 truncate">{item.file.name}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {item.status === "uploading" && (
                    <span className="text-xs text-white/35 animate-pulse">Uploading…</span>
                  )}
                  {item.status === "done" && (
                    <span className="text-xs text-emerald-400/60">{item.result}</span>
                  )}
                  {item.status === "error" && (
                    <span className="text-xs text-red-400/60 font-mono">{item.result}</span>
                  )}
                  {item.status === "pending" && (
                    <span className="text-xs text-white/25">Queued</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setFileQueue((prev) => prev.filter((f) => f.id !== item.id)); }}
                    className="text-white/15 hover:text-white/40 transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {fileQueue.some((f) => f.status === "done" || f.status === "error") && (
              <button
                onClick={() => setFileQueue((prev) => prev.filter((f) => f.status === "uploading" || f.status === "pending"))}
                className="text-xs text-white/25 hover:text-white/45 transition-colors"
              >
                Clear finished
              </button>
            )}
          </div>
        )}
      </Section>

      {/* YouTube / Podcast — stub */}
      <Section title="YouTube & Podcasts" sub="Paste a YouTube URL or podcast RSS feed to ingest your spoken content." integration="YouTube Data API — see INTEGRATIONS.md">
        <IntegrationStub label="Coming soon — add YOUTUBE_API_KEY" />
      </Section>

      {/* GitHub */}
      <Section title="GitHub" sub="Import commit messages, PR descriptions, and code review comments." connected={connectorStatus?.github.connected}>
        {githubJobId ? (
          <IngestionJobBanner jobId={githubJobId} onComplete={() => setGithubJobId(null)} />
        ) : (
          <div className="flex gap-3 flex-wrap">
            {!connectorStatus?.github.connected && (
              <button
                onClick={handleGithubConnect}
                disabled={githubConnecting}
                className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
              >
                {githubConnecting ? "Redirecting…" : "Connect GitHub →"}
              </button>
            )}
            <button
              onClick={handleGithubSync}
              className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all"
            >
              {connectorStatus?.github.connected ? "Sync now" : "Re-sync (already connected)"}
            </button>
          </div>
        )}
      </Section>

      {/* Twitter — stub */}
      <Section title="Twitter / X" sub="Import your tweets to capture your public opinions and hot takes." integration="Twitter Developer — see INTEGRATIONS.md">
        <IntegrationStub label="Connect Twitter →" />
      </Section>

      {/* Seed Q&A */}
      <SeedQAPanel cloneId={clone.clone_id} />

      {/* Topic coverage */}
      <TopicCoverageCard cloneId={clone.clone_id} />

      {/* Memory Inspector */}
      <MemoryInspector cloneId={clone.clone_id} />

      {/* Enterprise sources */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white/60 mb-1">Enterprise sources</h3>
          <p className="text-xs text-white/35 leading-relaxed">
            Connect your organisation&apos;s knowledge bases. Available on the Team plan.
          </p>
        </div>
        <div className="space-y-3">
          {[
            {
              title: "Google Drive",
              sub: "Index Docs, Sheets, and Slides from your Drive.",
              icon: "G",
            },
            {
              title: "Confluence",
              sub: "Import team documentation and knowledge base articles.",
              icon: "C",
            },
            {
              title: "JIRA / Linear",
              sub: "Ingest ticket descriptions, comments, and resolution notes.",
              icon: "J",
            },
          ].map(({ title, sub, icon }) => (
            <div key={title} className="flex items-center justify-between glass rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-xs text-white/40 font-medium shrink-0">
                  {icon}
                </div>
                <div>
                  <p className="text-xs text-white/60 font-medium">{title}</p>
                  <p className="text-[11px] text-white/30">{sub}</p>
                </div>
              </div>
              <span className="text-[10px] text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/12 rounded-full px-2 py-0.5 shrink-0 ml-3">
                enterprise
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-white/25">
          Upgrade to Team to unlock enterprise connectors →{" "}
          <a href="/dashboard/billing" className="text-white/40 underline underline-offset-2 hover:text-white/60">
            View plans
          </a>
        </p>
      </div>

      {/* Style extraction */}
      <Section title="Refresh style profile" sub="Recompute your writing style from all ingested content. Run after bulk uploads.">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExtractStyle}
            disabled={extracting}
            className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
          >
            {extracting ? "Extracting…" : "Extract style"}
          </button>
          {extractResult && <span className="text-xs text-white/35">{extractResult}</span>}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  sub,
  integration,
  connected,
  children,
}: {
  title: string;
  sub: string;
  integration?: string;
  connected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-medium text-white/60">{title}</h3>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          {connected === true && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400/70 bg-emerald-400/10 rounded-full px-2 py-0.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400/70" />
              Connected
            </span>
          )}
          {integration && !connected && (
            <span className="text-[10px] text-amber-300/50 bg-amber-400/[0.07] border border-amber-400/12 rounded-full px-2 py-0.5">
              integration needed
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-white/35 mb-4 leading-relaxed">{sub}</p>
      {children}
    </div>
  );
}

function IntegrationStub({ label }: { label: string }) {
  return (
    <button
      disabled
      className="glass rounded-xl px-5 py-2.5 text-sm text-white/30 cursor-not-allowed opacity-50"
    >
      {label}
    </button>
  );
}

