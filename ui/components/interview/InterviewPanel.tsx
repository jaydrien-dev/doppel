"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ingestText } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Domain = "expertise" | "decisions" | "beliefs" | "network";
type Phase  = "pick" | "active" | "complete";

interface Exchange {
  question: string;
  answer:   string;
}

// ─── Speech API shim (browser-only) ──────────────────────────────────────────

interface SRInstance {
  continuous:      boolean;
  interimResults:  boolean;
  lang:            string;
  start():         void;
  stop():          void;
  onresult:        ((e: SREvent) => void) | null;
  onerror:         ((e: { error: string }) => void) | null;
  onend:           (() => void) | null;
}
type SREvent = {
  results:     { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean } };
  resultIndex: number;
};

// ─── Domain meta ─────────────────────────────────────────────────────────────

const DOMAINS: { id: Domain; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: "expertise",
    label: "Work & expertise",
    sub: "What you know, what you've built, what makes your approach different.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "decisions",
    label: "How you think",
    sub: "Mental models, frameworks, how you handle trade-offs and uncertainty.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "beliefs",
    label: "What you believe",
    sub: "Contrarian opinions, hard-won principles, views you'd defend publicly.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "network",
    label: "Your network",
    sub: "Key people in your world, what they represent, how you think about relationships.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="5"  r="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="5"  cy="19" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="19" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M12 7.5v4M12 11.5l-5 5M12 11.5l5 5"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const DOMAIN_LABELS: Record<Domain, string> = {
  expertise: "Work & expertise",
  decisions: "How you think",
  beliefs:   "What you believe",
  network:   "Your network",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const IMic = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IStop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>
  </svg>
);

