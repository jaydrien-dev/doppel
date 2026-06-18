"use client";

import React, { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useClones } from "@/lib/hooks/useClones";
import type { CloneOwnerInfo } from "@/lib/types";

// ─── Internal Clone type (simplified from CloneOwnerInfo) ─────────────────────

interface Clone {
  id: string;
  handle: string;
  name: string;
  avatar_url?: string;
}

function toClone(c: CloneOwnerInfo): Clone {
  return {
    id: c.clone_id,
    handle: c.handle,
    name: c.listing_title ?? c.display_name ?? c.handle,
    avatar_url: c.avatar_url ?? undefined,
  };
}

// ─── Synthesis turn ───────────────────────────────────────────────────────────

interface SynthTurn {
  id: string;
  cloneId: string;
  cloneName: string;
  color: string;
  text: string;
  posIdx: number;
  isConclusion: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = [
  "#7C3AED", "#2563EB", "#0891B2", "#059669",
  "#D97706", "#BE185D", "#0E7490", "#DC2626",
];
function cloneColor(idx: number): string { return PALETTE[idx % PALETTE.length]; }
function uuid(): string { return crypto.randomUUID(); }

const MAX_ROUNDS             = 8;
const MIN_TURNS_FOR_CONCLUDE = 5;

// ─── Prompt Engineering ───────────────────────────────────────────────────────

function buildTurnPrompt(
  clone: Clone,
  allClones: Clone[],
  topic: string,
  turns: SynthTurn[],
): string {
  const others       = allClones.filter(c => c.id !== clone.id);
  const othersStr    = others.length === 1
    ? others[0].name
    : others.map(c => c.name).slice(0, -1).join(", ") + " and " + others[others.length - 1].name;
  const lastTurn     = turns.length > 0 ? turns[turns.length - 1] : null;
  const isOpening    = turns.length === 0;
  const canConclude  = turns.length >= MIN_TURNS_FOR_CONCLUDE;

  const history = turns
    .map(t => `${t.cloneName}: ${t.text.replace(/\[CONCLUDED:[^\]]*\]/gi, "").trim()}`)
    .join("\n\n");

  if (isOpening) {
    return (
      `You are opening a multi-expert synthesis discussion.\n` +
      `The other participants are: ${othersStr}.\n` +
      `Topic: "${topic}"\n\n` +
      `State your position on this topic clearly and specifically.\n` +
      `Lead with your strongest point — the thing only you would say given your background and values.\n` +
      `Do not summarise the topic or ask questions back. Just stake your view.\n` +
      `2–4 sentences. Be direct.`
    );
  }

  let prompt =
    `You are in a multi-expert synthesis discussion.\n` +
    `Participants: you (${clone.name}), ${othersStr}.\n` +
    `Topic: "${topic}"\n\n` +
    `Discussion so far:\n${history}\n\n` +
    `Your turn.\n\n`;

  if (lastTurn) {
    prompt +=
      `Respond directly to ${lastTurn.cloneName}'s last message.\n` +
      `Don't restate what they said. Engage with the substance — challenge it, sharpen it, or add a dimension they missed.\n` +
      `If they made an error or overlooked something important, call it out precisely.\n` +
      `If you agree on something, say so briefly and push the question further.\n`;
  }

  prompt +=
    `\nSpeak in your own voice, applying your actual reasoning frameworks and values to this specific question.\n` +
    `2–4 sentences. Dense thinking — not padding, not filler phrases.\n` +
    `No "That's a great point." No "Building on what was said." Just respond.\n`;

  if (canConclude) {
    prompt +=
      `\nIf the group has genuinely reached a conclusion — a real insight or resolution — ` +
      `end your message with:\n` +
      `[CONCLUDED: one sentence capturing what this discussion established]\n` +
      `Only add CONCLUDED if it's actually warranted. Don't use it to end the discussion prematurely.`;
  }

  return prompt;
}

// ─── Particle background ──────────────────────────────────────────────────────

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left:  `${5 + (i * 17 + 7) % 90}%`,
  top:   `${10 + (i * 23 + 3) % 80}%`,
  size:  1.5 + (i % 3) * 1,
  dur:   4 + (i % 5) * 1.4,
  delay: (i * 0.37) % 4,
  dx:    ((i % 5) - 2) * 6,
  dy:    -12 - (i % 4) * 7,
}));

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SynthesisPage() {
  const { user, isLoaded } = useUser();
  const { clones: rawClones, isLoading: clonesLoading } = useClones();

  const [phase,      setPhase]      = useState<"setup" | "running" | "done">("setup");
  const [allClones,  setAllClones]  = useState<Clone[]>([]);
  const [selected,   setSelected]   = useState<Clone[]>([]);
  const [topic,      setTopic]      = useState("");
  const [turns,      setTurns]      = useState<SynthTurn[]>([]);
  const [streaming,  setStreaming]  = useState<{ cloneId: string; cloneName: string; color: string; text: string; posIdx: number } | null>(null);
  const [activeIdx,  setActiveIdx]  = useState<number>(-1);
  const [conclusion, setConclusion] = useState("");
  const [sessionId]                  = useState(uuid);

  const stopRef   = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnsRef  = useRef<SynthTurn[]>([]);

  useEffect(() => { turnsRef.current = turns; }, [turns]);

  // Auto-scroll feed
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, streaming]);

  // Populate clones from hook
  useEffect(() => {
    if (clonesLoading || !rawClones.length) return;
    const list = rawClones.map(toClone);
    setAllClones(list);
    if (list.length >= 2) setSelected([list[0], list[1]]);
    else if (list.length === 1) setSelected([list[0]]);
  }, [rawClones, clonesLoading]);

  const loading = !isLoaded || clonesLoading;

  function toggleClone(c: Clone) {
    setSelected(prev => {
      if (prev.find(x => x.id === c.id)) return prev.filter(x => x.id !== c.id);
      if (prev.length >= 5) return prev;
      return [...prev, c];
    });
  }

  // Stream one clone's turn — returns raw response text
  async function streamOneTurn(clone: Clone, message: string, posIdx: number, color: string): Promise<string> {
    setActiveIdx(posIdx);
    setStreaming({ cloneId: clone.id, cloneName: clone.name, color, text: "", posIdx });

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stream:        true,
        clone_id:      clone.id,
        session_id:    sessionId + "_" + clone.id,
        message,
        context_type:  "chat",
        response_mode: "fast",
        owner_mode:    true,
      }),
    });

    if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", acc = "";

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (stopRef.current) { reader.cancel(); break outer; }
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.event === "token") {
            acc += evt.text as string;
            setStreaming(s => s ? { ...s, text: acc } : s);
          } else if (evt.event === "done") {
            acc = (evt.corrected_response as string) ?? acc;
            setStreaming(s => s ? { ...s, text: acc } : s);
          }
        } catch { continue; }
      }
    }

    const match       = acc.match(/\[CONCLUDED:\s*([^\]]+)\]/i);
    const isConc      = !!match;
    const displayText = acc.replace(/\[CONCLUDED:[^\]]*\]/gi, "").trim();
    const concText    = match ? match[1].trim() : "";

    setStreaming(null);
    const turn: SynthTurn = {
      id: uuid(), cloneId: clone.id, cloneName: clone.name,
      color, text: displayText, posIdx, isConclusion: isConc,
    };
    setTurns(prev => [...prev, turn]);

    if (isConc) setConclusion(concText);
    return isConc ? `\0CONCLUDED\0${concText}` : displayText;
  }

  // Main synthesis loop
  async function startSynthesis() {
    if (selected.length < 2 || !topic.trim()) return;
    stopRef.current = false;
    setPhase("running");
    setTurns([]);
    setStreaming(null);
    setConclusion("");
    setActiveIdx(-1);

    const colors = selected.map((_, i) => cloneColor(i));
    let cloneIdx  = 0;
    let totalTurns = 0;

    try {
      while (!stopRef.current) {
        const clone  = selected[cloneIdx];
        const color  = colors[cloneIdx];
        const prompt = buildTurnPrompt(clone, selected, topic, turnsRef.current);
        const result = await streamOneTurn(clone, prompt, cloneIdx, color);

        totalTurns++;

        if (result.startsWith("\0CONCLUDED\0") || stopRef.current) break;

        const roundsDone = Math.floor(totalTurns / selected.length);
        if (roundsDone >= MAX_ROUNDS) break;

        cloneIdx = (cloneIdx + 1) % selected.length;
        await new Promise<void>(r => setTimeout(r, 500));
      }
    } catch (e) {
      console.error("[synthesis]", e);
    }

    setActiveIdx(-1);
    setPhase("done");
  }

  function reset() {
    stopRef.current = true;
    setPhase("setup");
    setTurns([]);
    setStreaming(null);
    setConclusion("");
    setActiveIdx(-1);
  }

  const canStart    = selected.length >= 2 && !!topic.trim() && phase === "setup";
  const isRunning   = phase === "running";
  const ambientColor = activeIdx >= 0 && selected[activeIdx] ? cloneColor(activeIdx) : "#ffffff";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
      background: "#080808", color: "rgba(255,255,255,0.82)",
      position: "relative",
    }}>
      {/* CSS animations */}
      <style>{`
        @keyframes synth-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes synth-msg-in {
          from { opacity: 0; transform: perspective(600px) rotateX(-10deg) translateY(14px); }
          to   { opacity: 1; transform: perspective(600px) rotateX(0deg)  translateY(0); }
        }
        @keyframes synth-orbit {
          0%   { transform: rotate(0deg)   translateX(30px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(30px) rotate(-360deg); }
        }
        @keyframes synth-particle-drift {
          0%,100% { opacity: 0.25; transform: translate(0,0); }
          50%     { opacity: 0.55; transform: var(--synth-drift); }
        }
        @keyframes synth-spin { to { transform: rotate(360deg); } }
        @keyframes synth-blink { 0%,100%{opacity:1;} 50%{opacity:0.15;} }
        @keyframes synth-conclusion-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .synth-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.07) transparent; }
        .synth-scroll::-webkit-scrollbar { width: 3px; }
        .synth-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius:2px; }
      `}</style>

      {/* Ambient background */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(ellipse 70% 55% at 50% 0%, ${ambientColor}18 0%, transparent 65%)`,
        transition: "background 700ms ease",
      }} />

      {/* Particle field */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        {PARTICLES.map(p => (
          <div key={p.id} style={{
            position: "absolute",
            left: p.left, top: p.top,
            width: p.size, height: p.size,
            borderRadius: "50%",
            background: isRunning ? ambientColor : "rgba(255,255,255,0.4)",
            animation: `synth-particle-drift ${p.dur}s ${p.delay}s ease-in-out infinite`,
            // @ts-ignore
            "--synth-drift": `translateX(${p.dx}px) translateY(${p.dy}px)`,
            transition: "background 700ms",
          } as React.CSSProperties} />
        ))}
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          height: 46, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
              Synthesis
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              multi-clone discussion
            </span>
            {isRunning && (
              <span style={{
                fontSize: 9, color: "rgba(52,211,153,0.65)", background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.18)", borderRadius: 4, padding: "2px 7px",
                letterSpacing: "0.06em", textTransform: "uppercase",
                animation: "synth-blink 1.6s ease-in-out infinite",
              }}>Live</span>
            )}
          </div>
          {(phase !== "setup") && (
            <button
              onClick={reset}
              style={{
                fontSize: 11, color: "rgba(255,255,255,0.30)", background: "none",
                border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7,
                padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.60)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.30)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
            >
              {isRunning ? "Stop" : "New"}
            </button>
          )}
        </div>

        {/* Setup panel */}
        {phase === "setup" && (
          <SetupPanel
            allClones={allClones}
            selected={selected}
            topic={topic}
            loading={loading}
            canStart={canStart}
            onToggle={toggleClone}
            onTopicChange={setTopic}
            onStart={startSynthesis}
          />
        )}

        {/* Running / done */}
        {phase !== "setup" && (
          <>
            <CloneStage selected={selected} activeIdx={activeIdx} />

            <div
              ref={scrollRef}
              className="synth-scroll"
              style={{ flex: 1, overflowY: "auto", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}
            >
              {turns.map((t) => (
                <MessageBubble key={t.id} turn={t} isRight={t.posIdx % 2 !== 0} />
              ))}

              {streaming && (
                <StreamingBubble
                  text={streaming.text}
                  cloneName={streaming.cloneName}
                  color={streaming.color}
                  isRight={streaming.posIdx % 2 !== 0}
                />
              )}

              {phase === "done" && !conclusion && turns.length > 0 && !streaming && (
                <div style={{
                  textAlign: "center", padding: "16px 0 8px",
                  fontSize: 11, color: "rgba(255,255,255,0.22)", letterSpacing: "0.06em",
                }}>
                  — discussion complete —
                </div>
              )}

              {phase === "done" && conclusion && (
                <ConclusionCard conclusion={conclusion} />
              )}
            </div>

            {phase === "done" && (
              <div style={{
                padding: "12px 18px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
                display: "flex", gap: 8,
              }}>
                <button
                  onClick={reset}
                  style={{
                    flex: 1, padding: "9px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                >
                  New synthesis →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Setup Panel ──────────────────────────────────────────────────────────────

function SetupPanel({
  allClones, selected, topic, loading, canStart,
  onToggle, onTopicChange, onStart,
}: {
  allClones: Clone[]; selected: Clone[]; topic: string; loading: boolean; canStart: boolean;
  onToggle: (c: Clone) => void; onTopicChange: (t: string) => void; onStart: () => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px" }} className="synth-scroll">
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.22)", marginBottom: 16 }}>
        Select clones
      </p>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.40)", animation: "synth-spin 0.8s linear infinite" }} />
        </div>
      )}

      {!loading && allClones.length === 0 && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textAlign: "center", marginBottom: 20 }}>
          Create at least two clones to use synthesis.
        </p>
      )}

      {!loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {allClones.map((c) => {
            const isSel  = !!selected.find(x => x.id === c.id);
            const selIdx = selected.findIndex(x => x.id === c.id);
            const col    = isSel ? cloneColor(selIdx) : "rgba(255,255,255,0.35)";
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 7px 8px",
                  borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  border: `1.5px solid ${isSel ? col + "55" : "rgba(255,255,255,0.09)"}`,
                  background: isSel ? col + "18" : "rgba(255,255,255,0.03)",
                  color: isSel ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.50)",
                  transition: "all 150ms",
                }}
                onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; } }}
                onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; } }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: isSel ? col : "rgba(255,255,255,0.10)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600, color: "#fff", overflow: "hidden",
                }}>
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : c.name[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: 12, fontWeight: isSel ? 500 : 400 }}>{c.name}</span>
                {isSel && (
                  <span style={{ fontSize: 9, color: col, fontWeight: 600, marginLeft: 2 }}>#{selIdx + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 20, lineHeight: 1.6 }}>
          {selected.length < 2
            ? "Select at least one more clone to start."
            : `${selected.map(c => c.name).join(" · ")} — in turn, responding to each other.`}
        </p>
      )}

      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.22)", marginBottom: 10 }}>
        Topic or question
      </p>
      <textarea
        value={topic}
        onChange={e => onTopicChange(e.target.value)}
        placeholder='e.g. "What is the single most important thing a first-time founder gets wrong?"'
        rows={3}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 12, padding: "11px 13px", fontSize: 13, color: "rgba(255,255,255,0.85)",
          fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.6,
          marginBottom: 14, transition: "border-color 150ms",
        }}
        onFocus={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
        onBlur={e   => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canStart) onStart(); }}
      />

      <button
        onClick={onStart}
        disabled={!canStart}
        style={{
          width: "100%", padding: "11px", borderRadius: 11,
          border: `1px solid ${canStart ? "rgba(167,139,250,0.30)" : "rgba(255,255,255,0.07)"}`,
          background: canStart ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.03)",
          color: canStart ? "rgba(167,139,250,0.90)" : "rgba(255,255,255,0.20)",
          fontSize: 13, fontWeight: 500, cursor: canStart ? "pointer" : "not-allowed",
          fontFamily: "inherit", transition: "all 150ms",
        }}
        onMouseEnter={e => { if (canStart) { e.currentTarget.style.background = "rgba(167,139,250,0.18)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.45)"; } }}
        onMouseLeave={e => { if (canStart) { e.currentTarget.style.background = "rgba(167,139,250,0.12)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.30)"; } }}
      >
        Start synthesis →
      </button>

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", textAlign: "center", marginTop: 10 }}>
        Clones discuss until they reach a conclusion. You see everything.
      </p>
    </div>
  );
}

// ─── 3D Clone Stage ───────────────────────────────────────────────────────────

function CloneStage({ selected, activeIdx }: { selected: Clone[]; activeIdx: number }) {
  return (
    <div style={{
      flexShrink: 0, padding: "16px 18px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      perspective: "900px", perspectiveOrigin: "50% 200%",
    }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, alignItems: "flex-end" }}>
        {selected.map((c, i) => {
          const isActive = i === activeIdx;
          const col      = cloneColor(i);
          return (
            <div
              key={c.id}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                transform: isActive
                  ? "perspective(900px) rotateX(0deg) translateZ(22px) translateY(-6px) scale(1.05)"
                  : "perspective(900px) rotateX(5deg) translateZ(-12px) translateY(4px) scale(0.88)",
                opacity: isActive ? 1 : activeIdx >= 0 ? 0.40 : 0.75,
                transition: "transform 400ms cubic-bezier(.4,0,.2,1), opacity 400ms",
                position: "relative",
              }}
            >
              {isActive && (
                <>
                  <div style={{
                    position: "absolute", top: -4, left: -4, right: -4, bottom: -4,
                    borderRadius: "50%", border: `2px solid ${col}`,
                    animation: "synth-pulse-ring 1.8s ease-out infinite",
                    pointerEvents: "none",
                  }} />
                  <div style={{
                    position: "absolute", top: -4, left: -4, right: -4, bottom: -4,
                    borderRadius: "50%", border: `2px solid ${col}`,
                    animation: "synth-pulse-ring 1.8s 0.6s ease-out infinite",
                    pointerEvents: "none",
                  }} />
                </>
              )}

              {isActive && (
                <div style={{
                  position: "absolute", top: "50%", left: "50%", width: 0, height: 0,
                  zIndex: 2, pointerEvents: "none",
                }}>
                  <div style={{
                    position: "absolute", width: 5, height: 5, borderRadius: "50%",
                    background: col, marginLeft: -2.5, marginTop: -2.5,
                    boxShadow: `0 0 6px ${col}`,
                    animation: "synth-orbit 2.2s linear infinite",
                  }} />
                </div>
              )}

              <div style={{
                width: 44, height: 44, borderRadius: "50%", overflow: "hidden",
                background: isActive ? col : col + "60",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 600, color: "#fff",
                boxShadow: isActive
                  ? `0 0 0 2px ${col}60, 0 6px 28px ${col}40, 0 0 0 6px ${col}15`
                  : `0 0 0 1.5px ${col}30`,
                transition: "box-shadow 400ms",
                position: "relative", zIndex: 1,
              }}>
                {c.avatar_url
                  ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : c.name[0]?.toUpperCase()}
              </div>

              <span style={{
                fontSize: 10, fontWeight: isActive ? 500 : 400,
                color: isActive ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.30)",
                whiteSpace: "nowrap", maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis",
                transition: "color 400ms",
              }}>
                {c.name.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ turn, isRight }: { turn: SynthTurn; isRight: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: isRight ? "row-reverse" : "row",
      gap: 9, animation: "synth-msg-in 260ms cubic-bezier(.4,0,.2,1) both",
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        background: turn.color, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff",
        marginTop: 2, boxShadow: `0 0 0 2px ${turn.color}30`,
      }}>
        {turn.cloneName[0]?.toUpperCase()}
      </div>

      <div style={{
        maxWidth: "78%", display: "flex", flexDirection: "column",
        gap: 3, alignItems: isRight ? "flex-end" : "flex-start",
      }}>
        <span style={{
          fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em",
          padding: isRight ? "0 2px 0 0" : "0 0 0 2px",
        }}>
          {turn.cloneName}
        </span>
        <div style={{
          background: isRight ? `${turn.color}16` : "rgba(255,255,255,0.05)",
          border: `1px solid ${isRight ? turn.color + "28" : "rgba(255,255,255,0.09)"}`,
          borderRadius: isRight ? "12px 3px 12px 12px" : "3px 12px 12px 12px",
          padding: "9px 12px", fontSize: 13, color: "rgba(255,255,255,0.85)",
          lineHeight: 1.58,
        }}>
          {turn.text}
        </div>
      </div>
    </div>
  );
}

// ─── Streaming Bubble ─────────────────────────────────────────────────────────

function StreamingBubble({ text, cloneName, color, isRight }: {
  text: string; cloneName: string; color: string; isRight: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: isRight ? "row-reverse" : "row", gap: 9 }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        background: color, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff",
        marginTop: 2, boxShadow: `0 0 0 2px ${color}30`,
      }}>
        {cloneName[0]?.toUpperCase()}
      </div>
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 3, alignItems: isRight ? "flex-end" : "flex-start" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", padding: isRight ? "0 2px 0 0" : "0 0 0 2px", letterSpacing: "0.04em" }}>
          {cloneName} <span style={{ animation: "synth-blink 0.9s ease-in-out infinite" }}>●</span>
        </span>
        <div style={{
          background: isRight ? `${color}16` : "rgba(255,255,255,0.05)",
          border: `1px solid ${isRight ? color + "28" : "rgba(255,255,255,0.09)"}`,
          borderRadius: isRight ? "12px 3px 12px 12px" : "3px 12px 12px 12px",
          padding: "9px 12px", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.58,
          minWidth: 48,
        }}>
          {text
            ? <>{text}<span style={{ display: "inline-block", width: 2, height: 13, background: "rgba(255,255,255,0.50)", marginLeft: 2, verticalAlign: "middle", animation: "synth-blink 0.65s ease-in-out infinite" }} /></>
            : <span style={{ display: "flex", gap: 3 }}>{[0,1,2].map(i => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.35)", display: "inline-block", animation: `synth-blink 1.1s ease-in-out ${i * 0.18}s infinite` }} />
              ))}</span>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Conclusion Card ──────────────────────────────────────────────────────────

function ConclusionCard({ conclusion }: { conclusion: string }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14, marginTop: 8,
      background: "rgba(52,211,153,0.06)",
      border: "1px solid rgba(52,211,153,0.20)",
      animation: "synth-conclusion-in 350ms cubic-bezier(.4,0,.2,1) both",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(52,211,153,0.55)" }}>
        Conclusion reached
      </p>
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 1.6 }}>
        {conclusion}
      </p>
    </div>
  );
}
