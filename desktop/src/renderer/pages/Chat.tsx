import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Clone { id: string; handle: string; name: string; category?: string; avatar_url?: string; }

interface ChatMessage {
  id: string;
  role: "user" | "clone";
  content: string;
  isStreaming?: boolean;
}

type ResponseMode = "fast" | "pro" | "extended";

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

// ─── Chat hook ────────────────────────────────────────────────────────────────

interface UseChatOptions {
  clone: Clone;
  sessionId: string;
  apiUrl: string;
  userId: string;
  responseMode: ResponseMode;
}

function useDesktopChat({ clone, sessionId, apiUrl, userId, responseMode }: UseChatOptions) {
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

  return { messages, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef };
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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, maxWidth: "100%", animation: "fade-up 200ms ease both" }}>
        <div style={{ padding: "12px 15px", borderRadius: "14px 14px 4px 14px", background: DOPPEL_BLUE, color: "#fff", fontSize: 14, lineHeight: 1.55, maxWidth: "78%", wordBreak: "break-word" }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Clone message
  const lines = msg.content ? msg.content.split("\n") : [];
  return (
    <div style={{ display: "flex", gap: 12, maxWidth: "100%", animation: "fade-up 200ms ease both" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, marginTop: 2, overflow: "hidden" }}>
        {cloneAvatarUrl
          ? <img src={cloneAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : cloneInitial}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ padding: "12px 15px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.93)", maxWidth: "82%", wordBreak: "break-word" }}>
          {msg.isStreaming && !msg.content ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          ) : (
            lines.map((line, i) => (
              <React.Fragment key={i}>
                {line}
                {i < lines.length - 1 && <br />}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatPage ─────────────────────────────────────────────────────────────

export function ChatPage({ clone, onBack }: { clone: Clone; onBack: () => void }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [responseMode, setResponseMode] = useState<ResponseMode>("fast");
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<{ exists: boolean; total_sessions?: number } | null>(null);
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [userId, setUserId] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load settings
  useEffect(() => {
    window.electronAPI?.getSettings().then((s: any) => {
      if (s?.fastapiUrl) setApiUrl(s.fastapiUrl);
      if (s?.userId) setUserId(s.userId);
    });
  }, []);

  // Resolve session: prefer server-side session for authenticated users, fall back to localStorage
  useEffect(() => {
    const key = `doppel_session:${clone.handle}`;

    async function resolveSession() {
      const s = await window.electronAPI?.getSettings().catch(() => null);
      const uid = s?.userId;
      const url = s?.fastapiUrl ?? "http://localhost:8000";

      if (uid) {
        try {
          const res = await fetch(`${url}/consumer/session?clone_handle=${encodeURIComponent(clone.handle)}`, {
            headers: { "X-User-Id": uid },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.session_id) {
              localStorage.setItem(key, data.session_id);
              setSessionId(data.session_id);
              return;
            }
          }
        } catch { /* non-fatal */ }
      }

      const existing = localStorage.getItem(key);
      if (existing) {
        setSessionId(existing);
      } else {
        const fresh = uuid();
        localStorage.setItem(key, fresh);
        setSessionId(fresh);
      }
    }

    resolveSession();
  }, [clone.handle]);

  // Consumer profile for returning-user banner
  useEffect(() => {
    if (!userId || !apiUrl) return;
    fetch(`${apiUrl}/clones/${clone.handle}/my-profile`, {
      headers: { "X-User-Id": userId },
    })
      .then(r => r.json())
      .then(d => setProfile(d))
      .catch(() => {});
  }, [userId, apiUrl, clone.handle]);

  const { messages, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef } = useDesktopChat({
    clone,
    sessionId,
    apiUrl,
    userId,
    responseMode,
  });

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
    sendMessage(input.trim());
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleSuggest(q: string) { sendMessage(q); }

  function handleShare() {
    const url = `https://doppel.ai/c/${clone.handle}`;
    try { navigator.clipboard.writeText(url); } catch { /* non-fatal */ }
  }

  const cloneColor = deriveColor(clone.name);
  const cloneInitial = clone.name[0]?.toUpperCase() ?? "A";
  const isEmpty = messages.length === 0;
  const isReturning = profile?.exists && (profile.total_sessions ?? 0) > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080808", color: "rgba(255,255,255,0.82)", fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes typing-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 0.8; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .chat-textarea::-webkit-scrollbar { display: none; }
        .chat-scroll-area::-webkit-scrollbar { width: 4px; }
        .chat-scroll-area::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
        .chat-scroll-area::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
        .suggest-chip:hover { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.16) !important; }
        .hdr-act:hover { background: rgba(255,255,255,0.07) !important; color: rgba(255,255,255,0.93) !important; }
        .hdr-back:hover { background: rgba(255,255,255,0.07) !important; color: rgba(255,255,255,0.93) !important; }
        .composer-send:not(:disabled):hover { opacity: 0.88; }
        .composer-send:not(:disabled):active { transform: scale(0.93); }
      `}</style>

      {/* Chat header */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(8,8,8,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.09)", flexShrink: 0 } as React.CSSProperties}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
          <button className="hdr-back" onClick={onBack} aria-label="Back" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.09)", cursor: "pointer", flexShrink: 0, transition: "all 120ms" }}>
            <IBack />
          </button>
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
            <button className="hdr-act" onClick={startNewConversation} aria-label="New conversation" title="New conversation" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms" }}>
              <INewChat />
            </button>
            <button className="hdr-act" onClick={handleShare} aria-label="Share" title="Share" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms" }}>
              <IShare />
            </button>
            <button className="hdr-act" aria-label="More options" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.50)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms" }}>
              <IMore />
            </button>
          </div>
        </div>
      </header>

      {/* Returning user banner */}
      {isReturning && (
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "10px 16px", textAlign: "center", flexShrink: 0, width: "100%", boxSizing: "border-box" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: "9999px", background: DOPPEL_BLUE_SOFT, color: "#6BAEFF", fontSize: 11 }}>
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

            {/* Suggested questions */}
            <span style={{ display: "block", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.50)", fontWeight: 500, margin: "20px 0 10px" }}>Try one of these</span>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              {SUGGESTED_DEFAULT.map((q, i) => (
                <button
                  key={i}
                  className="suggest-chip"
                  onClick={() => handleSuggest(q)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all 120ms" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.50)" }}><IMsg /></span>{q}
                </button>
              ))}
            </div>
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
          {/* Composer box */}
          <div
            style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, transition: "border-color 120ms, box-shadow 120ms" }}
            onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(26,115,232,0.30)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${clone.name} anything…`}
              rows={1}
              style={{ flex: 1, border: "none", outline: "none", resize: "none" as const, background: "transparent", color: "rgba(255,255,255,0.93)", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit", minHeight: 22, maxHeight: 180, overflowY: "auto" }}
            />
            <button
              className="composer-send"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              style={{ width: 36, height: 36, borderRadius: 12, background: (!input.trim() || isLoading) ? "rgba(255,255,255,0.07)" : DOPPEL_BLUE, color: (!input.trim() || isLoading) ? "rgba(255,255,255,0.30)" : "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: (!input.trim() || isLoading) ? "not-allowed" : "pointer", flexShrink: 0, transition: "opacity 120ms, transform 120ms" }}
            >
              {isLoading
                ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.30)", borderTopColor: "rgba(255,255,255,0.80)", animation: "spin 0.8s linear infinite" }} />
                : <ISend />}
            </button>
          </div>

          {/* Meta bar */}
          <div style={{ maxWidth: 920, margin: "8px auto 0", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
            {/* Response mode selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
              {MODES.map(m => {
                const active = responseMode === m.value;
                return (
                  <button key={m.value} onClick={() => setResponseMode(m.value)} title={m.hint}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: active ? "rgba(255,255,255,0.09)" : "transparent", color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", transition: "all 120ms", whiteSpace: "nowrap" as const }}>
                    {m.label}
                  </button>
                );
              })}
            </div>

            <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.25)" }}>Enter · Shift+Enter new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}
