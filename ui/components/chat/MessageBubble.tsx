"use client";

import { useState } from "react";
import { submitFeedback } from "@/lib/api";
import type { ChatMessage, FeedbackSignalType, MemorySource } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  cloneId?: string;
  ownerMode?: boolean;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "text-emerald-400/80 border-emerald-400/25";
  if (c >= 0.6) return "text-amber-400/80 border-amber-400/25";
  return "text-red-400/70 border-red-400/20";
}

function sourceLabel(source: string): { label: string; color: string } {
  const s = source.toLowerCase();
  if (s.includes("gmail") || s.includes("email")) return { label: "Email", color: "bg-blue-500/15 text-blue-300/70" };
  if (s.includes("slack")) return { label: "Slack", color: "bg-purple-500/15 text-purple-300/70" };
  if (s.includes("meet") || s.includes("zoom") || s.includes("call")) return { label: "Meeting", color: "bg-indigo-500/15 text-indigo-300/70" };
  if (s.includes("qa") || s.includes("seed") || s.includes("question")) return { label: "Q&A", color: "bg-emerald-500/15 text-emerald-300/70" };
  if (s.includes("manual") || s.includes("text")) return { label: "Manual", color: "bg-white/10 text-white/40" };
  if (s.includes("document") || s.includes("doc")) return { label: "Doc", color: "bg-amber-500/15 text-amber-300/70" };
  return { label: source.slice(0, 12), color: "bg-white/10 text-white/35" };
}

function SourcesPanel({ sources }: { sources: MemorySource[] }) {
  const [open, setOpen] = useState(false);
  const top = sources.slice(0, 4);

  return (
    <div className="px-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
      >
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none"
          className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          <path d="M2 1.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {sources.length} {sources.length === 1 ? "source" : "sources"}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {top.map((s, i) => {
            const { label, color } = sourceLabel(s.source);
            const pct = Math.round(s.similarity * 100);
            return (
              <div key={i} className="glass rounded-xl px-3 py-2.5 text-[11px] leading-relaxed">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${color}`}>
                    {label}
                  </span>
                  <span className="text-white/20 text-[10px]">{pct}% match</span>
                  {s.created_at && (
                    <span className="text-white/15 text-[10px] ml-auto">
                      {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
                <p className="text-white/45">
                  {(s.content ?? "").slice(0, 140)}{(s.content ?? "").length > 140 ? "…" : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, cloneId, ownerMode }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [feedbackSent, setFeedbackSent] = useState<FeedbackSignalType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

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

  const conf = message.confidence;

  return (
    <div className={`flex items-start gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full glass-md flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[10px] font-medium text-white/50">AI</span>
        </div>
      )}

      <div className={`flex flex-col gap-1.5 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "glass-md rounded-tr-sm text-white/90"
              : "glass rounded-tl-sm text-white/85"
          }`}
        >
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-transparent resize-none text-white/90 outline-none text-sm leading-relaxed min-w-[280px]"
                rows={4}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    sendFeedback("edited", editValue);
                    setIsEditing(false);
                  }}
                  className="text-xs text-white/70 hover:text-white/90 transition-colors font-medium"
                >
                  Save correction
                </button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {/* Confidence + metadata row */}
        {!isUser && !message.isStreaming && (conf !== undefined || message.path_taken) && (
          <div className="flex items-center gap-2 px-1">
            {conf !== undefined && (
              <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${confidenceColor(conf)}`}>
                {Math.round(conf * 100)}% confident
              </span>
            )}
            {message.path_taken && (
              <span className="text-[10px] text-white/20 uppercase tracking-wider">
                {message.path_taken === "slow" ? "deep" : "fast"}
              </span>
            )}
            {message.needs_escalation && (
              <span className="text-[10px] text-amber-400/60 border border-amber-400/20 rounded px-1.5 py-0.5">
                needs review
              </span>
            )}
          </div>
        )}

        {/* Sources provenance */}
        {!isUser && !message.isStreaming && message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} />
        )}

        {/* Feedback buttons — owner mode only */}
        {ownerMode && !isUser && message.trace_id && !feedbackSent && !message.isStreaming && (
          <div className="flex items-center gap-1.5 px-1">
            <button
              onClick={() => sendFeedback("approved")}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              title="Approve"
            >
              ✓ approve
            </button>
            <span className="text-white/15">·</span>
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              title="Edit"
            >
              ✎ edit
            </button>
            <span className="text-white/15">·</span>
            <button
              onClick={() => sendFeedback("rejected")}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              title="Reject"
            >
              ✕ reject
            </button>
          </div>
        )}

        {feedbackSent && !isUser && (
          <span className="text-[10px] text-white/25 px-1">
            Feedback saved — {feedbackSent}
          </span>
        )}
      </div>
    </div>
  );
}
