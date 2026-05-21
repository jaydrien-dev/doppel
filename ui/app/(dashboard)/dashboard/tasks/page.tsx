"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { BrainStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BRAIN_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TaskStatus = "idle" | "running" | "done" | "error";
type EventType = "status" | "thought" | "action" | "screenshot" | "brain" | "done" | "error";

interface LogEntry {
  id: number;
  type: EventType;
  text: string;
  action?: string;
  brainQuery?: string;
}

interface Monitor { index: number; width: number; height: number; name: string }

const ACTION_LABELS: Record<string, string> = {
  left_click: "Click", right_click: "Right-click", double_click: "Double-click",
  middle_click: "Middle-click", mouse_move: "Move", left_click_drag: "Drag",
  type: "Type", key: "Key", scroll: "Scroll", screenshot: "Screenshot",
  cursor_position: "Cursor",
};

function getWsBase(): string {
  const http = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app";
  return http.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

let _seq = 0;
const nextId = () => ++_seq;

// ---------------------------------------------------------------------------
// Brain Readiness — always visible
// ---------------------------------------------------------------------------
function BrainReadiness({ total, cloneId }: { total: number | undefined; cloneId: string }) {
  const loaded = total !== undefined;
  const pct = loaded ? Math.min(100, Math.round((total! / BRAIN_THRESHOLD) * 100)) : 0;
  const ready = loaded && total! >= BRAIN_THRESHOLD;
  const strong = loaded && total! >= 100;

  const barColor = !loaded ? "bg-white/15" :
                   strong  ? "bg-emerald-400/50" :
                   ready   ? "bg-emerald-400/35" :
                             "bg-amber-400/40";

  const statusLabel = !loaded      ? "Checking…" :
                      strong       ? "Well trained" :
                      ready        ? "Minimum met — still learning" :
                                     `${total} / ${BRAIN_THRESHOLD} required`;

  const statusColor = !loaded  ? "text-white/25" :
                      ready    ? "text-emerald-400/70" :
                                 "text-amber-400/60";

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-white/50">Brain readiness</p>
          <p className="text-[11px] text-white/25 mt-0.5">
            Tasks requires your clone to have enough context to make informed decisions,
            not just follow blind commands.
          </p>
        </div>
        <span className={`text-[11px] ${statusColor} shrink-0 ml-4`}>{statusLabel}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${loaded ? pct : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/20 mt-1.5">
          <span>{loaded ? `${total!.toLocaleString()} memories` : "—"}</span>
          <span>{BRAIN_THRESHOLD} minimum · 100+ recommended</span>
        </div>
      </div>

      {/* State-specific guidance */}
      {!ready && loaded && (
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
          <p className="text-[11px] text-amber-400/55 leading-relaxed">
            Add {BRAIN_THRESHOLD - total!} more memories to unlock Tasks.
            Connect Gmail, upload documents, or add Q&amp;A.
          </p>
          <Link
            href="/dashboard/train"
            className="shrink-0 ml-4 glass hover:glass-md rounded-xl px-3 py-1.5 text-[11px] text-white/45 hover:text-white/70 transition-all"
          >
            Train →
          </Link>
        </div>
      )}

      {ready && !strong && (
        <p className="text-[11px] text-white/30 pt-3 border-t border-white/[0.05] leading-relaxed">
          Your clone can run tasks but is still early. Verify all results carefully.{" "}
          <Link href="/dashboard/train" className="text-white/45 underline underline-offset-2 hover:text-white/65 transition-colors">
            More training →
          </Link>
        </p>
      )}

      {strong && (
        <p className="text-[11px] text-emerald-400/50 pt-3 border-t border-white/[0.05]">
          Your clone has strong context. It will use your knowledge base to make better decisions.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disclaimer — always visible, never dismissible
// ---------------------------------------------------------------------------
function Disclaimer() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass rounded-2xl overflow-hidden border border-red-400/[0.08]">
      {/* Always-visible header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-red-400/50 shrink-0 mt-0.5">
            <path d="M7 1.5L13 12H1L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <div>
            <p className="text-xs font-medium text-white/60">
              Beta · Workplace productivity tool only
            </p>
            <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">
              <strong className="text-white/45">Do not use for confidential, financial, legal, or irreversible work.</strong>{" "}
              Screenshots are sent to Anthropic's API. The agent has real keyboard and mouse control.
              Doppel AI, Inc. is not liable for errors or unintended actions.
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-white/20 hover:text-white/50 transition-colors shrink-0 whitespace-nowrap"
        >
          {expanded ? "Hide details" : "Full details"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/[0.06]">
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-widest mb-2">
                Appropriate uses
              </p>
              <ul className="flex flex-col gap-1.5">
                {[
                  "Drafting and editing documents",
                  "Filling forms and spreadsheets",
                  "Research and web browsing",
                  "Organising files and workflows",
                  "Repetitive data entry tasks",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-[11px] text-white/40">
                    <span className="text-emerald-400/50 shrink-0">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-medium text-red-400/60 uppercase tracking-widest mb-2">
                Never use for
              </p>
              <ul className="flex flex-col gap-1.5">
                {[
                  "Confidential or sensitive data",
                  "Financial transactions or payments",
                  "Signing contracts or legal docs",
                  "Sending messages without reviewing",
                  "Entering passwords or credentials",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-[11px] text-white/40">
                    <span className="text-red-400/50 shrink-0">✗</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="glass rounded-xl p-4 mt-3">
            <p className="text-[10px] font-medium text-amber-400/55 uppercase tracking-widest mb-2">
              Technical risks
            </p>
            <ul className="flex flex-col gap-1 text-[11px] text-white/35 leading-relaxed">
              <li>• Your screen is captured and sent to Anthropic's Claude API for every action.</li>
              <li>• The agent controls your mouse and keyboard — it can misclick, mistype, or navigate incorrectly.</li>
              <li>• It may make incorrect assumptions and take unintended actions. Always watch it while it runs.</li>
              <li>• Doppel AI, Inc. accepts no liability for errors, data loss, or unintended actions.</li>
              <li>• This is a beta feature. Treat every task result as unverified until you check it.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log row
// ---------------------------------------------------------------------------
function LogRow({ entry }: { entry: LogEntry }) {
  if (entry.type === "status") return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-1 h-1 rounded-full bg-white/15 shrink-0" />
      <p className="text-[11px] text-white/20 italic">{entry.text}</p>
    </div>
  );

  if (entry.type === "thought") return (
    <div className="py-1.5 pl-3 border-l border-white/[0.07]">
      <p className="text-xs text-white/50 leading-relaxed">{entry.text}</p>
    </div>
  );

  if (entry.type === "brain") return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/[0.12] rounded px-1.5 py-0.5">
          brain
        </span>
        <p className="text-[11px] text-white/30 italic truncate">{entry.brainQuery}</p>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed pl-1 line-clamp-3">{entry.text}</p>
    </div>
  );

  if (entry.type === "action") return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[10px] text-white/40 bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 shrink-0 font-mono">
        {ACTION_LABELS[entry.action ?? ""] ?? entry.action}
      </span>
      <p className="text-xs text-white/55 leading-snug pt-0.5">{entry.text}</p>
    </div>
  );

  if (entry.type === "done") return (
    <div className="flex items-start gap-2 py-2 border-t border-white/[0.06] mt-2">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0 mt-1" />
      <p className="text-xs text-emerald-400/75 leading-relaxed">{entry.text}</p>
    </div>
  );

  if (entry.type === "error") return (
    <div className="flex items-start gap-2 py-2 border-t border-white/[0.06] mt-2">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0 mt-1" />
      <p className="text-xs text-red-400/65 leading-relaxed">{entry.text}</p>
    </div>
  );

  return null;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
const SUGGESTIONS = [
  "Open a text editor and draft a brief summary of what I work on, based on my knowledge base",
  "Search the web for the latest news in my domain and summarise the top 3 headlines",
  "Take a screenshot and describe exactly what's on my screen right now",
  "Create a new folder on the Desktop called 'Exports' and open it in Explorer",
  "Open a browser, navigate to my most-used site, and tell me what changed since last visit",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function TasksPage() {
  const { clone, isLoading: cloneLoading } = useClone();

  const { data: stats } = useSWR<BrainStats>(
    clone ? `/api/brain/stats?clone_id=${clone.clone_id}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: monitorsData } = useSWR<{ monitors: Monitor[] }>(
    "/api/tasks/monitors",
    fetcher
  );
  const monitors = monitorsData?.monitors ?? [];

  const [instruction, setInstruction] = useState("");
  const [monitorIndex, setMonitorIndex] = useState(1);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const running = taskStatus === "running";
  const totalMemories = stats?.total;
  const brainReady = totalMemories !== undefined && totalMemories >= BRAIN_THRESHOLD;

  const pushLog = useCallback((type: EventType, text: string, extra?: Partial<LogEntry>) => {
    setLog((p) => [...p, { id: nextId(), type, text, ...extra }]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  useEffect(() => {
    if (monitors.length > 0 && !monitors.find((m) => m.index === monitorIndex)) {
      setMonitorIndex(monitors[0].index);
    }
  }, [monitors, monitorIndex]);

  function startTask() {
    const inst = instruction.trim();
    if (!inst || !clone || running || !brainReady) return;

    setLog([]);
    setScreenshot(null);
    setTaskStatus("running");

    const ws = new WebSocket(
      `${getWsBase()}/brain/task/stream?clone_id=${encodeURIComponent(clone.clone_id)}&monitor_index=${monitorIndex}`
    );
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ instruction: inst }));

    ws.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data);
        switch (event.type) {
          case "status":    pushLog("status", event.message); break;
          case "thought":   pushLog("thought", event.text); break;
          case "action":    pushLog("action", event.detail, { action: event.action }); break;
          case "brain":     pushLog("brain", event.result, { brainQuery: event.query }); break;
          case "screenshot": setScreenshot(event.data); break;
          case "done":
            pushLog("done", event.result);
            setTaskStatus("done");
            ws.close();
            break;
          case "error":
            pushLog("error", event.message);
            setTaskStatus("error");
            ws.close();
            break;
        }
      } catch {}
    };

    ws.onerror = () => {
      pushLog("error", "Connection to backend failed. Is the server running?");
      setTaskStatus("error");
    };

    ws.onclose = () => setTaskStatus((prev) => prev === "running" ? "idle" : prev);
  }

  function stopTask() {
    const ws = wsRef.current;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "stop" }));
      }
      ws.close();
    }
    setTaskStatus("idle");
    pushLog("status", "Stopped by user.");
  }

  function reset() {
    setLog([]);
    setScreenshot(null);
    setTaskStatus("idle");
    setInstruction("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  if (cloneLoading) return <LoadingSpinner />;
  if (!clone) return (
    <div className="p-8">
      <p className="text-sm text-white/40">
        Create your clone first.{" "}
        <a href="/onboarding" className="text-white/60 underline underline-offset-2">Get started →</a>
      </p>
    </div>
  );

  return (
    <div className="p-8 max-w-6xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">Tasks</h1>
          <p className="text-sm text-white/35 mt-1">
            Your clone controls the computer and draws on its knowledge to complete complex work tasks.
          </p>
        </div>
        <span className="text-[10px] text-amber-400/60 bg-amber-400/[0.07] border border-amber-400/[0.12] rounded-full px-2.5 py-1">
          Beta
        </span>
      </div>

      {/* ── Always-visible: Brain readiness ─────────────────────────────────── */}
      <BrainReadiness total={totalMemories} cloneId={clone.clone_id} />

      {/* ── Always-visible: Disclaimer ──────────────────────────────────────── */}
      <Disclaimer />

      {/* ── Controls (locked until brain ready) ─────────────────────────────── */}
      <div className={!brainReady ? "opacity-40 pointer-events-none select-none" : ""}>
        <div className="glass rounded-2xl p-5">
          {/* Monitor selector — only shown if multiple displays detected */}
          {monitors.length > 1 && (
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.06]">
              <p className="text-xs text-white/35 shrink-0">Display</p>
              <div className="flex items-center gap-2 flex-wrap">
                {monitors.map((m) => (
                  <button
                    key={m.index}
                    onClick={() => setMonitorIndex(m.index)}
                    disabled={running}
                    className={`text-xs rounded-xl px-3 py-1.5 transition-all ${
                      monitorIndex === m.index
                        ? "glass-md text-white/75"
                        : "glass text-white/30 hover:text-white/55"
                    } disabled:opacity-40`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startTask();
            }}
            placeholder="Describe a work task in plain language. Be specific — mention filenames, apps, or websites if relevant."
            rows={4}
            disabled={running}
            className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/20 outline-none resize-none leading-relaxed disabled:opacity-40"
          />

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-white/15">
              ⌘ Enter to run · uses your knowledge base
            </p>
            <div className="flex items-center gap-2">
              {(taskStatus === "done" || taskStatus === "error") && (
                <button onClick={reset}
                  className="glass hover:glass-md rounded-xl px-4 py-2 text-xs text-white/40 hover:text-white/65 transition-all">
                  New task
                </button>
              )}
              {running ? (
                <button onClick={stopTask}
                  className="flex items-center gap-2 glass hover:glass-md rounded-xl px-4 py-2 text-xs text-red-400/65 hover:text-red-400/85 border border-red-400/[0.12] transition-all">
                  <span className="w-2 h-2 rounded-sm bg-red-400/60" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={startTask}
                  disabled={!instruction.trim() || taskStatus === "done"}
                  className="glass-md hover:glass-hi rounded-xl px-5 py-2 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-30">
                  Run task →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {brainReady && taskStatus === "idle" && log.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-white/20 uppercase tracking-widest px-1">Suggestions</p>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setInstruction(s); textareaRef.current?.focus(); }}
              className="glass hover:glass-md rounded-xl px-4 py-3 text-sm text-white/30 hover:text-white/55 transition-all text-left leading-relaxed">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Log + screenshot */}
      {(log.length > 0 || screenshot) && (
        <div className="grid grid-cols-[1fr_1fr] gap-6 items-start">
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-xs font-medium text-white/45">Agent log</p>
              {running && (
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
                  Running
                </span>
              )}
              {taskStatus === "done"  && <span className="text-[11px] text-emerald-400/60">Complete</span>}
              {taskStatus === "error" && <span className="text-[11px] text-red-400/60">Failed</span>}
            </div>
            <div className="px-5 py-4 max-h-[540px] overflow-y-auto flex flex-col gap-0.5">
              {log.map((e) => <LogRow key={e.id} entry={e} />)}
              <div ref={logEndRef} />
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden sticky top-8">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-xs font-medium text-white/45">Screen</p>
              <span className="text-[11px] text-white/20">
                {monitors.find((m) => m.index === monitorIndex)?.name ?? `Display ${monitorIndex}`}
                {running ? " · Live" : " · Last state"}
              </span>
            </div>
            <div className="p-3">
              {screenshot ? (
                <img
                  src={`data:image/jpeg;base64,${screenshot}`}
                  alt="Current screen"
                  className="w-full rounded-xl border border-white/[0.06]"
                />
              ) : (
                <div className="aspect-video flex items-center justify-center">
                  <p className="text-xs text-white/15">Waiting for first screenshot…</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
