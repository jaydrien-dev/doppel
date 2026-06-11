"use client";

import { useEffect, useState } from "react";
import { submitFeedback } from "@/lib/api";
import type { ChatMessage, FeedbackSignalType, MemorySource } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  cloneId?: string;
  cloneName?: string;
  ownerMode?: boolean;
  cloneInitial?: string;
  cloneColor?: string;
  onFeedback?: (helpful: boolean) => void;
}

// Icon SVGs (14px viewBox, 1.4 stroke, currentColor)
const ISource = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M3 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 013 13V3a.5.5 0 010-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M9 2.5V5h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const ICopy = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <rect x="4" y="4" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M10 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const IRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M12 3v3h-3M2 11V8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 6a4 4 0 016.5-1.5L12 6M11 8a4 4 0 01-6.5 1.5L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IUp = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M3 8.5l4-4 4 4M7 4.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IDown = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M3 5.5l4 4 4-4M7 9.5V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IEdit = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const IEmail = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="3" width="11" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M1.5 4.5l5 3.5 5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const INote = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M3 2h6l3 3v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M9 2v3h3M4.5 7.5h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);

function sourceKind(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("gmail") || s.includes("email")) return "Email";
  if (s.includes("slack")) return "Slack";
  if (s.includes("meet") || s.includes("zoom") || s.includes("call")) return "Meeting";
  if (s.includes("qa") || s.includes("seed") || s.includes("question")) return "Q&A";
  if (s.includes("notion") || s.includes("document") || s.includes("doc")) return "Doc";
  if (s.includes("manual") || s.includes("text")) return "Manual";
  return source.slice(0, 12);
}

