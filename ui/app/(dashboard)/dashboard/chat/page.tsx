"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useClones } from "@/lib/hooks/useClones";
import type { CloneOwnerInfo } from "@/lib/types";

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
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
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
          owner_mode:    false,
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
          } else if (evt.event === "done") {
            setIsThinking(false);
            const final = (evt.corrected_response as string | null) ?? accText;
            setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: final, isStreaming: false } : m));
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

  return { messages, setMessages, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef };
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, cloneColor, cloneInitial, avatarUrl }: {
  msg: ChatMessage; cloneColor: string; cloneInitial: string; avatarUrl?: string | null;
}) {
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
            <MarkdownRenderer content={msg.content} />
          )}
        </div>
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
  const [moreOpen,        setMoreOpen]        = useState(false);
  const [credits,         setCredits]         = useState<{ plan: number; bought: number } | null>(null);
  const [consent,         setConsent]         = useState<"loading" | null | boolean>("loading");
  const [profile,         setProfile]         = useState<{ exists: boolean; total_sessions?: number } | null>(null);
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

  const { messages, setMessages, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef } = useWebChat({
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

  // Resolve session from localStorage
  useEffect(() => {
    const key = `doppel_web_session:${clone.handle}`;
    const existing = localStorage.getItem(key);
    if (existing) { setSessionId(existing); } else {
      const fresh = uuid(); localStorage.setItem(key, fresh); setSessionId(fresh);
    }
  }, [clone.handle]);

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

  // Credits
  useEffect(() => {
    if (!userId) return;
    fetch("/api/credits/balance")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCredits({ plan: d.plan_credits ?? 0, bought: d.bought_credits ?? 0 }); })
      .catch(() => {});
  }, [userId]);

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
    localStorage.setItem(`doppel_web_session:${clone.handle}`, fresh);
    localStorage.removeItem(`doppel_web_chat:${clone.clone_id}`);
    setSessionId(fresh);
    clearMessages();
    setAgentEvents([]);
    setAgentPanelOpen(false);
  }

  function handleSend() {
    if (!input.trim() || isLoading) return;
    const txt = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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
      </header>

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
            <MessageBubble key={msg.id} msg={msg} cloneColor={cloneColor} cloneInitial={cloneInitial} avatarUrl={clone.avatar_url} />
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
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
              {credits !== null && credits.plan > 0 && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.13)", color: "rgba(96,165,250,0.60)", fontVariantNumeric: "tabular-nums" }}>
                  {credits.plan.toLocaleString()} plan
                </span>
              )}
              {credits !== null && credits.bought > 0 && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(196,181,253,0.07)", border: "1px solid rgba(196,181,253,0.12)", color: "rgba(196,181,253,0.55)", fontVariantNumeric: "tabular-nums" }}>
                  {credits.bought.toLocaleString()} bought
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

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
