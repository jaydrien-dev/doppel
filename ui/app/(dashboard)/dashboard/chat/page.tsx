"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useClones } from "@/lib/hooks/useClones";
import type { CloneOwnerInfo } from "@/lib/types";
import { SchedulePicker } from "@/components/ui/SchedulePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "clone";
  content: string;
  isStreaming?: boolean;
}

type ResponseMode = "fast" | "pro" | "extended";

type AgentEvent =
  | { type: "status";     message: string }
  | { type: "thought";    text: string }
  | { type: "action";     action: string; detail: string }
  | { type: "brain";      query: string; result: string }
  | { type: "done";       result: string }
  | { type: "error";      message: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const DOPPEL_BLUE      = "#1A73E8";
const DOPPEL_BLUE_SOFT = "rgba(26,115,232,0.08)";

const COLOR_PALETTE = [
  "#1A73E8", "#7B1FA2", "#E91E63", "#F57C00",
  "#2E7D32", "#546E7A", "#00838F", "#8E24AA",
];
function deriveColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}
function uuid(): string { return crypto.randomUUID(); }

const MODES: { value: ResponseMode; label: string; hint: string }[] = [
  { value: "fast",     label: "Fast",     hint: "Quick answer · <1s"   },
  { value: "pro",      label: "Pro",      hint: "Reasoning · ~4s"      },
  { value: "extended", label: "Extended", hint: "Deep thinking · ~15s" },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const INewChat = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const ITrash = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M2 3.5h10M5.5 3.5V2.5h3v1M4 3.5l.7 8h4.6l.7-8M5.5 6v4M8.5 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IShare = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 11V2M8 2L5 5M8 2l3 3M3 9v4a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IMore = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/>
  </svg>
);
const ISend = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/>
  </svg>
);
const IAgent = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="5" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" opacity="0.8"/>
    <path d="M5 5V4a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.6"/>
    <circle cx="5.5" cy="9" r="1" fill="currentColor" opacity="0.7"/>
    <circle cx="10.5" cy="9" r="1" fill="currentColor" opacity="0.7"/>
    <path d="M6.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
  </svg>
);
const IStop = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" rx="2" opacity="0.80"/>
  </svg>
);
const ISparkle = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/>
  </svg>
);

// ─── MarkdownRenderer (lightweight) ───────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  const html = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.9em;font-family:monospace'>$1</code>")
    .replace(/\n/g, "<br/>");
  return <span style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Chat hook ────────────────────────────────────────────────────────────────