const ISpeaker = ({ off }: { off: boolean }) => off ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IArrow = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ICheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function InterviewPanel({
  cloneId,
  cloneName,
}: {
  cloneId:   string;
  cloneName: string;
}) {
  const [domain,          setDomain]          = useState<Domain | null>(null);
  const [phase,           setPhase]           = useState<Phase>("pick");
  const [exchanges,       setExchanges]       = useState<Exchange[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentAnswer,   setCurrentAnswer]   = useState("");
  const [loading,         setLoading]         = useState(false);
  const [voiceEnabled,    setVoiceEnabled]    = useState(false);
  const [listening,       setListening]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [savedCount,      setSavedCount]      = useState(0);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const srRef          = useRef<SRInstance | null>(null);
  const synthRef       = useRef<SpeechSynthesis | null>(null);
  const finalSRRef     = useRef<string>("");  // accumulated final transcript for current answer

  // Init speech synthesis ref
  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis ?? null;
    }
  }, []);

  // Scroll to bottom when exchanges grow
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [exchanges, currentQuestion]);

  // Speak text via browser TTS
  const speak = useCallback((text: string, onEnd?: () => void) => {
    const synth = synthRef.current;
    if (!synth) { onEnd?.(); return; }
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = 1.0;
    utt.pitch = 1.0;
    utt.onend = () => onEnd?.();
    synth.speak(utt);
  }, []);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
  }, []);

  // Start mic — accumulates final results in a ref so interim doesn't wipe prior text
  const startListening = useCallback((onResult: (t: string) => void) => {
    if (typeof window === "undefined") return;
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition as (new () => SRInstance) | undefined
           ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition as (new () => SRInstance) | undefined;
    if (!SR) return;

    finalSRRef.current = "";  // reset accumulator for new answer

    const rec = new SR();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = "en-US";
    rec.onresult = (e: SREvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        if (e.results[i].isFinal) {
          finalSRRef.current += e.results[i][0].transcript + " ";
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      // Show committed text + live interim — never resets prior committed words
      onResult(finalSRRef.current + interim);
    };
    rec.onerror = () => { setListening(false); };
    rec.onend   = () => { setListening(false); };
    srRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    srRef.current?.stop();
    srRef.current = null;
    setListening(false);
  }, []);

  // Fallback opening question per domain
  const FALLBACK: Record<string, string> = {
    expertise:  "What do you work on, and what's your main area of expertise?",
    decisions:  "Walk me through how you make a hard decision.",
    beliefs:    "What's something you believe that most people in your field disagree with?",
    network:    "Who do you learn from the most right now, and why?",
  };

  // Fetch next question from AI
  const fetchQuestion = useCallback(async (history: Exchange[]) => {
    setLoading(true);
    try {
      const res = await fetch("/api/interview/message", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_name: cloneName, domain, history }),
      });
      const data = await res.json() as { question?: string; done?: boolean; error?: string };
      const question = data.question ?? (domain ? FALLBACK[domain] : "Tell me more about yourself.");
      setCurrentQuestion(question);

      if (voiceEnabled && question) {
        speak(question, () => {
          startListening((t) => setCurrentAnswer(t));
        });
      }
    } catch {
      const fallback = domain ? FALLBACK[domain] : "What do you work on?";
      setCurrentQuestion(fallback);
    } finally {
      setLoading(false);
    }
  }, [cloneName, domain, voiceEnabled, speak, startListening]);

  // Start interview
  async function handleStart() {
    if (!domain) return;
    setPhase("active");
    setExchanges([]);
    setCurrentAnswer("");
    await fetchQuestion([]);
  }

  // Submit current answer
  async function handleSubmit() {
    const trimmed = currentAnswer.trim();
    if (!trimmed || loading) return;

    stopListening();
    stopSpeaking();
    finalSRRef.current = "";

    const newExchanges: Exchange[] = [...exchanges, { question: currentQuestion, answer: trimmed }];
    setExchanges(newExchanges);
    setCurrentAnswer("");
    await fetchQuestion(newExchanges);
  }

  // Finish and ingest
  async function handleFinish() {
    stopListening();
    stopSpeaking();

    // Include current answer if present
    const finalExchanges = currentAnswer.trim()
      ? [...exchanges, { question: currentQuestion, answer: currentAnswer.trim() }]
      : [...exchanges];

    if (finalExchanges.length === 0) { setPhase("pick"); return; }

    setSaving(true);
    try {
      const label = domain ? DOMAIN_LABELS[domain] : "General";
      const text = `## Interview: ${label}\n\n` +
        finalExchanges.map(e => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n");

      const result = await ingestText({
        clone_id: cloneId,
        text,
        source:    "interview",
        is_pinned: true,
      });
      setSavedCount(result.chunks_stored);
    } catch {
      setSavedCount(finalExchanges.length);
    } finally {
      setSaving(false);
      setPhase("complete");
    }
  }

  function handleMicToggle() {
    if (listening) {
      stopListening();
    } else {
      startListening((t) => setCurrentAnswer(t));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function resetToStart() {
    setDomain(null);
    setPhase("pick");
    setExchanges([]);
    setCurrentQuestion("");
    setCurrentAnswer("");
    stopListening();
    stopSpeaking();
  }

  // ── Render: pick phase ──────────────────────────────────────────────────────

  if (phase === "pick") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
        {/* Header */}
        <div style={{ padding: "28px 32px 0", maxWidth: 640 }}>
          <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
            interview
          </p>
          <h2 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            What do you want to talk about?
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, margin: 0 }}>
            Pick a topic. An AI interviewer will ask you questions and follow up on your answers. Everything gets saved as high-priority memory.
          </p>
        </div>

        {/* Domain cards */}
        <div style={{ padding: "24px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 640 }}>
          {DOMAINS.map((d) => {
            const sel = domain === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDomain(d.id)}
                style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  padding: "18px 16px", borderRadius: 14, textAlign: "left",
                  fontFamily: "inherit", cursor: "pointer",
                  background: sel ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${sel ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)"}`,
                  transition: "background 140ms, border-color 140ms",
                }}
                onMouseEnter={(e) => { if (!sel) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.11)"; } }}
                onMouseLeave={(e) => { if (!sel) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; } }}
              >
                <span style={{ color: sel ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)" }}>
                  {d.icon}
                </span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: sel ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.60)", margin: "0 0 4px" }}>
                    {d.label}
                  </p>
                  <p style={{ fontSize: 12, color: sel ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.25)", margin: 0, lineHeight: 1.55 }}>
                    {d.sub}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Voice toggle + start */}
        <div style={{ padding: "0 32px 32px", display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setVoiceEnabled(v => !v)}
            title={voiceEnabled ? "Voice on — click to disable" : "Voice off — click to enable"}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 14px", borderRadius: 10, fontFamily: "inherit", cursor: "pointer",
              fontSize: 12, fontWeight: 500,
              background: voiceEnabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${voiceEnabled ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
              color: voiceEnabled ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
              transition: "all 140ms",
            }}
          >
            <ISpeaker off={!voiceEnabled} />
            {voiceEnabled ? "Voice on" : "Voice off"}
          </button>

          <button
            onClick={handleStart}
            disabled={!domain}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 10, fontFamily: "inherit", cursor: domain ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 500,
              background: domain ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${domain ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
              color: domain ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)",
              transition: "all 140ms",
            }}
          >
            Start interview <IArrow />
          </button>
        </div>
      </div>
    );
  }

  // ── Render: complete phase ──────────────────────────────────────────────────

  if (phase === "complete") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "48px 32px", maxWidth: 520 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.22)",
          color: "#34D399",
        }}>
          <ICheck />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Interview complete.
        </h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", lineHeight: 1.6, margin: "0 0 28px" }}>
          {savedCount > 0
            ? `${savedCount} memory ${savedCount === 1 ? "chunk" : "chunks"} saved — your clone knows you better.`
            : `${exchanges.length} answers saved as pinned memories.`}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={resetToStart}
            style={{
              padding: "10px 18px", borderRadius: 10, fontFamily: "inherit", cursor: "pointer",
              fontSize: 13, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.80)",
            }}
          >
            Start another
          </button>
        </div>
      </div>
    );
  }

  // ── Render: active phase ────────────────────────────────────────────────────

  const progress = Math.min(exchanges.length / 10, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxWidth: 680 }}>
      {/* Interview header */}
      <div style={{
        padding: "16px 20px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(255,255,255,0.25)" }}>
          {domain ? DOMAIN_LABELS[domain] : "Interview"}
        </span>

        {/* Progress bar */}
        <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", maxWidth: 160 }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "rgba(255,255,255,0.35)", borderRadius: 2, transition: "width 400ms ease" }} />
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
          {exchanges.length} answered
        </span>

        {/* Voice toggle */}
        <button
          onClick={() => { setVoiceEnabled(v => !v); if (voiceEnabled) stopSpeaking(); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 8, cursor: "pointer", border: "none",
            background: voiceEnabled ? "rgba(255,255,255,0.08)" : "transparent",
            color: voiceEnabled ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.25)",
          }}
        >
          <ISpeaker off={!voiceEnabled} />
        </button>

        {/* Finish early */}
        {exchanges.length >= 3 && (
          <button
            onClick={handleFinish}
            disabled={saving}
            style={{
              padding: "5px 12px", borderRadius: 8, fontFamily: "inherit", cursor: "pointer",
              fontSize: 11, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {saving ? "Saving…" : "Finish"}
          </button>
        )}
      </div>

      {/* Exchanges scroll */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}
      >
        {exchanges.map((ex, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* AI question (past) */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.40)",
              }}>AI</div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: 0, paddingTop: 2 }}>
                {ex.question}
              </p>
            </div>
            {/* User answer (past) */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingLeft: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.60)",
              }}>
                {cloneName[0]?.toUpperCase()}
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: 0, paddingTop: 2 }}>
                {ex.answer}
              </p>
            </div>
          </div>
        ))}

        {/* Current question */}
        {currentQuestion && !loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.40)",
            }}>AI</div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.82)", lineHeight: 1.65, margin: 0, paddingTop: 2 }}>
              {currentQuestion}
            </p>
          </div>
        )}

        {/* Thinking indicator */}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.40)",
            }}>AI</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "rgba(255,255,255,0.25)",
                  animation: "pulse 1.2s ease-in-out infinite",
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Answer composer */}
      <div style={{
        padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
      }}>
        {/* Listening indicator */}
        {listening && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.40)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(248,113,113,0.70)", animation: "pulse 1s ease-in-out infinite" }} />
            Listening…
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={loading ? "…" : "Your answer — or tap the mic to speak"}
            disabled={loading}
            rows={2}
            style={{
              flex: 1, resize: "none", fontFamily: "inherit", fontSize: 14,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: "10px 14px",
              color: "rgba(255,255,255,0.82)", outline: "none", lineHeight: 1.55,
            }}
          />

          {/* Mic button */}
          <button
            onClick={handleMicToggle}
            title={listening ? "Stop recording" : "Speak your answer"}
            style={{
              width: 38, height: 38, borderRadius: 10, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${listening ? "rgba(248,113,113,0.40)" : "rgba(255,255,255,0.10)"}`,
              background: listening ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.05)",
              color: listening ? "rgba(248,113,113,0.80)" : "rgba(255,255,255,0.45)",
              flexShrink: 0,
            }}
          >
            {listening ? <IStop /> : <IMic />}
          </button>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!currentAnswer.trim() || loading}
            style={{
              width: 38, height: 38, borderRadius: 10, cursor: currentAnswer.trim() && !loading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.12)",
              background: currentAnswer.trim() && !loading ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
              color: currentAnswer.trim() && !loading ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.20)",
              flexShrink: 0, transition: "all 140ms",
            }}
          >
            <IArrow />
          </button>
        </div>

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", margin: 0 }}>
          ⌘↵ to submit · {exchanges.length >= 3 ? "click Finish when done" : `${3 - exchanges.length} more to unlock Finish`}
        </p>
      </div>
    </div>
  );
}
