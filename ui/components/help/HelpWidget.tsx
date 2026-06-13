"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface HelpMessage {
  role: "user" | "assistant";
  content: string;
}

interface HelpClone {
  clone_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [helpClone, setHelpClone] = useState<HelpClone | null | undefined>(undefined); // undefined = not yet fetched
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Fetch the designated help clone once on mount
  useEffect(() => {
    fetch("/api/help/clone")
      .then((r) => r.json())
      .then((data) => setHelpClone(data.clone ?? null))
      .catch(() => setHelpClone(null));
  }, []);

  // Seed the initial message when opening for the first time
  useEffect(() => {
    if (open && !initialized && helpClone !== undefined) {
      const cloneName = helpClone?.display_name ?? "doppel";
      setMessages([{
        role: "assistant",
        content: `Hi, I'm ${cloneName}. Ask me anything — "how do I train my clone", "where is billing", etc.`,
      }]);
      setInitialized(true);
    }
  }, [open, initialized, helpClone]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: HelpMessage = { role: "user", content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let responseText: string;

      if (helpClone) {
        // Use the admin's designated help clone via the brain
        const history = messages.map(m => ({ role: m.role, content: m.content }));
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clone_id: helpClone.clone_id,
            message: trimmed,
            session_id: sessionIdRef.current,
            conversation_history: history,
          }),
        });
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        responseText = data.response ?? data.message ?? "Something went wrong.";
      } else {
        // Fallback: call the hardcoded help chat route
        const history = messages.filter(m => m.role !== "assistant" || messages.indexOf(m) !== 0);
        const res = await fetch("/api/help/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        });
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        responseText = data.response ?? "Something went wrong.";
      }

      setMessages(prev => [...prev, { role: "assistant", content: responseText }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, helpClone]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const cloneLabel = helpClone?.display_name ?? "Ask doppel";

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Help"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 998,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: open ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.13)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          color: "rgba(255,255,255,0.70)",
          fontSize: 16,
          fontWeight: 500,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 180ms, border-color 180ms, transform 180ms",
          boxShadow: "0 4px 20px rgba(0,0,0,0.40)",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
      >
        {open ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
            <path d="M6.3 6.3c0-1 .8-1.8 1.7-1.8s1.7.8 1.7 1.8c0 .8-.5 1.4-1.2 1.7-.3.1-.5.4-.5.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="8" cy="11" r=".65" fill="currentColor"/>
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 68,
            zIndex: 999,
            width: 340,
            height: 480,
            background: "rgba(14,14,14,0.96)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 18,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03) inset",
            animation: "hw-in 220ms cubic-bezier(0.34,1.56,0.64,1) both",
          }}
        >
          <style>{`
            @keyframes hw-in {
              from { opacity: 0; transform: scale(0.90) translateY(12px); }
              to   { opacity: 1; transform: scale(1)    translateY(0);    }
            }
            .hw-scroll::-webkit-scrollbar { width: 3px; }
            .hw-scroll::-webkit-scrollbar-track { background: transparent; }
            .hw-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
            .hw-textarea { resize: none; outline: none; border: none; background: transparent; font-family: inherit; }
            .hw-textarea::-webkit-scrollbar { display: none; }
          `}</style>

          {/* Header */}
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {helpClone?.avatar_url ? (
                <img
                  src={helpClone.avatar_url}
                  alt=""
                  style={{ width: 24, height: 24, borderRadius: 7, objectFit: "cover", border: "1px solid rgba(255,255,255,0.10)" }}
                />
              ) : (
                <div style={{
                  width: 24, height: 24, borderRadius: 7,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="4.5" cy="6" r="4" fill="rgba(255,255,255,0.50)"/>
                    <circle cx="7.5" cy="6" r="4" fill="rgba(255,255,255,0.28)"/>
                  </svg>
                </div>
              )}
              <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>{cloneLabel}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.30)", fontSize: 18, lineHeight: 1,
                padding: "0 2px", fontFamily: "inherit",
                transition: "color 150ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            className="hw-scroll"
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 14px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {helpClone === undefined ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.25)", animation: "typing-dot 1.2s ease-in-out 0s infinite" }} />
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "82%",
                      padding: "9px 12px",
                      borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                      background: msg.role === "user"
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(255,255,255,0.04)",
                      border: msg.role === "user"
                        ? "1px solid rgba(255,255,255,0.10)"
                        : "1px solid rgba(255,255,255,0.06)",
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: msg.role === "user" ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.65)",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.content.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "12px 12px 12px 3px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}>
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.35)",
                        animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                  <style>{`
                    @keyframes typing-dot {
                      0%, 80%, 100% { transform: scale(0.55); opacity: 0.25; }
                      40%           { transform: scale(1);    opacity: 0.75; }
                    }
                  `}</style>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "10px 12px",
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            flexShrink: 0,
          }}>
            <textarea
              ref={textareaRef}
              className="hw-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={1}
              disabled={loading || helpClone === undefined}
              style={{
                flex: 1,
                fontSize: 13,
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.80)",
                minHeight: 22,
                maxHeight: 120,
                overflowY: "auto",
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading || helpClone === undefined}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                border: "none",
                background: (!input.trim() || loading) ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
                color: (!input.trim() || loading) ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.80)",
                cursor: (!input.trim() || loading) ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                if (input.trim() && !loading) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.18)";
                }
              }}
              onMouseLeave={(e) => {
                if (input.trim() && !loading) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