function useWebChat({
  clone, sessionId, userId, responseMode, onToolEvent,
}: {
  clone: CloneOwnerInfo;
  sessionId: string;
  userId: string;
  responseMode: ResponseMode;
  onToolEvent?: (e: AgentEvent) => void;
}) {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isThinking,     setIsThinking]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  // Separate map: messageId → WorkflowDraft, so React state merging can't lose drafts
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, WorkflowDraft>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(sessionId);

  useEffect(() => { sessionRef.current = sessionId; setMessages([]); setError(null); }, [sessionId]);

  // Load / persist per-clone localStorage history
  useEffect(() => {
    const stored = localStorage.getItem(`doppel_web_chat:${clone.clone_id}`);
    if (stored) {
      try {
        const parsed: ChatMessage[] = JSON.parse(stored);
        if (parsed.length > 0) setMessages(parsed.filter(m => !m.isStreaming));
      } catch { /* non-fatal */ }
    }
  }, [sessionId, clone.clone_id]);

  useEffect(() => {
    const toStore = messages.filter(m => !m.isStreaming);
    if (toStore.length === 0) return;
    try { localStorage.setItem(`doppel_web_chat:${clone.clone_id}`, JSON.stringify(toStore)); } catch { /* non-fatal */ }
  }, [messages, clone.clone_id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    const userMsg: ChatMessage    = { id: uuid(), role: "user",  content: content.trim() };
    const cloneMsgId               = uuid();
    const placeholder: ChatMessage = { id: cloneMsgId, role: "clone", content: "", isStreaming: true };

    setMessages(prev => [...prev, userMsg, placeholder]);
    setIsLoading(true); setIsThinking(false); setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream: true,
          clone_id:      clone.clone_id,
          session_id:    sessionRef.current,
          message:       content.trim(),
          context_type:  "chat",
          response_mode: responseMode,
          owner_mode:    true,
          metadata:      { memory_enabled: true },
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail ?? errBody.error ?? `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", accText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let evt: Record<string, unknown>;
          try { evt = JSON.parse(raw); } catch { continue; }

          if (evt.event === "thinking") {
            setIsThinking(true);
          } else if (evt.event === "token") {
            setIsThinking(false);
            accText += evt.text as string;
            setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: accText } : m));
          } else if (evt.event === "tool_call") {
            onToolEvent?.({ type: "action", action: evt.tool as string, detail: (evt.detail as string) ?? "" });
          } else if (evt.event === "tool_result") {
            const status = evt.status as string;
            const label = status === "ok" ? `✓ ${evt.tool as string}` : `✗ ${evt.tool as string}`;
            onToolEvent?.({ type: "status", message: label });
          } else if (evt.event === "workflow_draft") {
            const draft = evt.draft as WorkflowDraft | undefined;
            console.log("[doppel] workflow_draft event received", draft);
            if (draft?.name) {
              setWorkflowDrafts(prev => ({ ...prev, [cloneMsgId]: draft }));
            }
          } else if (evt.event === "done") {
            setIsThinking(false);
            console.log("[doppel] done event", evt);
            const final = (evt.corrected_response as string | null) ?? accText;
            setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: final, isStreaming: false } : m));
            // fallback: done event may still carry workflow_draft from older backend
            const wfDraft = evt.workflow_draft as WorkflowDraft | undefined;
            if (wfDraft?.name) {
              console.log("[doppel] workflow_draft from done event fallback", wfDraft);
              setWorkflowDrafts(prev => ({ ...prev, [cloneMsgId]: wfDraft }));
            }
          } else if (evt.event === "error") {
            throw new Error(evt.message as string);
          }
        }
      }
    } catch (err) {
      setIsThinking(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages(prev => prev.filter(m => m.id !== cloneMsgId));
    } finally {
      setIsLoading(false); setIsThinking(false);
    }
  }, [clone.clone_id, userId, responseMode, isLoading]);

  function clearMessages() {
    try { localStorage.removeItem(`doppel_web_chat:${clone.clone_id}`); } catch { /* non-fatal */ }
    setMessages([]); setError(null);
  }

  return { messages, setMessages, workflowDrafts, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef };
}

// ─── WorkflowDraftCard ────────────────────────────────────────────────────────

interface WorkflowDraft {
  name: string;
  description?: string;
  trigger?: { type: string; [key: string]: unknown };
  conditions?: unknown[];
  actions?: unknown[];
}

function WorkflowDraftCard({ draft, cloneId, onActivated }: {
  draft: WorkflowDraft;
  cloneId: string;
  onActivated: (name: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function activate() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/skills/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, workflow_draft: draft }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setErr(e.detail ?? "Failed to deploy."); return; }
      setDone(true);
      onActivated(draft.name);
    } catch { setErr("Network error."); }
    finally { setLoading(false); }
  }

  const triggerLabel = draft.trigger?.type === "schedule" ? "Schedule"
    : draft.trigger?.type === "poll_api" ? "Poll API"
    : draft.trigger?.type === "poll_webpage" ? "Monitor page"
    : draft.trigger?.type === "webhook" ? "Webhook"
    : draft.trigger?.type ?? "Trigger";

  return (
    <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.name}</p>
          {draft.description && <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>{draft.description}</p>}
        </div>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" as const, flexShrink: 0 }}>workflow draft</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.30)", border: "1px solid rgba(255,255,255,0.07)" }}>{triggerLabel}</span>
        {(draft.actions?.length ?? 0) > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{draft.actions!.length} action{draft.actions!.length !== 1 ? "s" : ""}</span>}
      </div>
      {err && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", margin: "0 0 8px" }}>{err}</p>}
      {done
        ? <span style={{ fontSize: 12, color: "rgba(52,211,153,0.75)", display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Workflow activated</span>
        : <button onClick={activate} disabled={loading} style={{ fontSize: 12, fontWeight: 500, padding: "6px 16px", borderRadius: 9, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.80)", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1, fontFamily: "inherit" }}>
          {loading ? "Activating…" : "Activate workflow"}
        </button>}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, cloneColor, cloneInitial, avatarUrl, cloneId, workflowDraft, onWorkflowActivated }: {
  msg: ChatMessage; cloneColor: string; cloneInitial: string; avatarUrl?: string | null;
  cloneId: string;
  workflowDraft?: WorkflowDraft | null;
  onWorkflowActivated?: (name: string) => void;
}) {
  // Strip any legacy inline <!--wf:...--> comments from content
  const displayContent = msg.content.replace(/<!--wf:[\s\S]*?-->/g, "").trim();

  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, maxWidth: "100%", animation: "msg-in 380ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ padding: "12px 15px", borderRadius: "14px 14px 4px 14px", background: DOPPEL_BLUE, color: "#fff", fontSize: 14, lineHeight: 1.55, maxWidth: "78%", wordBreak: "break-word", userSelect: "text", cursor: "text" }}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 12, maxWidth: "100%", animation: "msg-in 420ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, marginTop: 2, overflow: "hidden" }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : cloneInitial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ padding: "12px 15px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", maxWidth: "82%", wordBreak: "break-word", userSelect: "text", cursor: "text" }}>
          {msg.isStreaming && !msg.content ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
            </div>
          ) : (
            <MarkdownRenderer content={displayContent} />
          )}
        </div>
        {workflowDraft && !msg.isStreaming && (
          <div style={{ maxWidth: "82%" }}>
            <WorkflowDraftCard draft={workflowDraft} cloneId={cloneId} onActivated={name => onWorkflowActivated?.(name)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Automate modal ───────────────────────────────────────────────────────────


function AutomateModal({ cloneId, initialInstruction, onClose, onCreated }: {
  cloneId: string;
  initialInstruction: string;
  onClose: () => void;
  onCreated: (name: string, schedule: string) => void;
}) {
  const [name,        setName]        = useState(initialInstruction.slice(0, 40) || "");
  const [instruction, setInstruction] = useState(initialInstruction);
  const [schedule,    setSchedule]    = useState("daily:09:00");
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !instruction.trim()) return;
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, name: name.trim(), instruction: instruction.trim(), schedule }),
      });
      if (!res.ok) { setErr("Failed to create automation."); return; }
      onCreated(name.trim(), schedule);
    } catch { setErr("Network error. Try again."); }
    finally { setLoading(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "rgba(255,255,255,0.8)",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: 28, width: 480, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Schedule automation</h2>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>Your clone will run this instruction on a schedule.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Weekly digest" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Instruction</label>
            <textarea value={instruction} onChange={e => setInstruction(e.target.value)} style={{ ...inp, minHeight: 72, resize: "vertical" as const, lineHeight: 1.6 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 8 }}>Schedule</label>
            <SchedulePicker value={schedule} onChange={setSchedule} />
          </div>
          {err && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", margin: 0 }}>{err}</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={loading || !name.trim() || !instruction.trim()} style={{ fontSize: 13, padding: "7px 18px", borderRadius: 10, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)", cursor: "pointer", fontFamily: "inherit", opacity: (loading || !name.trim() || !instruction.trim()) ? 0.4 : 1 }}>
            {loading ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ActivityPanel ────────────────────────────────────────────────────────────

type ActivityKind = "task" | "automation" | "workflow";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  name: string;
  status: string;
  description?: string;
  created_at: string;
  raw: Record<string, unknown>;
}

const KIND_COLORS: Record<ActivityKind, string> = {
  task:       "rgba(255,255,255,0.28)",
  automation: "rgba(255,255,255,0.28)",
  workflow:   "rgba(255,255,255,0.28)",
};
const KIND_LABELS: Record<ActivityKind, string> = {
  task:       "task",
  automation: "automation",
  workflow:   "workflow",
};
const STATUS_COLOR: Record<string, string> = {
  completed:  "rgba(52,211,153,0.65)",
  done:       "rgba(52,211,153,0.65)",
  active:     "rgba(52,211,153,0.65)",
  running:    "rgba(52,211,153,0.65)",
  pending:    "rgba(255,255,255,0.35)",
  scheduled:  "rgba(255,255,255,0.35)",
  failed:     "rgba(248,113,113,0.65)",
  error:      "rgba(248,113,113,0.65)",
  paused:     "rgba(255,255,255,0.28)",
};

function ActivityPanel({ cloneId }: { cloneId: string }) {
  const [items, setItems]       = useState<ActivityItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [filter, setFilter]     = useState<ActivityKind | "all">("all");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const toArr = (v: unknown, key: string): Record<string, unknown>[] => {
        if (Array.isArray(v)) return v as Record<string, unknown>[];
        if (v && typeof v === "object") {
          const obj = v as Record<string, unknown>;
          if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
          if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
          if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[];
        }
        return [];
      };
      const [tasksR, autoR, wfR] = await Promise.allSettled([
        fetch(`/api/tasks?clone_id=${cloneId}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/automations?clone_id=${cloneId}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/workflows?clone_id=${cloneId}`).then(r => r.ok ? r.json() : []),
      ]);
      const all: ActivityItem[] = [];
      if (tasksR.status === "fulfilled")
        toArr(tasksR.value, "tasks").forEach((t) => all.push({ id: t.id as string, kind: "task", name: (t.title ?? t.name) as string, status: (t.status as string) ?? "pending", description: (t.instruction ?? t.description) as string | undefined, created_at: (t.created_at as string) ?? new Date().toISOString(), raw: t }));
      if (autoR.status === "fulfilled")
        toArr(autoR.value, "automations").forEach((a) => all.push({ id: a.id as string, kind: "automation", name: a.name as string, status: (a.status as string) ?? "active", description: (a.instruction ?? a.schedule) as string | undefined, created_at: (a.created_at as string) ?? new Date().toISOString(), raw: a }));
      if (wfR.status === "fulfilled")
        toArr(wfR.value, "workflows").forEach((w) => all.push({ id: w.id as string, kind: "workflow", name: w.name as string, status: (w.status as string) ?? "active", description: w.description as string | undefined, created_at: (w.created_at as string) ?? new Date().toISOString(), raw: w }));
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(all);
    } catch { setErr("Failed to load activity."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [cloneId]);

  const visible = filter === "all" ? items : items.filter(i => i.kind === filter);

  if (selected) {
    const s = selected;
    const statusColor = STATUS_COLOR[s.status] ?? "rgba(255,255,255,0.30)";
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 40px" }} className="chat-scroll">
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "inherit", padding: "0 0 14px", display: "flex", alignItems: "center", gap: 5 }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back to activity
          </button>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.88)" }}>{s.name}</p>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: KIND_COLORS[s.kind] }}>{KIND_LABELS[s.kind]}</span>
                  <span style={{ fontSize: 11, color: statusColor }}>{s.status}</span>
                </div>
              </div>
            </div>
            {s.description && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.6, margin: "0 0 16px" }}>{s.description}</p>}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.22)", margin: "0 0 10px" }}>Details</p>
              {Object.entries(s.raw).filter(([k]) => !["id","clone_id","created_at","updated_at","name","description","status","instruction"].includes(k)).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", minWidth: 110 }}>{k.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", wordBreak: "break-all" as const }}>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", minWidth: 110 }}>created</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{new Date(s.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px" }} className="chat-scroll">
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" as const }}>
          {(["all", "task", "automation", "workflow"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 99, border: `1px solid ${filter === f ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`, background: filter === f ? "rgba(255,255,255,0.09)" : "transparent", color: filter === f ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.32)", cursor: "pointer", fontFamily: "inherit", transition: "all 160ms" }}>
              {f === "all" ? "All" : KIND_LABELS[f] + "s"}
            </button>
          ))}
          <button onClick={load} style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}>
            Refresh
          </button>
        </div>

        {loading && <div style={{ padding: "40px 0", display: "flex", justifyContent: "center", gap: 5 }}>{[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.22)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}</div>}
        {err && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.60)", textAlign: "center", padding: "32px 0" }}>{err}</p>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ padding: "56px 0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", margin: "0 0 4px" }}>Nothing here yet</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>Ask your clone to do something — tasks, automations, and workflows appear here.</p>
          </div>
        )}
        {!loading && visible.map(item => {
          const statusColor = STATUS_COLOR[item.status] ?? "rgba(255,255,255,0.30)";
          return (
            <div key={item.id} onClick={() => setSelected(item)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 6, cursor: "pointer", transition: "background 160ms, border-color 160ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</p>
                {item.description && <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.32)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</p>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.28)" }}>{KIND_LABELS[item.kind]}</span>
                <span style={{ fontSize: 11, color: statusColor }}>{item.status}</span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(255,255,255,0.20)" }}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CloneChat ────────────────────────────────────────────────────────────────

function CloneChat({ clone, userId }: { clone: CloneOwnerInfo; userId: string }) {
  const [sessionId,       setSessionId]       = useState("");
  const [responseMode,    setResponseMode]    = useState<ResponseMode>("fast");
  const [input,           setInput]           = useState("");
  const [shareCopied,     setShareCopied]     = useState(false);
  const [moreOpen,           setMoreOpen]           = useState(false);
  const [consent,            setConsent]            = useState<"loading" | null | boolean>("loading");
  const [profile,            setProfile]            = useState<{ exists: boolean; total_sessions?: number } | null>(null);
  const [activeView,         setActiveView]         = useState<"chat" | "activity">("chat");
  const [showAutomateModal,  setShowAutomateModal]  = useState(false);
  const [automateInstruction, setAutomateInstruction] = useState("");
  const [knowledgeAreas,  setKnowledgeAreas]  = useState<{ area: string; depth: string }[]>([]);
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  const [autoLoading,     setAutoLoading]     = useState(false);
  const [agentEvents,     setAgentEvents]     = useState<AgentEvent[]>([]);
  const [agentRunning,    setAgentRunning]    = useState(false);
  const [agentPanelOpen,  setAgentPanelOpen]  = useState(false);
  const autoDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreRef            = useRef<HTMLDivElement>(null);
  const textareaRef        = useRef<HTMLTextAreaElement>(null);
  const agentScrollRef     = useRef<HTMLDivElement>(null);

  const { messages, setMessages, workflowDrafts, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef } = useWebChat({
    clone, sessionId, userId, responseMode,
    onToolEvent: (event) => {
      setAgentEvents(prev => [...prev, event]);
      setAgentPanelOpen(true);
      setAgentRunning(true);
    },
  });

  // Mark agent done when SSE loading ends
  useEffect(() => {
    if (!isLoading && agentRunning) {
      setAgentRunning(false);
      setAgentEvents(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type !== "done" && last.type !== "error") {
          return [...prev, { type: "done", result: "" }];
        }
        return prev;
      });
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    agentScrollRef.current?.scrollTo({ top: agentScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [agentEvents]);

  // Resolve session from localStorage — scoped to user so different accounts don't share sessions
  useEffect(() => {
    const key = `doppel_web_session:${userId}:${clone.handle}`;
    const existing = localStorage.getItem(key);
    if (existing) { setSessionId(existing); } else {
      const fresh = uuid(); localStorage.setItem(key, fresh); setSessionId(fresh);
    }
  }, [clone.handle, userId]);

  // Consent
  useEffect(() => {
    if (!userId) { setConsent(null); return; }
    fetch(`/api/clones/${clone.handle}/consent`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setConsent(d?.consent ?? null))
      .catch(() => setConsent(null));
  }, [userId, clone.handle]);

  // Profile
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/clones/${clone.handle}/my-profile`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProfile(d); })
      .catch(() => {});
  }, [userId, clone.handle]);

  // Knowledge map
  useEffect(() => {
    fetch(`/api/clones/${clone.handle}/knowledge-map`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.areas?.length) setKnowledgeAreas(d.areas); })
      .catch(() => {});
  }, [clone.handle]);

  // Autocomplete
  useEffect(() => {
    if (messages.length > 0 && input.trim().length === 0) { setAutoSuggestions([]); return; }
    if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current);
    autoDebounceRef.current = setTimeout(async () => {
      setAutoLoading(true);
      try {
        const res = await fetch(`/api/clones/${clone.handle}/autocomplete?q=${encodeURIComponent(input.trim())}`);
        setAutoSuggestions(res.ok ? (await res.json()).suggestions ?? [] : []);
      } catch { setAutoSuggestions([]); } finally { setAutoLoading(false); }
    }, 300);
    return () => { if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current); };
  }, [input, clone.handle, messages.length]);

  // More dropdown close
  useEffect(() => {
    if (!moreOpen) return;
    function handler(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  async function handleConsent(accepted: boolean) {
    setConsent(accepted);
    fetch(`/api/clones/${clone.handle}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: accepted }),
    }).catch(() => {});
  }

  function handleShare() {
    const url = `https://doppel.ai/c/${clone.handle}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function isActionMessage(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      /\b(post|send|email|dm|tweet|publish)\b/.test(lower) ||
      /\b(search|find|look up|look for|fetch)\b.{0,30}\b(in|on|from|my|the)\b/.test(lower) ||
      /\b(schedule|book|create|add|set up|invite)\b.{0,30}\b(meeting|event|appointment|calendar)\b/.test(lower) ||
      /\b(delete|remove|clear|archive)\b.{0,30}\b(file|folder|email|message|event|document)\b/.test(lower) ||
      /\b(download|upload|save|move|copy)\b.{0,30}\b(file|to|from)\b/.test(lower) ||
      /\b(slack|gmail|google drive|github|notion|google sheets|google docs)\b/.test(lower) ||
      /\b(remind me|set a reminder|alert me)\b/.test(lower)
    );
  }

  function startNewConversation() {
    const fresh = uuid();
    localStorage.setItem(`doppel_web_session:${userId}:${clone.handle}`, fresh);
    localStorage.removeItem(`doppel_web_chat:${clone.clone_id}`);
    setSessionId(fresh);
    clearMessages();
    setAgentEvents([]);
    setAgentPanelOpen(false);
  }

  async function handleCreateTask(instruction: string) {
    const userMsgId = uuid();
    const cloneMsgId = uuid();
    setMessages(prev => [
      ...prev,
      { id: userMsgId,  role: "user",  content: `/task ${instruction}` },
      { id: cloneMsgId, role: "clone", content: "", isStreaming: true },
    ]);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: clone.clone_id, instruction }),
      });
      const data = await res.json();
      const title = data.title || instruction.slice(0, 60);
      const final = `Task started: **${title}**\n\nHandling this in the background. Check the **Activity** tab above to track progress.`;
      setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: final, isStreaming: false } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: "Failed to create the task. Please try again.", isStreaming: false } : m));
    }
  }

  function handleSend() {
    if (!input.trim() || isLoading) return;
    const txt = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    if (txt.toLowerCase().startsWith("/task ")) {
      handleCreateTask(txt.slice(6).trim());
      return;
    }
    if (txt.toLowerCase().startsWith("/automate ")) {
      setAutomateInstruction(txt.slice(10).trim());
      setShowAutomateModal(true);
      return;
    }
    sendMessage(txt);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const cloneColor   = deriveColor(clone.display_name);
  const cloneInitial = clone.display_name[0]?.toUpperCase() ?? "A";
  const cloneName    = clone.listing_title ?? clone.display_name;
  const isEmpty      = messages.length === 0;
  const isReturning  = profile?.exists && (profile.total_sessions ?? 0) > 1;
  const showConsent  = !!userId && consent === null;
  const inputIsAction = isActionMessage(input.trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080808", color: "rgba(255,255,255,0.82)", fontFamily: "inherit", position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes typing-dot {
          0%,80%,100% { transform:scale(0.55);opacity:0.25; }
          40%          { transform:scale(1);   opacity:0.75; }
        }
        @keyframes msg-in {
          from { opacity:0; transform:translateY(14px) scale(0.97); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
        @keyframes menu-in {
          from { opacity:0; transform:scale(0.88) translateY(-8px); }
          to   { opacity:1; transform:scale(1)    translateY(0);    }
        }
        @keyframes banner-in {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes consent-in {
          from { opacity:0; transform:translateY(-8px) scale(0.98); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes panel-in {
          from { opacity:0; transform:translateX(18px) scale(0.97); }
          to   { opacity:1; transform:translateX(0)    scale(1);    }
        }
        .chat-scroll::-webkit-scrollbar        { width:4px; }
        .chat-scroll::-webkit-scrollbar-track  { background:transparent; }
        .chat-scroll::-webkit-scrollbar-thumb  { background:rgba(255,255,255,0.10);border-radius:4px; }
        .chat-textarea::-webkit-scrollbar      { display:none; }
        .agent-scroll::-webkit-scrollbar       { width:3px; }
        .agent-scroll::-webkit-scrollbar-track { background:transparent; }
        .agent-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.10);border-radius:3px; }
        .hdr-act { transition:background 220ms,color 220ms,border-color 220ms,transform 180ms !important; }
        .hdr-act:hover  { background:rgba(255,255,255,0.08) !important; color:rgba(255,255,255,0.90) !important; }
        .hdr-act:active { transform:scale(0.87) !important; }
        .composer-send { transition:background 220ms,opacity 180ms,transform 160ms !important; }
        .composer-send:not(:disabled):hover  { opacity:0.85; }
        .composer-send:not(:disabled):active { transform:scale(0.90) !important; }
      `}</style>

      {/* Header */}
      <header style={{ flexShrink: 0, background: "rgba(8,8,8,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.09)", position: "sticky", top: 0, zIndex: 20 } as React.CSSProperties}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
            {clone.avatar_url
              ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              : cloneInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.93)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cloneName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 1 }}>@{clone.handle}</div>
          </div>
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button className="hdr-act" onClick={startNewConversation} title="New conversation" style={hdrBtnStyle}>
              <INewChat />
            </button>
            {messages.length > 0 && (
              <button className="hdr-act" onClick={startNewConversation} title="Clear history"
                style={{ ...hdrBtnStyle, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", color: "rgba(248,113,113,0.50)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.10)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.28)"; e.currentTarget.style.color = "rgba(248,113,113,0.80)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.05)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.50)"; }}
              >
                <ITrash />
              </button>
            )}
            <button className="hdr-act" onClick={handleShare} title={shareCopied ? "Copied!" : "Copy link"}
              style={{ ...hdrBtnStyle, background: shareCopied ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.04)", border: `1px solid ${shareCopied ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.09)"}`, color: shareCopied ? "rgba(52,211,153,0.75)" : "rgba(255,255,255,0.50)" }}>
              <IShare />
            </button>
            <div ref={moreRef} style={{ position: "relative" }}>
              <button className="hdr-act" onClick={() => setMoreOpen(v => !v)} title="More"
                style={{ ...hdrBtnStyle, background: moreOpen ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)" }}>
                <IMore />
              </button>
              {moreOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, minWidth: 176, backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.65)", transformOrigin: "top right", animation: "menu-in 260ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  {[
                    { label: "Open profile", icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M6 2H2.5A1.5 1.5 0 001 3.5v8A1.5 1.5 0 002.5 13h8A1.5 1.5 0 0012 11.5V8M8 1h5v5M13 1L7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>, action: () => { window.open(`https://doppel.ai/c/${clone.handle}`, "_blank"); setMoreOpen(false); } },
                    { divider: true },
                    { label: "Clear history", icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M5.5 10.5V6M8.5 10.5V6M3 4l.8 8h6.4L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>, action: () => { startNewConversation(); setMoreOpen(false); }, danger: true },
                  ].map((item: any, i) => item.divider
                    ? <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "3px 4px" }} />
                    : <button key={i} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: item.danger ? "rgba(248,113,113,0.70)" : "rgba(255,255,255,0.68)", transition: "background 100ms", textAlign: "left" as const }}
                      onMouseEnter={e => { e.currentTarget.style.background = item.danger ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                      <span style={{ color: item.danger ? "rgba(248,113,113,0.55)" : "rgba(255,255,255,0.35)", flexShrink: 0 }}>{item.icon}</span>
                      {item.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Chat / Activity tab bar */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px 10px", display: "flex", gap: 2 }}>
          {(["chat", "activity"] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              style={{ fontSize: 12, fontWeight: 500, padding: "5px 14px", borderRadius: 8, border: "none", background: activeView === v ? "rgba(255,255,255,0.09)" : "transparent", color: activeView === v ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.30)", cursor: "pointer", fontFamily: "inherit", transition: "all 180ms", textTransform: "capitalize" as const }}>
              {v}
            </button>
          ))}
        </div>
      </header>

      {activeView === "chat" ? (
        <>
      {/* Consent gate */}
      {showConsent && (
        <div style={{ margin: "10px 14px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", flexShrink: 0, animation: "consent-in 360ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 4px", fontWeight: 500 }}>Can {cloneName} remember you?</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.55, margin: "0 0 10px" }}>After a few chats, the clone can remember who you are and give more relevant answers. Your conversations are never shared with other users.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleConsent(true)} style={{ fontSize: 11, fontWeight: 500, padding: "5px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit" }}>Yes, remember me</button>
            <button onClick={() => handleConsent(false)} style={{ fontSize: 11, padding: "5px 14px", background: "none", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, color: "rgba(255,255,255,0.30)", cursor: "pointer", fontFamily: "inherit" }}>Stay anonymous</button>
          </div>
        </div>
      )}

      {/* Returning user banner */}
      {isReturning && !showConsent && (
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "10px 16px", textAlign: "center", flexShrink: 0, width: "100%", boxSizing: "border-box" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: "9999px", background: DOPPEL_BLUE_SOFT, color: "#6BAEFF", fontSize: 11, animation: "banner-in 340ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <ISparkle />
            {cloneName} remembers you from {profile!.total_sessions} previous conversation{profile!.total_sessions !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="chat-scroll" ref={scrollRef} style={{ flex: 1, width: "100%", maxWidth: 860, margin: "0 auto", padding: isEmpty ? "24px 20px 16px" : "24px 20px 140px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", boxSizing: "border-box" }}>
        {isEmpty ? (
          <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 400, color: "rgba(255,255,255,0.55)", flexShrink: 0, overflow: "hidden" }}>
                {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : cloneInitial}
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.3, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.93)", margin: "0 0 2px" }}>Hi, I'm {cloneName}</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", margin: 0 }}>Ask me anything — I'll answer in their voice.</p>
              </div>
            </div>
            {knowledgeAreas.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <span style={{ display: "block", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.30)", marginBottom: 8 }}>Knows well</span>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {knowledgeAreas.map((a, i) => {
                    const opacity = a.depth === "deep" ? 0.75 : a.depth === "solid" ? 0.50 : 0.32;
                    const bg      = a.depth === "deep" ? 0.10 : a.depth === "solid" ? 0.06 : 0.03;
                    const border  = a.depth === "deep" ? 0.18 : a.depth === "solid" ? 0.11 : 0.06;
                    return (
                      <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20, background: `rgba(255,255,255,${bg})`, border: `1px solid rgba(255,255,255,${border})`, color: `rgba(255,255,255,${opacity})` }}>
                        {a.area}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map(msg => msg.isStreaming && !msg.content ? null : (
            <MessageBubble key={msg.id} msg={msg} cloneColor={cloneColor} cloneInitial={cloneInitial} avatarUrl={clone.avatar_url} cloneId={clone.clone_id} workflowDraft={workflowDrafts[msg.id] ?? null} onWorkflowActivated={name => {
              const id = uuid();
              setMessages(prev => [...prev, { id, role: "clone" as const, content: `Workflow **${name}** is now active. It will run automatically — check the **Activity** tab to track it.`, isStreaming: false }]);
            }} />
          ))
        )}

        {/* Typing indicator */}
        {isLoading && messages.every(m => !m.isStreaming || !m.content) && (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, marginTop: 2, overflow: "hidden" }}>
              {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : cloneInitial}
            </div>
            <div style={{ padding: "12px 15px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", display: "flex", alignItems: "center", gap: 5 }}>
              {isThinking
                ? <>{[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginLeft: 4 }}>Thinking…</span></>
                : [0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
            </div>
          </div>
        )}

        {error && <div style={{ textAlign: "center", padding: "8px 0" }}><p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: 0 }}>{error}</p></div>}
      </div>

      {/* Composer */}
      <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(180deg, rgba(8,8,8,0) 0%, rgba(8,8,8,0.88) 30%, #080808 65%)", padding: "28px 20px 16px", flexShrink: 0 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ position: "relative" }}>
            {/* Autocomplete */}
            {(autoLoading || autoSuggestions.length > 0) && (
              <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "rgba(14,14,14,0.97)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, overflow: "hidden", zIndex: 20, boxShadow: "0 -8px 32px rgba(0,0,0,0.50)" }}>
                {autoLoading && autoSuggestions.length === 0
                  ? <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 5 }}>{[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.25)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}</div>
                  : autoSuggestions.map((q, i) => (
                    <button key={i} onClick={() => { sendMessage(q); setAutoSuggestions([]); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: i < autoSuggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const, transition: "background 100ms" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ color: "rgba(255,255,255,0.22)", flexShrink: 0 }}><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z"/></svg>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{q}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Input box */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, transition: "border-color 120ms, box-shadow 120ms" }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(26,115,232,0.22)"; }}
              onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <textarea ref={textareaRef} className="chat-textarea" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={`Ask ${cloneName} anything, or give a task…`} rows={1}
                style={{ flex: 1, border: "none", outline: "none", resize: "none" as const, background: "transparent", color: "rgba(255,255,255,0.93)", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit", minHeight: 22, maxHeight: 180, overflowY: "auto" }}
              />
              <button className="composer-send" onClick={handleSend} disabled={!input.trim() || isLoading}
                style={{ width: 36, height: 36, borderRadius: 12, background: (!input.trim() || isLoading) ? "rgba(255,255,255,0.07)" : inputIsAction ? "rgba(52,211,153,0.18)" : DOPPEL_BLUE, color: (!input.trim() || isLoading) ? "rgba(255,255,255,0.30)" : "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: (!input.trim() || isLoading) ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {isLoading ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.30)", borderTopColor: "rgba(255,255,255,0.80)", animation: "spin 0.8s linear infinite" }} /> : <ISend />}
              </button>
            </div>
          </div>

          {/* Meta bar */}
          <div style={{ margin: "8px auto 0", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
              {MODES.map(m => {
                const active = responseMode === m.value;
                return (
                  <button key={m.value} onClick={() => setResponseMode(m.value)} title={m.hint}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: active ? "rgba(255,255,255,0.09)" : "transparent", color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", transition: "all 240ms", whiteSpace: "nowrap" as const }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
            {agentRunning && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(52,211,153,0.15)", color: "rgba(52,211,153,0.60)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <IAgent />Running tool…
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.18)" }}>
              Just describe what you want — tasks, schedules, and workflows are auto-detected
            </span>
          </div>
        </div>
      </div>
        </>
      ) : (
        <ActivityPanel cloneId={clone.clone_id} />
      )}

      {/* Automate modal */}
      {showAutomateModal && (
        <AutomateModal
          cloneId={clone.clone_id}
          initialInstruction={automateInstruction}
          onClose={() => setShowAutomateModal(false)}
          onCreated={(name, schedule) => {
            setShowAutomateModal(false);
            const id = uuid();
            setMessages(prev => [...prev, {
              id,
              role: "clone" as const,
              content: `Automation created: **${name}** — will run ${schedule.replace(/:/g, " at ").replace("daily", "every day").replace("weekly", "every week").replace("weekdays", "every weekday").replace("hourly", "every hour")}.`,
              isStreaming: false,
            }]);
          }}
        />
      )}

      {/* MCP Agent panel */}
      {agentPanelOpen && agentEvents.length > 0 && (
        <div style={{ position: "absolute", top: 56, right: 12, width: 296, background: "rgba(10,10,10,0.96)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.60)", display: "flex", flexDirection: "column", maxHeight: 460, zIndex: 40, animation: "panel-in 0.22s ease both" } as React.CSSProperties}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px 9px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <IAgent />
            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", flex: 1, letterSpacing: "0.06em" }}>Agent</span>
            {agentRunning
              ? <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(52,211,153,0.70)" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.70)", display: "inline-block", animation: "typing-dot 1.2s ease-in-out infinite" }} />Running</span>
              : agentEvents.some(e => e.type === "done")
                ? <span style={{ fontSize: 10, color: "rgba(52,211,153,0.60)" }}>Done</span>
                : agentEvents.some(e => e.type === "error")
                  ? <span style={{ fontSize: 10, color: "rgba(248,113,113,0.60)" }}>Error</span>
                  : null}
            {!agentRunning && (
              <button onClick={() => setAgentPanelOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.28)", fontSize: 15, padding: "0 2px", lineHeight: 1, fontFamily: "inherit", marginLeft: 4 }}
                onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.60)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}>×</button>
            )}
          </div>
          <div className="agent-scroll" ref={agentScrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {agentEvents.map((evt, i) => {
              if (evt.type === "status") return <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.22)", flexShrink: 0, marginTop: 5 }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.55 }}>{evt.message}</span></div>;
              if (evt.type === "action") return <div key={i} style={{ padding: "7px 10px", borderRadius: 9, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.10)" }}><span style={{ fontSize: 10, fontWeight: 500, color: "rgba(52,211,153,0.70)", display: "block", marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{evt.action}</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontFamily: "monospace", wordBreak: "break-all" as const }}>{evt.detail}</span></div>;
              if (evt.type === "done") return <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><span style={{ fontSize: 12, color: "rgba(52,211,153,0.80)", fontWeight: 500 }}>Done</span></div>;
              if (evt.type === "error") return <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 9, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><circle cx="8" cy="8" r="6.5" stroke="rgba(248,113,113,0.65)" strokeWidth="1.3"/><path d="M8 5v4M8 11v.5" stroke="rgba(248,113,113,0.65)" strokeWidth="1.5" strokeLinecap="round"/></svg><span style={{ fontSize: 11, color: "rgba(248,113,113,0.70)" }}>{evt.message}</span></div>;
              return null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const hdrBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.50)",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  transition: "all 240ms",
};

// ─── Clone list sidebar ────────────────────────────────────────────────────────

const PALETTE_LIST = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function listColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE_LIST[h % PALETTE_LIST.length];
}

function CloneList({ clones, selectedId, onSelect }: { clones: CloneOwnerInfo[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = search ? clones.filter(c => (c.listing_title ?? c.display_name).toLowerCase().includes(search.toLowerCase()) || c.handle.includes(search.toLowerCase())) : clones;

  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden", background: "rgba(255,255,255,0.015)" }}>
      <div style={{ padding: "10px 10px 6px", flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "7px 11px", color: "rgba(255,255,255,0.75)", outline: "none", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const }}
          onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"}
          onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 4px" }}>
        {filtered.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "28px 0" }}>No clones.</p>}
        {filtered.map((c, idx) => {
          const name = c.listing_title ?? c.display_name;
          const col  = listColor(name);
          const sel  = c.clone_id === selectedId;
          return (
            <div key={c.clone_id} onClick={() => onSelect(c.clone_id)}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 9px", borderRadius: 10, marginBottom: 1, cursor: "pointer", background: sel ? "rgba(255,255,255,0.08)" : "transparent", border: `1px solid ${sel ? "rgba(255,255,255,0.10)" : "transparent"}`, transition: "background 220ms" }}
              onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: sel ? 500 : 400, color: sel ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.62)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                {c.category && <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)", textTransform: "capitalize" as const }}>{c.category}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { user } = useUser();
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const userId = user?.id ?? "";
  const clone  = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  // Auto-select first clone
  useEffect(() => {
    if (!selectedId && clones.length > 0) setSelectedId(clones[0].clone_id);
  }, [clones, selectedId]);

  if (isLoading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.30)", fontSize: 13 }}>Loading…</div>;
  }

  if (clones.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.55)", margin: 0 }}>No clones yet</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", margin: 0, textAlign: "center", maxWidth: 240, lineHeight: 1.6 }}>Create your first clone to start chatting.</p>
        <a href="/dashboard/clones" style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", textDecoration: "underline", textUnderlineOffset: 2 }}>Go to Clones →</a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <CloneList clones={clones} selectedId={clone?.clone_id ?? null} onSelect={setSelectedId} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {clone
          ? <CloneChat clone={clone} userId={userId} />
          : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.22)", fontSize: 13 }}>Select a clone to start.</div>}
      </div>
    </div>
  );
}
