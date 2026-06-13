import React, { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

declare global {
  interface Window {
    electronAPI?: {
      isElectron:          boolean;
      openPill:            (clone: { id: string; handle: string; name: string; avatar_url?: string }) => void;
      minimize:            () => void;
      close:               () => void;
      toggleFullscreen:    () => void;
      getSettings:         () => Promise<any>;
      saveSettings:        (data: Record<string, any>) => void;
      openExternal:        (url: string) => void;
      getScreenSourceId:   () => Promise<string | null>;
      onOverlayChanged:    (cb: (val: boolean) => void) => () => void;
      onFullscreenChanged: (cb: (val: boolean) => void) => () => void;
      getAgentSidecarUrl:  () => Promise<string | null>;
      onAgentReady:        (cb: (url: string) => void) => () => void;
    };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Clone { id: string; handle: string; name: string; category?: string; avatar_url?: string; }

interface ChatMessage {
  id: string;
  role: "user" | "clone";
  content: string;
  isStreaming?: boolean;
}

type ResponseMode = "fast" | "pro" | "extended";

type AgentEvent =
  | { type: "status"; message: string }
  | { type: "thought"; text: string }
  | { type: "action"; action: string; detail: string }
  | { type: "screenshot"; data: string }
  | { type: "brain"; query: string; result: string }
  | { type: "done"; result: string }
  | { type: "error"; message: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const DOPPEL_BLUE = "#1A73E8";
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

function uuid(): string {
  return crypto.randomUUID();
}

const MODES: { value: ResponseMode; label: string; hint: string }[] = [
  { value: "fast",     label: "Fast",     hint: "Quick answer · <1s" },
  { value: "pro",      label: "Pro",      hint: "Reasoning · ~4s" },
  { value: "extended", label: "Extended", hint: "Deep thinking · ~15s" },
];

const SUGGESTED_DEFAULT = [
  "What are you working on right now?",
  "How do you make decisions under pressure?",
  "What's your biggest priority this quarter?",
];

// ─── Icons ───────────────────────────────────────────────────────────────────

const IBack = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
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
const IMsg = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M2 4a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0112 4v4a1.5 1.5 0 01-1.5 1.5H6L3 12V9.5H2.5A.5.5 0 012 9V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const ISparkle = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/>
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

// ─── Chat hook ────────────────────────────────────────────────────────────────

interface UseChatOptions {
  clone: Clone;
  sessionId: string;
  apiUrl: string;
  userId: string;
  responseMode: ResponseMode;
  memoryEnabled: boolean;
}

function useDesktopChat({ clone, sessionId, apiUrl, userId, responseMode, memoryEnabled }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(sessionId);

  // Update session ref when prop changes
  useEffect(() => {
    sessionRef.current = sessionId;
    setMessages([]);
    setError(null);
  }, [sessionId]);

  // Load history on mount / session change
  useEffect(() => {
    if (!sessionId) return;
    const stored = localStorage.getItem(`doppel_chat_desktop:${clone.id}`);
    if (stored) {
      try {
        const parsed: ChatMessage[] = JSON.parse(stored);
        if (parsed.length > 0) setMessages(parsed.filter(m => !m.isStreaming));
      } catch { /* non-fatal */ }
    }
  }, [sessionId, clone.id]);

  // Persist messages
  useEffect(() => {
    const toStore = messages.filter(m => !m.isStreaming);
    if (toStore.length === 0) return;
    try {
      localStorage.setItem(`doppel_chat_desktop:${clone.id}`, JSON.stringify(toStore));
    } catch { /* non-fatal */ }
  }, [messages, clone.id]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: uuid(), role: "user", content: content.trim() };
    const cloneMsgId = uuid();
    const placeholder: ChatMessage = { id: cloneMsgId, role: "clone", content: "", isStreaming: true };

    setMessages(prev => [...prev, userMsg, placeholder]);
    setIsLoading(true);
    setIsThinking(false);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) headers["X-User-Id"] = userId;

      const res = await fetch(`${apiUrl}/brain/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          clone_id: clone.id,
          session_id: sessionRef.current,
          message: content.trim(),
          context_type: "chat",
          response_mode: responseMode,
          owner_mode: false,
          metadata: { memory_enabled: memoryEnabled },
        }),
      });

      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
          const errBody = await res.clone().json();
          detail = errBody.detail ?? errBody.error ?? detail;
        } catch { /* non-fatal */ }
        throw new Error(detail);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accText = "";

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
      setIsLoading(false);
      setIsThinking(false);
    }
  }, [clone.id, apiUrl, userId, responseMode, isLoading]);

  function clearMessages() {
    try { localStorage.removeItem(`doppel_chat_desktop:${clone.id}`); } catch { /* non-fatal */ }
    setMessages([]);
    setError(null);
  }

  return { messages, setMessages, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef };
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, cloneColor, cloneInitial, cloneAvatarUrl }: {
  msg: ChatMessage;
  cloneColor: string;
  cloneInitial: string;
  cloneAvatarUrl?: string;
}) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, maxWidth: "100%", animation: "msg-in 380ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ padding: "12px 15px", borderRadius: "14px 14px 4px 14px", background: DOPPEL_BLUE, color: "#fff", fontSize: 14, lineHeight: 1.55, maxWidth: "78%", wordBreak: "break-word", userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Clone message
  return (
    <div style={{ display: "flex", gap: 12, maxWidth: "100%", animation: "msg-in 420ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, marginTop: 2, overflow: "hidden" }}>
        {cloneAvatarUrl
          ? <img src={cloneAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : cloneInitial}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ padding: "12px 15px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", maxWidth: "82%", wordBreak: "break-word", userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}>
          {msg.isStreaming && !msg.content ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          ) : (
            <MarkdownRenderer content={msg.content} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatPage ─────────────────────────────────────────────────────────────

export function ChatPage({ clone, onBack, hideBack }: { clone: Clone; onBack: () => void; hideBack?: boolean }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [responseMode, setResponseMode] = useState<ResponseMode>("fast");
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<{ exists: boolean; total_sessions?: number; summary?: string } | null>(null);
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [userId, setUserId] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [credits, setCredits] = useState<{ plan: number; bought: number } | null>(null);
  const [cloneInfo, setCloneInfo] = useState<{ credit_cost?: number; is_paid?: boolean } | null>(null);
  // Consent: "loading" | null (not asked) | true | false
  const [consent, setConsent] = useState<"loading" | null | boolean>("loading");
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const autoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [knowledgeAreas, setKnowledgeAreas] = useState<{ area: string; depth: string }[]>([]);
  const [agentSidecarUrl, setAgentSidecarUrl] = useState<string | null>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState<string>("");
  // Agent mode
  const [agentMode, setAgentMode] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentTaskInstruction, setAgentTaskInstruction] = useState("");
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const agentPanelScrollRef = useRef<HTMLDivElement>(null);

  // Capture screenshot via Electron's desktopCapturer (same as Pill)
  async function captureScreen(): Promise<string | null> {
    try {
      const sourceId = await window.electronAPI?.getScreenSourceId?.();
      if (!sourceId) return null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } } as any,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
      video.play();
      await new Promise<void>(res => requestAnimationFrame(() => res()));
      const MAX_W = 1280;
      const scale = Math.min(1, MAX_W / (video.videoWidth || 1920));
      const w = Math.round((video.videoWidth  || 1920) * scale);
      const h = Math.round((video.videoHeight || 1080) * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
      stream.getTracks().forEach(t => t.stop());
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      return dataUrl;
    } catch {
      return null;
    }
  }
  const moreRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef } = useDesktopChat({
    clone,
    sessionId,
    apiUrl,
    userId,
    responseMode,
    memoryEnabled: consent === true,
  });

  // Auto-scroll agent panel as events arrive
  useEffect(() => {
    const el = agentPanelScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agentEvents]);

  // Load settings + sidecar URL
  useEffect(() => {
    window.electronAPI?.getSettings().then((s: any) => {
      if (s?.fastapiUrl) setApiUrl(s.fastapiUrl); else setApiUrl("http://localhost:8000");
      if (s?.userId) setUserId(s.userId);
      if (s?.anthropicApiKey) setAnthropicApiKey(s.anthropicApiKey);
    });
    window.electronAPI?.getAgentSidecarUrl?.().then(url => { if (url) setAgentSidecarUrl(url); });
    const unsub = window.electronAPI?.onAgentReady?.((url) => setAgentSidecarUrl(url));
    return () => unsub?.();
  }, []);

  // Resolve session
  useEffect(() => {
    const key = `doppel_session:${clone.handle}`;
    async function resolveSession() {
      const s = await window.electronAPI?.getSettings().catch(() => null);
      const uid = s?.userId;
      const url = s?.fastapiUrl ?? "http://localhost:8000";
      if (uid?.trim()) {
        try {
          const res = await fetch(`${url}/consumer/session?clone_handle=${encodeURIComponent(clone.handle)}`, {
            headers: { "X-User-Id": uid },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.session_id) { localStorage.setItem(key, data.session_id); setSessionId(data.session_id); return; }
          }
        } catch { /* non-fatal */ }
      }
      const existing = localStorage.getItem(key);
      if (existing) { setSessionId(existing); } else {
        const fresh = uuid(); localStorage.setItem(key, fresh); setSessionId(fresh);
      }
    }
    resolveSession();
  }, [clone.handle]);

  // Consent status
  useEffect(() => {
    if (!userId?.trim() || !apiUrl) { setConsent(null); return; }
    fetch(`${apiUrl}/clones/${clone.handle}/consent`, { headers: { "X-User-Id": userId } })
      .then(r => { if (r.ok) return r.json(); return null; })
      .then(d => setConsent(d?.consent ?? null))
      .catch(() => setConsent(null));
  }, [userId, apiUrl, clone.handle]);

  // Consumer profile
  useEffect(() => {
    if (!userId?.trim() || !apiUrl) return;
    fetch(`${apiUrl}/clones/${clone.handle}/my-profile`, { headers: { "X-User-Id": userId } })
      .then(r => { if (r.ok) return r.json(); return null; })
      .then(d => { if (d) setProfile(d); })
      .catch(() => {});
  }, [userId, apiUrl, clone.handle]);

  // Credits balance
  useEffect(() => {
    if (!userId?.trim() || !apiUrl) return;
    fetch(`${apiUrl}/credits/balance`, { headers: { "X-User-Id": userId } })
      .then(r => { if (r.ok) return r.json(); return null; })
      .then(d => { if (d) setCredits({ plan: d.plan_credits ?? 0, bought: d.bought_credits ?? 0 }); })
      .catch(() => {});
  }, [userId, apiUrl]);

  // Clone info (credit cost)
  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/marketplace/${clone.handle}`)
      .then(r => { if (r.ok) return r.json(); return null; })
      .then(d => { if (d) setCloneInfo({ credit_cost: d.credit_cost, is_paid: d.is_paid }); })
      .catch(() => {});
  }, [apiUrl, clone.handle]);

  // Knowledge map (public, no auth needed)
  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/clones/${clone.handle}/knowledge-map`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.areas?.length) setKnowledgeAreas(d.areas); })
      .catch(() => {});
  }, [apiUrl, clone.handle]);

  // Live autocomplete — debounced 300ms, calls backend on every input change
  useEffect(() => {
    if (!apiUrl) return;
    // Show opener suggestions on empty state; mid-conversation only when typing
    if (messages.length > 0 && input.trim().length === 0) {
      setAutoSuggestions([]);
      return;
    }
    if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current);
    autoDebounceRef.current = setTimeout(async () => {
      setAutoLoading(true);
      try {
        const res = await fetch(`${apiUrl}/clones/${clone.handle}/autocomplete?q=${encodeURIComponent(input.trim())}`);
        const data = res.ok ? await res.json() : null;
        setAutoSuggestions(data?.suggestions ?? []);
      } catch {
        setAutoSuggestions([]);
      } finally {
        setAutoLoading(false);
      }
    }, 300);
    return () => { if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current); };
  }, [input, apiUrl, clone.handle, messages.length]);

  // Close more dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handler(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  async function handleConsent(accepted: boolean) {
    setConsent(accepted);
    if (!userId?.trim() || !apiUrl) return;
    fetch(`${apiUrl}/clones/${clone.handle}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": userId },
      body: JSON.stringify({ consent: accepted }),
    }).catch(() => {});
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  function startNewConversation() {
    const fresh = uuid();
    localStorage.setItem(`doppel_session:${clone.handle}`, fresh);
    try { localStorage.removeItem(`doppel_chat_desktop:${clone.id}`); } catch { /* non-fatal */ }
    setSessionId(fresh);
    clearMessages();
  }

  function handleSend() {
    if (!input.trim() || isLoading) return;
    if (agentMode) {
      void handleAgentSend();
      return;
    }
    sendMessage(input.trim());
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  async function handleAgentSend() {
    const instruction = input.trim();
    if (!instruction || agentRunning) return;

    // Close any existing WS
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    // Add user instruction to normal chat history so it's part of the record
    const userTaskMsg: ChatMessage = { id: uuid(), role: "user", content: instruction };
    setMessages(prev => [...prev, userTaskMsg]);
    setAgentTaskInstruction(instruction);
    setAgentEvents([{ type: "status", message: "Starting…" }]);
    setAgentPanelOpen(true);
    setAgentRunning(true);

    // Capture screen in parallel (for initial context)
    const screenshotDataUrl = await captureScreen();
    const screenshotB64 = screenshotDataUrl ? screenshotDataUrl.split(",")[1] : null;

    // Use local sidecar if ready; fall back to cloud WS (requires self-hosted backend)
    const wsUrl = agentSidecarUrl
      ? `${agentSidecarUrl}/task/stream?clone_name=${encodeURIComponent(clone.name)}&monitor_index=1`
      : `${apiUrl.replace(/^http/, "ws")}/brain/task/stream?clone_id=${encodeURIComponent(clone.id)}&monitor_index=1`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const history = messages
          .filter(m => !m.isStreaming && m.content)
          .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
        const payload: Record<string, unknown> = { instruction, conversation_history: history };
        if (agentSidecarUrl) {
          if (!anthropicApiKey) {
            ws.close();
            setAgentEvents(prev => [...prev, {
              type: "error" as const,
              message: "Anthropic API key not set. Open Settings → API Keys → Anthropic API Key.",
            }]);
            setAgentRunning(false);
            return;
          }
          payload.api_key = anthropicApiKey;
        }
        if (screenshotB64) payload.screenshot_base64 = screenshotB64 as string;
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as AgentEvent;
          setAgentEvents(prev => [...prev, data]);
          if (data.type === "done") {
            setAgentRunning(false);
            wsRef.current = null;
            // Inject the result into normal chat so the conversation continues naturally
            const summary = (data.result || "Task complete.").trim();
            const resultMsg: ChatMessage = { id: uuid(), role: "clone", content: summary };
            setMessages(prev => [...prev, resultMsg]);
          } else if (data.type === "error") {
            setAgentRunning(false);
            wsRef.current = null;
          }
        } catch { /* non-fatal */ }
      };

      ws.onerror = () => {
        setAgentEvents(prev => [...prev, { type: "error", message: "Connection failed. Make sure the backend is running." }]);
        setAgentRunning(false);
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (agentRunning) setAgentRunning(false);
        wsRef.current = null;
      };
    } catch (err) {
      setAgentEvents(prev => [...prev, { type: "error", message: String(err) }]);
      setAgentRunning(false);
    }
  }

  function stopAgent() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setAgentRunning(false);
    setAgentEvents(prev => [...prev, { type: "status", message: "Task stopped." }]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleSuggest(q: string) { sendMessage(q); }

  function handleShare() {
    const url = `https://doppel.ai/c/${clone.handle}`;
    try {
      navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch { /* non-fatal */ }
  }

  const cloneColor = deriveColor(clone.name);
  const cloneInitial = clone.name[0]?.toUpperCase() ?? "A";
  const isEmpty = messages.length === 0;
  const isSignedIn = !!userId?.trim();
  const isReturning = profile?.exists && (profile.total_sessions ?? 0) > 1;
  const showConsentPrompt = isSignedIn && consent === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080808", color: "rgba(255,255,255,0.82)", fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes typing-dot {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.25; }
          40%            { transform: scale(1);    opacity: 0.75; }
        }
        @keyframes msg-in {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes menu-in {
          from { opacity: 0; transform: scale(0.88) translateY(-8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        @keyframes banner-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes consent-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes panel-in {
          from { opacity: 0; transform: translateX(18px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
        .agent-panel-scroll::-webkit-scrollbar { width: 3px; }
        .agent-panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .agent-panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 3px; }

        /* iOS spring easing */
        :root { --spring: cubic-bezier(0.34, 1.56, 0.64, 1); --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94); }

        .chat-textarea::-webkit-scrollbar { display: none; }
        .chat-scroll-area::-webkit-scrollbar { width: 4px; }
        .chat-scroll-area::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
        .chat-scroll-area::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }

        .hdr-act {
          transition: background 220ms var(--ease-out), color 220ms var(--ease-out),
                      border-color 220ms var(--ease-out), transform 180ms var(--spring) !important;
        }
        .hdr-act:hover  { background: rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.90) !important; }
        .hdr-act:active { transform: scale(0.87) !important; }

        .hdr-back {
          transition: background 220ms var(--ease-out), color 220ms var(--ease-out), transform 180ms var(--spring) !important;
        }
        .hdr-back:hover  { background: rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.90) !important; }
        .hdr-back:active { transform: scale(0.88) !important; }

        .suggest-chip {
          transition: background 220ms var(--ease-out), border-color 220ms var(--ease-out), transform 180ms var(--spring) !important;
        }
        .suggest-chip:hover  { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.18) !important; }
        .suggest-chip:active { transform: scale(0.96) !important; }

        .composer-send { transition: background 220ms var(--ease-out), opacity 180ms var(--ease-out), transform 160ms var(--spring) !important; }
        .composer-send:not(:disabled):hover  { opacity: 0.85; }
        .composer-send:not(:disabled):active { transform: scale(0.90) !important; }
      `}</style>

      {/* Chat header */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(8,8,8,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.09)", flexShrink: 0 } as React.CSSProperties}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
          {!hideBack && (
            <button className="hdr-back" onClick={onBack} aria-label="Back" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.09)", cursor: "pointer", flexShrink: 0, transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)" }}>
              <IBack />
            </button>
          )}
          <div style={{ width: 36, height: 36, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
            {clone.avatar_url
              ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              : cloneInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.93)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clone.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", marginTop: 2 }}>@{clone.handle}</div>
          </div>
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button className="hdr-act" onClick={startNewConversation} aria-label="New conversation" title="New conversation" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)" }}>
              <INewChat />
            </button>
            {/* Clear history — only visible when there are messages */}
            {messages.length > 0 && (
              <button
                className="hdr-act"
                onClick={startNewConversation}
                aria-label="Clear chat history"
                title="Clear chat history"
                style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", color: "rgba(248,113,113,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.10)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.28)"; e.currentTarget.style.color = "rgba(248,113,113,0.80)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.05)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.50)"; }}
              >
                <ITrash />
              </button>
            )}
            <button
              className="hdr-act"
              onClick={handleShare}
              aria-label="Copy chat link"
              title={shareCopied ? "Copied!" : "Copy link"}
              style={{ width: 32, height: 32, borderRadius: 8, background: shareCopied ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.04)", border: `1px solid ${shareCopied ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.09)"}`, color: shareCopied ? "rgba(52,211,153,0.75)" : "rgba(255,255,255,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)" }}>
              <IShare />
            </button>
            <div ref={moreRef} style={{ position: "relative" }}>
              <button
                className="hdr-act"
                onClick={() => setMoreOpen(v => !v)}
                aria-label="More options"
                style={{ width: 32, height: 32, borderRadius: 8, background: moreOpen ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)" }}>
                <IMore />
              </button>
              {moreOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, minWidth: 176, backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.65)", transformOrigin: "top right", animation: "menu-in 260ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  {[
                    {
                      label: "Open in browser",
                      icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M6 2H2.5A1.5 1.5 0 001 3.5v8A1.5 1.5 0 002.5 13h8A1.5 1.5 0 0012 11.5V8M8 1h5v5M13 1L7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                      action: () => { window.electronAPI?.openExternal(`https://doppel.ai/c/${clone.handle}`); setMoreOpen(false); },
                    },
                    {
                      label: "Launch overlay pill",
                      icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="2" y="5" width="10" height="4" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
                      action: () => {
                        if (clone.id && clone.handle) {
                          window.electronAPI?.openPill({ id: clone.id, handle: clone.handle, name: clone.name, avatar_url: clone.avatar_url });
                        }
                        setMoreOpen(false);
                      },
                    },
                    { divider: true },
                    {
                      label: "Clear history",
                      icon: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M5.5 10.5V6M8.5 10.5V6M3 4l.8 8h6.4L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                      action: () => { startNewConversation(); setMoreOpen(false); },
                      danger: true,
                    },
                  ].map((item: any, i) => item.divider
                    ? <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "3px 4px" }} />
                    : (
                      <button key={i} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: item.danger ? "rgba(248,113,113,0.70)" : "rgba(255,255,255,0.68)", transition: "background 100ms", textAlign: "left" as const }}
                        onMouseEnter={e => { e.currentTarget.style.background = item.danger ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.06)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ color: item.danger ? "rgba(248,113,113,0.55)" : "rgba(255,255,255,0.35)", flexShrink: 0 }}>{item.icon}</span>
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Consent gate */}
      {showConsentPrompt && (
        <div style={{ margin: "10px 14px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", flexShrink: 0, animation: "consent-in 360ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 4px", fontWeight: 500 }}>
            Can {clone.name} remember you?
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.55, margin: "0 0 10px" }}>
            After a few chats, the clone can remember who you are and give you more relevant answers. Your conversations are never shared with other users.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleConsent(true)} style={{ fontSize: 11, fontWeight: 500, padding: "5px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit" }}>
              Yes, remember me
            </button>
            <button onClick={() => handleConsent(false)} style={{ fontSize: 11, padding: "5px 14px", background: "none", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, color: "rgba(255,255,255,0.30)", cursor: "pointer", fontFamily: "inherit" }}>
              Stay anonymous
            </button>
          </div>
        </div>
      )}

      {/* Returning user banner */}
      {isReturning && !showConsentPrompt && (
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "10px 16px", textAlign: "center", flexShrink: 0, width: "100%", boxSizing: "border-box" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: "9999px", background: DOPPEL_BLUE_SOFT, color: "#6BAEFF", fontSize: 11, animation: "banner-in 340ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <ISparkle />
            {clone.name} remembers you from {profile!.total_sessions} previous conversation{profile!.total_sessions !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Messages scroll area */}
      <div
        className="chat-scroll-area"
        ref={scrollRef}
        style={{ flex: 1, width: "100%", maxWidth: 920, margin: "0 auto", padding: isEmpty ? "24px 20px 16px" : "24px 20px 140px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", boxSizing: "border-box" }}
      >
        {isEmpty ? (
          <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
            {/* Intro header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 400, color: "rgba(255,255,255,0.55)", flexShrink: 0, overflow: "hidden" }}>
                {clone.avatar_url
                  ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : cloneInitial}
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.3, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.93)", margin: "0 0 2px" }}>Hi, I'm {clone.name}</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: 0 }}>Ask me anything — I'll answer in their voice.</p>
              </div>
            </div>

            {/* Knowledge areas */}
            {knowledgeAreas.length > 0 && (
              <div style={{ marginTop: 14, marginBottom: 4 }}>
                <span style={{ display: "block", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.30)", marginBottom: 8 }}>Knows well</span>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {knowledgeAreas.map((a, i) => {
                    const opacity = a.depth === "deep" ? 0.75 : a.depth === "solid" ? 0.50 : 0.32;
                    const bg = a.depth === "deep" ? 0.10 : a.depth === "solid" ? 0.06 : 0.03;
                    const border = a.depth === "deep" ? 0.18 : a.depth === "solid" ? 0.11 : 0.06;
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
          messages.map(msg => {
            if (msg.isStreaming && !msg.content) return null;
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                cloneColor={cloneColor}
                cloneInitial={cloneInitial}
                cloneAvatarUrl={clone.avatar_url}
              />
            );
          })
        )}

        {/* Typing indicator when loading but no streaming content yet */}
        {isLoading && messages.every(m => !m.isStreaming || !m.content) && (
          <div style={{ display: "flex", gap: 12, maxWidth: "100%" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, marginTop: 2, overflow: "hidden" }}>
              {clone.avatar_url
                ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : cloneInitial}
            </div>
            <div style={{ padding: "12px 15px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", display: "flex", alignItems: "center", gap: 5 }}>
              {isThinking
                ? <>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginLeft: 4 }}>Thinking…</span>
                  </>
                : [0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />)
              }
            </div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: 0 }}>{error}</p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(180deg, rgba(8,8,8,0) 0%, rgba(8,8,8,0.88) 30%, #080808 65%)", padding: "28px 20px 16px", flexShrink: 0 }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          {/* Composer box — relative container so popup anchors to it */}
          <div style={{ position: "relative" }}>
          {/* Live autocomplete popup */}
          {(autoLoading || autoSuggestions.length > 0) && (
            <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "rgba(14,14,14,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, overflow: "hidden", zIndex: 20, boxShadow: "0 -8px 32px rgba(0,0,0,0.50)" }}>
              {autoLoading && autoSuggestions.length === 0 ? (
                <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.25)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                </div>
              ) : autoSuggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggest(q)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: i < autoSuggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const, transition: "background 100ms" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ color: "rgba(255,255,255,0.22)", flexShrink: 0 }}>
                    <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z"/>
                  </svg>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{q}</span>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          )}
          <div
            style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, transition: "border-color 120ms, box-shadow 120ms" }}
            onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(26,115,232,0.22)"; e.currentTarget.style.transition = "all 280ms cubic-bezier(0.25,0.46,0.45,0.94)"; }}
            onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={agentMode ? "Give me a task…" : `Ask ${clone.name} anything…`}
              rows={1}
              style={{ flex: 1, border: "none", outline: "none", resize: "none" as const, background: "transparent", color: "rgba(255,255,255,0.93)", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit", minHeight: 22, maxHeight: 180, overflowY: "auto" }}
            />
            {agentRunning ? (
              <button
                onClick={stopAgent}
                title="Stop agent"
                style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.20)", color: "rgba(248,113,113,0.75)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 120ms" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.20)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; }}
              >
                <IStop />
              </button>
            ) : (
              <button
                className="composer-send"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                style={{ width: 36, height: 36, borderRadius: 12, background: (!input.trim() || isLoading) ? "rgba(255,255,255,0.07)" : agentMode ? "rgba(52,211,153,0.18)" : DOPPEL_BLUE, color: (!input.trim() || isLoading) ? "rgba(255,255,255,0.30)" : "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: (!input.trim() || isLoading) ? "not-allowed" : "pointer", flexShrink: 0, transition: "opacity 120ms, transform 120ms" }}
              >
                {isLoading
                  ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.30)", borderTopColor: "rgba(255,255,255,0.80)", animation: "spin 0.8s linear infinite" }} />
                  : <ISend />}
              </button>
            )}
          </div>
          </div>{/* end relative wrapper */}

          {/* Meta bar */}
          <div style={{ maxWidth: 920, margin: "8px auto 0", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
            {/* Response mode selector — hidden in agent mode */}
            {!agentMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                {MODES.map(m => {
                  const active = responseMode === m.value;
                  return (
                    <button key={m.value} onClick={() => setResponseMode(m.value)} title={m.hint}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: active ? "rgba(255,255,255,0.09)" : "transparent", color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)", whiteSpace: "nowrap" as const }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Agent mode toggle */}
            {agentMode && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${agentSidecarUrl ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)"}`, color: agentSidecarUrl ? "rgba(52,211,153,0.60)" : "rgba(255,255,255,0.25)" }}>
                {agentSidecarUrl ? "Agent ready" : "Agent not running"}
              </span>
            )}
            <button
              onClick={() => { setAgentMode(v => !v); setAgentEvents([]); setAgentPanelOpen(false); }}
              title="Agent mode — requires local backend running on this machine"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: 8,
                border: `1px solid ${agentMode ? "rgba(52,211,153,0.30)" : "rgba(255,255,255,0.07)"}`,
                background: agentMode ? "rgba(52,211,153,0.10)" : "transparent",
                color: agentMode ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.28)",
                fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                transition: "all 220ms cubic-bezier(0.25,0.46,0.45,0.94)",
              }}
              onMouseEnter={e => { if (!agentMode) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}}
              onMouseLeave={e => { if (!agentMode) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.28)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}}
            >
              <IAgent />
              Agent
            </button>

            {/* Credit info */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
              {cloneInfo?.is_paid && cloneInfo?.credit_cost != null && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(196,181,253,0.07)", border: "1px solid rgba(196,181,253,0.12)", color: "rgba(196,181,253,0.55)" }}>
                  {cloneInfo.credit_cost} credit{cloneInfo.credit_cost !== 1 ? "s" : ""}/msg
                </span>
              )}
              {credits !== null && (
                <>
                  {credits.plan > 0 && (
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.13)", color: "rgba(96,165,250,0.60)", fontVariantNumeric: "tabular-nums" }}>
                      {credits.plan.toLocaleString()} plan
                    </span>
                  )}
                  {credits.bought > 0 && (
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(196,181,253,0.07)", border: "1px solid rgba(196,181,253,0.12)", color: "rgba(196,181,253,0.55)", fontVariantNumeric: "tabular-nums" }}>
                      {credits.bought.toLocaleString()} bought
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agent thinking panel — floats top-right */}
      {agentPanelOpen && agentEvents.length > 0 && (
        <div style={{
          position: "absolute", top: 56, right: 12, width: 296,
          background: "rgba(10,10,10,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14,
          boxShadow: "0 8px 40px rgba(0,0,0,0.60)",
          display: "flex", flexDirection: "column",
          maxHeight: 460, zIndex: 40,
          animation: "panel-in 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94) both",
        }}>
          {/* Panel header */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px 9px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <IAgent />
            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", flex: 1, letterSpacing: "0.06em" }}>Agent</span>
            {agentRunning ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(52,211,153,0.70)" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.70)", display: "inline-block", animation: "typing-dot 1.2s ease-in-out infinite" }} />
                Running
              </span>
            ) : agentEvents.some(e => e.type === "done") ? (
              <span style={{ fontSize: 10, color: "rgba(52,211,153,0.60)" }}>Done</span>
            ) : agentEvents.some(e => e.type === "error") ? (
              <span style={{ fontSize: 10, color: "rgba(248,113,113,0.60)" }}>Error</span>
            ) : null}
            {!agentRunning && (
              <button
                onClick={() => setAgentPanelOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.28)", fontSize: 15, padding: "0 2px", lineHeight: 1, fontFamily: "inherit", marginLeft: 4 }}
                onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.60)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
                title="Dismiss"
              >×</button>
            )}
          </div>

          {/* Task bubble */}
          <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "8px 11px" }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.5, wordBreak: "break-word" as const }}>{agentTaskInstruction}</p>
            </div>
          </div>

          {/* Events feed */}
          <div
            className="agent-panel-scroll"
            ref={agentPanelScrollRef}
            style={{ flex: 1, overflowY: "auto", padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}
          >
            {agentEvents.map((evt, i) => {
              if (evt.type === "status") return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.22)", flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.55 }}>{evt.message}</span>
                </div>
              );
              if (evt.type === "thought") return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2, color: "rgba(255,255,255,0.38)" }}>
                    <circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.7"/>
                    <circle cx="3" cy="4.5" r="1.5" fill="currentColor" opacity="0.35"/>
                    <circle cx="13" cy="4.5" r="1.5" fill="currentColor" opacity="0.35"/>
                  </svg>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", lineHeight: 1.55 }}>{evt.text}</span>
                </div>
              );
              if (evt.type === "action") return (
                <div key={i} style={{ padding: "7px 10px", borderRadius: 9, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.10)" }}>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(52,211,153,0.70)", display: "block", marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{evt.action}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontFamily: "monospace, monospace", wordBreak: "break-all" as const }}>{evt.detail}</span>
                </div>
              );
              if (evt.type === "brain") return (
                <div key={i} style={{ padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2 }}>↳ {evt.query}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.5 }}>{evt.result.length > 120 ? evt.result.slice(0, 120) + "…" : evt.result}</span>
                </div>
              );
              if (evt.type === "screenshot") return (
                <div key={i} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <img src={`data:image/png;base64,${evt.data}`} alt="Screenshot" style={{ width: "100%", display: "block" }} />
                </div>
              );
              if (evt.type === "done") return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 12, color: "rgba(52,211,153,0.80)", fontWeight: 500 }}>Done — see chat below</span>
                </div>
              );
              if (evt.type === "error") return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 9, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="8" cy="8" r="6.5" stroke="rgba(248,113,113,0.65)" strokeWidth="1.3"/>
                    <path d="M8 5v4M8 11v.5" stroke="rgba(248,113,113,0.65)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span style={{ fontSize: 11, color: "rgba(248,113,113,0.70)" }}>{evt.message}</span>
                </div>
              );
              return null;
            })}
          </div>
        </div>
      )}

    </div>
  );
}
