"use client";

import { useEffect, useRef, useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import type { CloneOwnerInfo } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAdvancedMode } from "@/lib/context/AdvancedModeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileUploadItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  result?: string;
};

type InterviewMessage = { role: "clone" | "user"; text: string };

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrainPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (clones.length === 0) {
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

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Feed Data</h1>
        </div>
        <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
      </div>
      <TrainCloneContent key={clone.clone_id} clone={clone} />
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function TrainCloneContent({ clone }: { clone: CloneOwnerInfo }) {
  const { advanced } = useAdvancedMode();
  const [memoryStats, setMemoryStats] = useState<{ memory_used: number; memory_limit: number } | null>(null);

  useEffect(() => {
    if (!clone) return;
    fetch(`/api/brain/stats?clone_id=${clone.clone_id}`)
      .then(r => r.json())
      .then(d => setMemoryStats({ memory_used: d.memory_used ?? d.episodic ?? 0, memory_limit: d.memory_limit ?? 500 }))
      .catch(() => {});
  }, [clone?.clone_id]);

  return (
    <>
      {advanced && memoryStats && <MemoryUsageBar used={memoryStats.memory_used} limit={memoryStats.memory_limit} />}

      {/* ── Hero: Train by talking ── */}
      <InterviewTrainPanel clone={clone} />

      {/* ── Secondary: other methods ── */}
      <div style={{ marginTop: 8 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.20)", margin: "0 0 12px" }}>Other ways to add context</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <TextTrainPanel cloneId={clone.clone_id} />
          <VoiceTrainPanel cloneId={clone.clone_id} />
          <FileTrainPanel cloneId={clone.clone_id} />
        </div>
      </div>
    </>
  );
}

// ─── HERO: Interview training panel ───────────────────────────────────────────

const SUGGESTED_TOPICS = [
  "how I close deals",
  "my management style",
  "how I give feedback",
  "our pricing strategy",
  "how I think about product",
  "my decision-making process",
];

function InterviewTrainPanel({ clone }: { clone: CloneOwnerInfo }) {
  const [phase, setPhase] = useState<"topic" | "interview" | "review">("topic");
  const [topic, setTopic] = useState("");
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [chunks, setChunks] = useState<string[]>([]);
  const [removedChunks, setRemovedChunks] = useState<Set<number>>(new Set());
  const [ingesting, setIngesting] = useState(false);
  const [ingestDone, setIngestDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const userTurnCount = messages.filter(m => m.role === "user").length;

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  function reset() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
    setPhase("topic"); setMessages([]); setChunks([]); setRemovedChunks(new Set());
    setInput(""); setError(null); setIngestDone(false);
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!voiceSupported) return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const r = e.results[i];
        if (r.isFinal) setInput(prev => (prev + " " + r[0].transcript).trimStart());
      }
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => { if (e.error !== "no-speech") setError(`Mic: ${e.error}`); };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec; rec.start(); setRecording(true);
  }

  function startInterview(t?: string) {
    const topic_ = (t ?? topic).trim();
    if (!topic_) return;
    if (t) setTopic(t);
    setMessages([]); setError(null); setIngestDone(false);
    const opening = `Tell me about ${topic_}. Where would you like to start — and what's the most important thing you want me to understand about it?`;
    setMessages([{ role: "clone", text: opening }]);
    setPhase("interview");
  }

  async function handleSend() {
    recognitionRef.current?.stop();
    setRecording(false);
    const text = input.trim();
    if (!text || loading) return;
    setInput(""); setError(null);
    const updated: InterviewMessage[] = [...messages, { role: "user", text }];
    setMessages(updated);
    setLoading(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), messages: updated, action: "followup" }),
      });
      const d = await res.json();
      if (d.question) {
        setMessages(prev => [...prev, { role: "clone", text: d.question }]);
      } else {
        setError("No response — try again");
      }
    } catch { setError("Failed to get next question"); }
    finally { setLoading(false); }
  }

  async function handleFinish() {
    if (userTurnCount === 0) { reset(); return; }
    setFormatting(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), messages, action: "format" }),
      });
      const d = await res.json();
      setChunks(d.chunks ?? []);
      setRemovedChunks(new Set());
      setPhase("review");
    } catch { setError("Failed to format — try again"); }
    finally { setFormatting(false); }
  }

  async function handleIngestAll() {
    if (ingesting || chunks.length === 0) return;
    setIngesting(true); setError(null);
    const toIngest = chunks.filter((_, i) => !removedChunks.has(i));
    try {
      for (const chunk of toIngest) {
        await fetch("/api/ingestion/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clone_id: clone.clone_id, text: chunk, source: "interview" }),
        });
      }
      setIngestDone(true);
    } catch { setError("Ingestion failed — try again"); }
    finally { setIngesting(false); }
  }

  const keptChunks = chunks.filter((_, i) => !removedChunks.has(i));

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>

      {/* ── Header strip ── */}
      <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.22)", color: "rgba(167,139,250,0.85)", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.88)", margin: 0 }}>Train by talking</p>
                <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 999, background: "rgba(167,139,250,0.10)", color: "rgba(167,139,250,0.75)", border: "1px solid rgba(167,139,250,0.20)" }}>Recommended</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>
                Answer naturally — everything gets cleaned up and saved as structured knowledge.
              </p>
            </div>
          </div>

          {/* Step indicator */}
          {phase !== "topic" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {(["topic", "interview", "review"] as const).map((s, i) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600,
                    background: phase === s ? "rgba(167,139,250,0.20)" : (
                      (s === "topic" && (phase === "interview" || phase === "review")) ||
                      (s === "interview" && phase === "review")
                        ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)"
                    ),
                    border: `1px solid ${phase === s ? "rgba(167,139,250,0.35)" : (
                      (s === "topic" && (phase === "interview" || phase === "review")) ||
                      (s === "interview" && phase === "review")
                        ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.08)"
                    )}`,
                    color: phase === s ? "rgba(167,139,250,0.90)" : (
                      (s === "topic" && (phase === "interview" || phase === "review")) ||
                      (s === "interview" && phase === "review")
                        ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.25)"
                    ),
                  }}>
                    {(s === "topic" && (phase === "interview" || phase === "review")) ||
                      (s === "interview" && phase === "review") ? "✓" : i + 1}
                  </div>
                  {i < 2 && <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.08)" }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Phase: Topic ── */}
      {phase === "topic" && (
        <div style={{ padding: "32px 28px 28px" }}>
          <p style={{ fontSize: 22, fontWeight: 300, color: "rgba(255,255,255,0.80)", margin: "0 0 6px", lineHeight: 1.3 }}>
            What do you want to teach your clone today?
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "0 0 24px", lineHeight: 1.6 }}>
            Pick a topic — the interviewer will ask questions until it understands everything you know about it.
            When you're done, you review and approve before anything is saved.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, maxWidth: 600 }}>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && topic.trim()) startInterview(); }}
              placeholder="e.g. how I close deals, my management style, our pricing strategy…"
              className="input"
              style={{ flex: 1, fontSize: 14, padding: "11px 14px" }}
              autoFocus
            />
            <button
              onClick={() => startInterview()}
              disabled={!topic.trim()}
              style={{ padding: "0 22px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: topic.trim() ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.05)", border: `1px solid ${topic.trim() ? "rgba(167,139,250,0.30)" : "rgba(167,139,250,0.12)"}`, color: topic.trim() ? "rgba(167,139,250,0.90)" : "rgba(167,139,250,0.30)", cursor: topic.trim() ? "pointer" : "default", fontFamily: "inherit", transition: "all 160ms", whiteSpace: "nowrap" }}
            >
              Start →
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", alignSelf: "center", marginRight: 2 }}>Try:</span>
            {SUGGESTED_TOPICS.map(t => (
              <button
                key={t}
                onClick={() => startInterview(t)}
                style={{ fontSize: 12, padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit", transition: "border-color 140ms, color 140ms" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.18)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.09)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Phase: Interview ── */}
      {phase === "interview" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Topic + turn count bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 28px", background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Topic:</span>
            <span style={{ fontSize: 12, color: "rgba(167,139,250,0.75)", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.16)", borderRadius: 6, padding: "2px 9px" }}>{topic}</span>
            {userTurnCount > 0 && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginLeft: "auto" }}>
                {userTurnCount} {userTurnCount === 1 ? "exchange" : "exchanges"}
              </span>
            )}
          </div>

          {/* Chat area */}
          <div style={{ minHeight: 340, maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, padding: "20px 28px", scrollbarWidth: "thin" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                {m.role === "clone" && (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "rgba(167,139,250,0.85)", marginBottom: 2 }}>
                    {clone.display_name[0]?.toUpperCase()}
                  </div>
                )}
                <div style={{
                  maxWidth: "72%",
                  padding: "11px 15px",
                  borderRadius: m.role === "clone" ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                  background: m.role === "clone" ? "rgba(255,255,255,0.05)" : "rgba(167,139,250,0.11)",
                  border: `1px solid ${m.role === "clone" ? "rgba(255,255,255,0.08)" : "rgba(167,139,250,0.22)"}`,
                  fontSize: 13,
                  color: m.role === "clone" ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.75)",
                  lineHeight: 1.6,
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {(loading || formatting) && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "rgba(167,139,250,0.85)", flexShrink: 0 }}>
                  {clone.display_name[0]?.toUpperCase()}
                </div>
                <div style={{ display: "flex", gap: 5, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.35)", display: "inline-block", animation: `itv-bounce 1s ${i * 0.18}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px 18px" }}>
            {error && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.65)", margin: "0 0 8px 4px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={recording ? "Listening… speak your answer" : "Type your answer… (Enter to send, Shift+Enter for new line)"}
                  className="input"
                  rows={1}
                  style={{ width: "100%", fontSize: 13, lineHeight: 1.55, resize: "none", paddingRight: voiceSupported ? 40 : 14, boxSizing: "border-box", overflow: "hidden" }}
                  disabled={loading || formatting}
                />
                {voiceSupported && (
                  <button
                    onClick={toggleRecording}
                    disabled={loading || formatting}
                    title={recording ? "Stop recording" : "Speak your answer"}
                    style={{ position: "absolute", right: 10, bottom: 10, background: "none", border: "none", cursor: "pointer", padding: 0, color: recording ? "rgba(239,68,68,0.85)" : "rgba(255,255,255,0.28)", display: "flex", alignItems: "center", transition: "color 160ms" }}
                  >
                    {recording ? (
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(239,68,68,0.85)", display: "inline-block", animation: "itv-pulse 1s ease-in-out infinite" }} />
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M4 11a8 8 0 0016 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={!input.trim() || loading || formatting}
                style={{ padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: (input.trim() && !loading && !formatting) ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${(input.trim() && !loading && !formatting) ? "rgba(167,139,250,0.28)" : "rgba(255,255,255,0.07)"}`, color: (input.trim() && !loading && !formatting) ? "rgba(167,139,250,0.90)" : "rgba(255,255,255,0.22)", cursor: (!input.trim() || loading || formatting) ? "default" : "pointer", fontFamily: "inherit", transition: "all 160ms", flexShrink: 0 }}
              >
                Send
              </button>
            </div>

            {/* Bottom action row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", margin: 0 }}>
                {userTurnCount === 0 ? "Answer the first question to get started" : `${userTurnCount} exchange${userTurnCount !== 1 ? "s" : ""} · when you're ready, finish to review`}
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={reset}
                  style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.28)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Discard
                </button>
                <button
                  onClick={handleFinish}
                  disabled={loading || formatting || userTurnCount === 0}
                  style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: (userTurnCount > 0 && !loading && !formatting) ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.03)", border: `1px solid ${(userTurnCount > 0 && !loading && !formatting) ? "rgba(52,211,153,0.22)" : "rgba(255,255,255,0.07)"}`, color: (userTurnCount > 0 && !loading && !formatting) ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.20)", cursor: (loading || formatting || userTurnCount === 0) ? "default" : "pointer", fontFamily: "inherit", transition: "all 160ms" }}
                >
                  {formatting ? "Processing…" : "Finish & review →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase: Review ── */}
      {phase === "review" && (
        <div style={{ padding: "24px 28px 28px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: "0 0 4px" }}>
                {keptChunks.length} piece{keptChunks.length !== 1 ? "s" : ""} of knowledge extracted
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                Remove anything inaccurate or off-topic before saving. Everything else goes straight into memory.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "2px 9px" }}>{topic}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18, maxHeight: 400, overflowY: "auto", paddingRight: 2 }}>
            {chunks.map((chunk, i) => {
              const removed = removedChunks.has(i);
              return (
                <div
                  key={i}
                  style={{ padding: "12px 14px", borderRadius: 10, background: removed ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.04)", border: `1px solid ${removed ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)"}`, display: "flex", gap: 12, alignItems: "flex-start", transition: "all 180ms", opacity: removed ? 0.35 : 1 }}
                >
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "monospace", flexShrink: 0, paddingTop: 2, minWidth: 18 }}>#{i + 1}</span>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.65, margin: 0, flex: 1 }}>{chunk}</p>
                  <button
                    onClick={() => setRemovedChunks(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    })}
                    title={removed ? "Keep this" : "Remove this"}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: removed ? "rgba(52,211,153,0.50)" : "rgba(255,255,255,0.22)", flexShrink: 0, fontSize: 14, lineHeight: 1, marginTop: 1 }}
                  >
                    {removed ? "↩" : "×"}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {ingestDone ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(52,211,153,0.80)" }}>✓</div>
                <p style={{ fontSize: 13, color: "rgba(52,211,153,0.75)", margin: 0 }}>
                  {keptChunks.length} piece{keptChunks.length !== 1 ? "s" : ""} saved to memory
                </p>
                <button
                  onClick={reset}
                  style={{ marginLeft: 8, padding: "6px 14px", borderRadius: 8, fontSize: 12, background: "none", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.40)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Start new session
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleIngestAll}
                  disabled={ingesting || keptChunks.length === 0}
                  style={{ padding: "9px 22px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: keptChunks.length > 0 ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${keptChunks.length > 0 ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.07)"}`, color: keptChunks.length > 0 ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.25)", cursor: (ingesting || keptChunks.length === 0) ? "default" : "pointer", fontFamily: "inherit", opacity: ingesting ? 0.6 : 1, transition: "all 160ms" }}
                >
                  {ingesting ? "Saving…" : `Save ${keptChunks.length} piece${keptChunks.length !== 1 ? "s" : ""} to memory →`}
                </button>
                <button
                  onClick={() => setPhase("interview")}
                  style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  ← Keep talking
                </button>
                <button
                  onClick={reset}
                  style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, background: "none", border: "none", color: "rgba(255,255,255,0.22)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Discard
                </button>
              </>
            )}
            {error && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.65)", margin: 0 }}>{error}</p>}
          </div>
        </div>
      )}

      <style>{`
        @keyframes itv-bounce { 0%,100% { transform:translateY(0); opacity:0.3; } 50% { transform:translateY(-4px); opacity:1; } }
        @keyframes itv-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}

// ─── SECONDARY: Compact text panel ────────────────────────────────────────────

function TextTrainPanel({ cloneId }: { cloneId: string }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIngest() {
    const trimmed = text.trim();
    if (!trimmed || ingesting) return;
    setIngesting(true); setResult(null); setError(null);
    try {
      const res = await fetch("/api/ingestion/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, text: trimmed, source: "upload" }),
      });
      const d = await res.json();
      if (!res.ok) { setError(String(d.detail ?? d.error ?? "Failed")); return; }
      setResult(`${d.chunks_stored} chunk${d.chunks_stored !== 1 ? "s" : ""} saved`);
      setText(""); setOpen(false);
    } catch (e) { setError(String(e)); }
    finally { setIngesting(false); }
  }

  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: open ? 12 : 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 10h16M4 14h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>Paste text</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>Notes, bios, frameworks, opinions</p>
        </div>
        <button
          onClick={() => { setOpen(o => !o); setResult(null); setError(null); }}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" }}
        >
          {open ? "Close" : "Add"}
        </button>
      </div>
      {open && (
        <>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setResult(null); setError(null); }}
            placeholder="Paste or type anything here…"
            className="input"
            rows={4}
            style={{ width: "100%", fontSize: 13, lineHeight: 1.6, resize: "vertical", marginBottom: 8, boxSizing: "border-box" }}
            autoFocus
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleIngest}
              disabled={!text.trim() || ingesting}
              style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)", cursor: (!text.trim() || ingesting) ? "default" : "pointer", fontFamily: "inherit", opacity: (!text.trim() || ingesting) ? 0.4 : 1 }}
            >
              {ingesting ? "Saving…" : "Save to memory"}
            </button>
            {result && <span style={{ fontSize: 11, color: "rgba(52,211,153,0.70)" }}>{result}</span>}
            {error && <span style={{ fontSize: 11, color: "rgba(248,113,113,0.65)" }}>{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SECONDARY: Compact voice panel ───────────────────────────────────────────

function chunkTranscript(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    const joined = (current + " " + s).trim();
    if (joined.split(/\s+/).length > 250 && current) { chunks.push(current.trim()); current = s; }
    else current = joined;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.split(/\s+/).length >= 5);
}

function VoiceTrainPanel({ cloneId }: { cloneId: string }) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef("");
  const supported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function startRecording() {
    if (!supported) return;
    setError(null); setResult(null); setTranscript(""); setInterim(""); finalRef.current = "";
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalRef.current += r[0].transcript + " "; setTranscript(finalRef.current); }
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => { if (e.error !== "no-speech") setError(`Mic: ${e.error}`); };
    rec.onend = () => { setRecording(false); setInterim(""); };
    recognitionRef.current = rec; rec.start(); setRecording(true);
  }

  function stopRecording() { recognitionRef.current?.stop(); setRecording(false); }

  async function handleIngest() {
    const text = finalRef.current.trim();
    if (!text) return;
    const chunks = chunkTranscript(text);
    if (chunks.length === 0) { setError("Too short — speak a few more sentences."); return; }
    setIngesting(true); setError(null);
    try {
      let total = 0;
      for (const chunk of chunks) {
        const res = await fetch("/api/ingestion/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, text: chunk, source: "voice" }) });
        const d = await res.json(); total += d.chunks_stored ?? 0;
      }
      setResult(`${total} chunk${total !== 1 ? "s" : ""} saved`);
      setTranscript(""); finalRef.current = "";
    } catch { setError("Failed"); }
    finally { setIngesting(false); }
  }

  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: open ? 12 : 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: recording ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", border: `1px solid ${recording ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.09)"}`, color: recording ? "rgba(239,68,68,0.75)" : "rgba(255,255,255,0.45)", flexShrink: 0, transition: "all 200ms" }}>
          {recording
            ? <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(239,68,68,0.80)", animation: "itv-pulse 1s ease-in-out infinite" }} />
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 11a8 8 0 0016 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          }
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>Voice monologue</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>Speak freely, save the transcript</p>
        </div>
        <button
          onClick={() => { setOpen(o => !o); if (recording) stopRecording(); setResult(null); setError(null); }}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" }}
        >
          {open ? "Close" : "Record"}
        </button>
      </div>
      {open && (
        <>
          {!supported && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.65)", margin: "0 0 10px" }}>Not supported — use Chrome or Edge.</p>}
          {(transcript || interim || recording) && (
            <div style={{ minHeight: 60, maxHeight: 140, overflowY: "auto", padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6, marginBottom: 10 }}>
              {transcript}
              {interim && <span style={{ color: "rgba(255,255,255,0.28)" }}>{interim}</span>}
              {recording && !transcript && !interim && <span style={{ color: "rgba(255,255,255,0.22)" }}>Listening…</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {!recording
              ? <button onClick={startRecording} disabled={!supported} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.60)", cursor: supported ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: !supported ? 0.4 : 1 }}>Start recording</button>
              : <button onClick={stopRecording} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", color: "rgba(239,68,68,0.75)", cursor: "pointer", fontFamily: "inherit", animation: "itv-pulse 1.5s ease-in-out infinite" }}>Stop</button>
            }
            {transcript && !recording && (
              <button onClick={handleIngest} disabled={ingesting} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.60)", cursor: ingesting ? "default" : "pointer", fontFamily: "inherit" }}>
                {ingesting ? "Saving…" : "Save to memory"}
              </button>
            )}
            {result && <span style={{ fontSize: 11, color: "rgba(52,211,153,0.70)" }}>{result}</span>}
            {error && <span style={{ fontSize: 11, color: "rgba(248,113,113,0.65)" }}>{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SECONDARY: Compact file upload panel ─────────────────────────────────────

function FileTrainPanel({ cloneId }: { cloneId: string }) {
  const [fileQueue, setFileQueue] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const items: FileUploadItem[] = Array.from(files).map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file, status: "pending",
    }));
    setFileQueue(prev => [...prev, ...items]);
    uploadFiles(items);
  }

  async function uploadFiles(items: FileUploadItem[]) {
    for (const item of items) {
      setFileQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "uploading" } : f));
      try {
        const fd = new FormData();
        fd.append("clone_id", cloneId);
        fd.append("file", item.file);
        const res = await fetch("/fastapi/ingestion/file", { method: "POST", body: fd });
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { data = { error: res.statusText }; }
        if (!res.ok) {
          setFileQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "error", result: String(data.detail ?? data.error ?? `HTTP ${res.status}`) } : f));
        } else {
          setFileQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "done", result: `${data.chunks_stored} chunks` } : f));
        }
      } catch (e) {
        setFileQueue(prev => prev.map(f => f.id === item.id ? { ...f, status: "error", result: String(e) } : f));
      }
    }
  }

  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: open ? 12 : 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V6M12 6L8 10M12 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>Upload files</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>PDF · DOCX · TXT · CSV · MD</p>
        </div>
        <button
          onClick={() => { setOpen(o => !o); setFileQueue([]); }}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" }}
        >
          {open ? "Close" : "Upload"}
        </button>
      </div>
      {open && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `1.5px dashed ${isDragging ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)"}`, borderRadius: 10, padding: "18px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", background: isDragging ? "rgba(255,255,255,0.03)" : "transparent", transition: "all 160ms", marginBottom: 8 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.22)" }}><path d="M12 16V6M12 6L8 10M12 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>Drop files or click to browse</p>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.html" style={{ display: "none" }} onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }} />
          {fileQueue.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {fileQueue.map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "monospace", minWidth: 30 }}>{item.file.name.split(".").pop()?.toUpperCase()}</span>
                  <span style={{ flex: 1, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</span>
                  <span style={{ fontSize: 11, flexShrink: 0, color: item.status === "done" ? "rgba(52,211,153,0.65)" : item.status === "error" ? "rgba(248,113,113,0.60)" : "rgba(255,255,255,0.28)" }}>
                    {item.status === "uploading" ? "…" : item.status === "done" ? item.result : item.status === "error" ? "error" : "queued"}
                  </span>
                  <button onClick={() => setFileQueue(prev => prev.filter(f => f.id !== item.id))} style={{ color: "rgba(255,255,255,0.15)", background: "none", border: "none", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Memory usage bar ──────────────────────────────────────────────────────────

function MemoryUsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isNear = pct >= 80;
  const isAt = pct >= 100;
  const barColor = isAt ? "rgba(248,113,113,0.70)" : isNear ? "rgba(251,191,36,0.70)" : "rgba(52,211,153,0.60)";
  return (
    <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${isAt ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)"}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0 }}>Memory usage</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
            <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{used.toLocaleString()}</span> / {limit.toLocaleString()} chunks
          </span>
          {(isAt || isNear) && <a href="/dashboard/billing" style={{ fontSize: 11, fontWeight: 500, padding: "2px 9px", borderRadius: 7, background: isAt ? "rgba(248,113,113,0.10)" : "rgba(251,191,36,0.08)", border: `1px solid ${isAt ? "rgba(248,113,113,0.22)" : "rgba(251,191,36,0.18)"}`, color: isAt ? "rgba(248,113,113,0.75)" : "rgba(251,191,36,0.65)", textDecoration: "none" }}>Upgrade</a>}
        </div>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: barColor, transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}