function ConfidenceBar({ value }: { value: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.round(value * 100)), 80);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="msg__conf">
      <span style={{ color: "var(--fg-dark-2)" }}>Confidence</span>
      <div className="msg__conf__bar">
        <span style={{ width: `${w}%` }} />
      </div>
      <span className="msg__conf__val">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function MessageBubble({
  message,
  cloneId,
  cloneName = "Clone",
  ownerMode,
  cloneInitial = "A",
  cloneColor = "#1A73E8",
  onFeedback,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [feedbackSent, setFeedbackSent] = useState<FeedbackSignalType | null>(null);
  const [consFeedback, setConsFeedback] = useState<"up" | "down" | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  async function sendFeedback(type: FeedbackSignalType, corrected?: string) {
    if (!message.trace_id || !cloneId) return;
    setFeedbackSent(type);
    await submitFeedback({
      trace_id: message.trace_id,
      clone_id: cloneId,
      signal_type: type,
      corrected_response: corrected,
    }).catch(() => {});
  }

  function handleCopy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleEmailDraft() {
    const subject = message.content.split(/[.!?\n]/)[0].trim().slice(0, 80);
    const draft = `Subject: ${subject}\n\n${message.content}\n\n— ${cloneName}`;
    navigator.clipboard.writeText(draft);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }

  function handleSaveNote() {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const md = `# Note from ${cloneName}\n_${ts}_\n\n${message.content}\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cloneName.toLowerCase().replace(/\s+/g, "-")}-${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  const conf = message.confidence;
  // Split into paragraphs; fall back to single paragraph
  const paras = message.content.split(/\n\n+/).filter(Boolean);
  const sources = message.sources ?? [];

  return (
    <div className={`msg msg--${isUser ? "me" : "ai"}`}>
      {!isUser && (
        <div className="msg__av" style={{ background: cloneColor }}>
          {cloneInitial}
        </div>
      )}

      <div className="msg__col">
        {/* Bubble */}
        <div className="msg__bubble">
          {isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                style={{
                  width: "100%", background: "transparent", resize: "none",
                  color: "inherit", outline: "none", fontSize: 14, lineHeight: 1.55,
                  minWidth: 280, border: "none",
                }}
                rows={4}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{ fontSize: 12, color: "var(--fg-dark-3)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { sendFeedback("edited", editValue); setIsEditing(false); }}
                  style={{ fontSize: 12, color: "var(--fg-dark-1)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                >
                  Save correction
                </button>
              </div>
            </div>
          ) : (
            paras.map((p, i) => <p key={i}>{p}</p>)
          )}
        </div>

        {/* Source citation pills — always visible when sources exist */}
        {!isUser && !message.isStreaming && sources.length > 0 && (
          <div className="msg__cite">
            <span className="msg__cite__label">
              <ISource /> Sources
            </span>
            {sources.slice(0, 4).map((s: MemorySource, i: number) => (
              <span key={i} className="msg__cite__pill">
                <span className="msg__cite__pill__icon"><ISource /></span>
                <span>{sourceKind(s.source)}</span>
                {s.content && (
                  <span style={{ color: "var(--fg-dark-3)" }}>
                    — {s.content.slice(0, 35)}{s.content.length > 35 ? "…" : ""}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Confidence bar (animated) */}
        {!isUser && !message.isStreaming && conf !== undefined && (
          <ConfidenceBar value={conf} />
        )}

        {/* Extra badges (path taken, escalation) */}
        {!isUser && !message.isStreaming && (message.path_taken || message.needs_escalation) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {message.path_taken && (
              <span style={{ fontSize: 10, color: "var(--fg-dark-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {message.path_taken === "slow" ? "deep" : "fast"}
              </span>
            )}
            {message.needs_escalation && (
              <span style={{ fontSize: 10, color: "rgba(251,191,36,0.7)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 4, padding: "1px 6px" }}>
                needs review
              </span>
            )}
          </div>
        )}

        {/* Hover-reveal action buttons */}
        {!isUser && !message.isStreaming && (
          <div className="msg__actions">
            <button
              className={`msg__act${copied ? " msg__act--active" : ""}`}
              onClick={handleCopy}
              aria-label="Copy"
              title="Copy"
            >
              <ICopy />
            </button>
            <button
              className={`msg__act${emailCopied ? " msg__act--active" : ""}`}
              onClick={handleEmailDraft}
              aria-label="Copy as email draft"
              title={emailCopied ? "Copied!" : "Email draft"}
            >
              <IEmail />
            </button>
            <button
              className={`msg__act${noteSaved ? " msg__act--active" : ""}`}
              onClick={handleSaveNote}
              aria-label="Save as note"
              title={noteSaved ? "Saved!" : "Save note"}
            >
              <INote />
            </button>
            <button className="msg__act" aria-label="Regenerate" title="Regenerate">
              <IRefresh />
            </button>
            {ownerMode && message.trace_id && !feedbackSent ? (
              <>
                <button className="msg__act" onClick={() => sendFeedback("approved")} aria-label="Helpful" title="Helpful">
                  <IUp />
                </button>
                <button className="msg__act" onClick={() => sendFeedback("rejected")} aria-label="Not helpful" title="Not helpful">
                  <IDown />
                </button>
                <button className="msg__act" onClick={() => setIsEditing(true)} aria-label="Edit" title="Edit correction">
                  <IEdit />
                </button>
              </>
            ) : (
              !ownerMode && !consFeedback && onFeedback && (
                <>
                  <button
                    className="msg__act"
                    aria-label="Helpful"
                    title="Helpful"
                    onClick={() => { setConsFeedback("up"); onFeedback(true); }}
                  >
                    <IUp />
                  </button>
                  <button
                    className="msg__act"
                    aria-label="Not helpful"
                    title="Not helpful"
                    onClick={() => { setConsFeedback("down"); onFeedback(false); }}
                  >
                    <IDown />
                  </button>
                </>
              )
            )}
          </div>
        )}

        {consFeedback && !isUser && (
          <span style={{ fontSize: 11, color: "var(--fg-dark-3)", paddingLeft: 4 }}>
            {consFeedback === "up" ? "Thanks for the feedback." : "Got it — thanks."}
          </span>
        )}
        {feedbackSent && !isUser && (
          <span style={{ fontSize: 11, color: "var(--fg-dark-3)", paddingLeft: 4 }}>
            Feedback saved — {feedbackSent}
          </span>
        )}
      </div>
    </div>
  );
}
