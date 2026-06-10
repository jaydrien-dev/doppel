import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    debateAPI?: {
      close: () => void;
      getSettings: () => Promise<any>;
    };
  }
}

interface Clone { id: string; handle: string; name: string; }
interface Turn  { cloneName: string; text: string; round: number; side: "A" | "B"; }

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function uuid() { return crypto.randomUUID(); }

export function Debate() {
  const [clones,        setClones]        = useState<Clone[]>([]);
  const [cloneA,        setCloneA]        = useState<Clone | null>(null);
  const [cloneB,        setCloneB]        = useState<Clone | null>(null);
  const [topic,         setTopic]         = useState("");
  const [rounds,        setRounds]        = useState(3);
  const [turns,         setTurns]         = useState<Turn[]>([]);
  const [streaming,     setStreaming]     = useState<{ text: string; side: "A" | "B" } | null>(null);
  const [isRunning,     setIsRunning]     = useState(false);
  const [isComplete,    setIsComplete]    = useState(false);
  const [synthesis,     setSynthesis]     = useState("");
  const [synthesizing,  setSynthesizing]  = useState(false);
  const [apiUrl,        setApiUrl]        = useState("https://doppel.up.railway.app");
  const [userId,        setUserId]        = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.debateAPI?.getSettings().then(async (s: any) => {
      const url = s?.fastapiUrl ?? "https://doppel.up.railway.app";
      const uid = s?.userId ?? "";
      setApiUrl(url);
      setUserId(uid);
      if (!uid) return;
      try {
        const res = await fetch(`${url}/clones/mine`, { headers: { "X-User-Id": uid } });
        if (res.ok) {
          const data = await res.json();
          const list: Clone[] = (data.clones ?? data).map((c: any) => ({
            id: c.clone_id, handle: c.handle,
            name: c.listing_title ?? c.display_name ?? c.handle,
          }));
          setClones(list);
          if (list.length >= 2) { setCloneA(list[0]); setCloneB(list[1]); }
          else if (list.length === 1) setCloneA(list[0]);
        }
      } catch { /* non-fatal */ }
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, streaming]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") window.debateAPI?.close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function streamTurn(clone: Clone, message: string, side: "A" | "B", round: number): Promise<string> {
    setStreaming({ text: "", side });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userId) headers["X-User-Id"] = userId;

    const res = await fetch(`${apiUrl}/brain/chat/stream`, {
      method: "POST", headers,
      body: JSON.stringify({ clone_id: clone.id, session_id: uuid(), message, context_type: "chat", response_mode: "fast", owner_mode: false }),
    });
    if (!res.ok || !res.body) throw new Error(`${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", acc = "";

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
        if (evt.event === "token") {
          acc += evt.text as string;
          setStreaming({ text: acc, side });
        } else if (evt.event === "done") {
          acc = (evt.corrected_response as string | null) ?? acc;
          setStreaming({ text: acc, side });
        }
      }
    }

    setStreaming(null);
    setTurns(prev => [...prev, { cloneName: clone.name, text: acc, round, side }]);
    return acc;
  }

  async function startDebate() {
    if (!cloneA || !cloneB || !topic.trim() || isRunning) return;
    setIsRunning(true);
    setIsComplete(false);
    setTurns([]);
    setSynthesis("");

    try {
      let lastA = "", lastB = "";
      for (let r = 0; r < rounds; r++) {
        const aMsg = r === 0
          ? `You are in a debate with ${cloneB.name} on: "${topic}". Give your opening argument. Be direct and insightful. Max 3 sentences.`
          : `Debate with ${cloneB.name} on: "${topic}". ${cloneB.name} said: "${lastB}". Give your rebuttal. Max 3 sentences.`;
        lastA = await streamTurn(cloneA, aMsg, "A", r + 1);

        const bMsg = r === 0
          ? `You are in a debate with ${cloneA.name} on: "${topic}". They opened with: "${lastA}". Counter-argue. Max 3 sentences.`
          : `Debate with ${cloneA.name} on: "${topic}". They rebutted: "${lastA}". Respond. Max 3 sentences.`;
        lastB = await streamTurn(cloneB, bMsg, "B", r + 1);
      }
      setIsComplete(true);
    } catch (e) {
      console.error("[debate]", e);
    } finally {
      setIsRunning(false);
    }
  }

  async function synthesize() {
    if (!cloneA || !turns.length) return;
    setSynthesizing(true);
    const transcript = turns.map(t => `${t.cloneName}: ${t.text}`).join("\n\n");
    const prompt = `Two AI clones debated: "${topic}". Transcript:\n\n${transcript}\n\nSynthesize in 3 sentences: key agreements, disagreements, and what conclusion emerges.`;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) headers["X-User-Id"] = userId;
      const res = await fetch(`${apiUrl}/brain/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ clone_id: cloneA.id, session_id: uuid(), message: prompt, context_type: "chat", response_mode: "pro", owner_mode: false }),
      });
      if (res.ok) {
        const data = await res.json();
        setSynthesis(data.response ?? data.message ?? "");
      }
    } catch { /* non-fatal */ } finally { setSynthesizing(false); }
  }

  const canStart = !!(cloneA && cloneB && cloneA.id !== cloneB.id && topic.trim() && !isRunning);
  const colA = cloneA ? avatarColor(cloneA.name) : "#555";
  const colB = cloneB ? avatarColor(cloneB.name) : "#555";
  const showFeed = turns.length > 0 || !!streaming || isRunning;

  return (
    <div style={{ width: 520, height: "100vh", display: "flex", flexDirection: "column", fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', background: "rgba(10,10,10,0.97)", color: "rgba(255,255,255,0.82)", overflow: "hidden" }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes live-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .dbt-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.07) transparent; }
        .dbt-scroll::-webkit-scrollbar { width: 3px; }
        .dbt-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, background: "linear-gradient(110deg,#a78bfa,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>doppel</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em" }}>debate</span>
          {isRunning && (
            <span style={{ fontSize: 9, color: "rgba(52,211,153,0.65)", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.06em", animation: "live-dot 1.4s ease-in-out infinite" }}>
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={() => window.debateAPI?.close()}
          style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)", cursor: "pointer", WebkitAppRegion: "no-drag" } as React.CSSProperties}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.color = "rgba(248,113,113,0.75)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Setup panel */}
      {!showFeed && (
        <div style={{ padding: "14px 14px 12px", flexShrink: 0 }}>
          {/* Clone pickers */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ClonePicker label="Clone A" clones={clones} selected={cloneA} onSelect={setCloneA} exclude={cloneB?.id} color={colA} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>vs</span>
            <ClonePicker label="Clone B" clones={clones} selected={cloneB} onSelect={setCloneB} exclude={cloneA?.id} color={colB} />
          </div>

          {/* Topic */}
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder='Topic to debate… e.g. "Is TypeScript worth the overhead?"'
            rows={2}
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "9px 11px", color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "none", boxSizing: "border-box", lineHeight: 1.5 }}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)"}
            onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
          />

          {/* Rounds + start */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>Rounds</span>
            {[2, 3, 5].map(n => (
              <button key={n} onClick={() => setRounds(n)} style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${rounds === n ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`, background: rounds === n ? "rgba(255,255,255,0.08)" : "transparent", color: rounds === n ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 100ms" }}>
                {n}
              </button>
            ))}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", marginLeft: "auto" }}>~{rounds * 2} credits</span>
          </div>

          <button
            onClick={startDebate}
            disabled={!canStart}
            style={{ width: "100%", marginTop: 10, padding: "9px", borderRadius: 10, border: `1px solid ${canStart ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`, background: canStart ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", color: canStart ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.20)", fontSize: 13, fontWeight: 500, cursor: canStart ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 120ms" }}
            onMouseEnter={e => { if (canStart) e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={e => { if (canStart) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          >
            Start Debate →
          </button>

          {clones.length === 0 && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 10 }}>Sign in via main app to load clones.</p>
          )}
        </div>
      )}

      {/* Turns feed */}
      {showFeed && (
        <div ref={scrollRef} className="dbt-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {turns.map((t, i) => (
            <TurnBubble key={i} turn={t} colA={colA} colB={colB} />
          ))}
          {streaming && (
            <StreamingBubble
              text={streaming.text} side={streaming.side}
              colA={colA} colB={colB} cloneA={cloneA} cloneB={cloneB}
            />
          )}
        </div>
      )}

      {/* Bottom: synthesis + restart */}
      {isComplete && (
        <div style={{ padding: "10px 14px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          {!synthesis && !synthesizing && (
            <button onClick={synthesize} style={{ width: "100%", padding: "8px", borderRadius: 10, border: "1px solid rgba(167,139,250,0.20)", background: "rgba(167,139,250,0.06)", color: "rgba(167,139,250,0.72)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 120ms", marginBottom: 8 }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(167,139,250,0.10)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(167,139,250,0.06)"; }}>
              Synthesize →
            </button>
          )}
          {synthesizing && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0 10px" }}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.10)", borderTopColor: "rgba(255,255,255,0.45)", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>Synthesizing…</span>
            </div>
          )}
          {synthesis && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.6, padding: "10px 12px", background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 10, marginBottom: 8, animation: "fade-in 250ms ease both" }}>
              <p style={{ margin: "0 0 5px", fontSize: 9, color: "rgba(167,139,250,0.50)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Synthesis</p>
              {synthesis}
            </div>
          )}
          <button onClick={() => { setTurns([]); setIsComplete(false); setSynthesis(""); setIsRunning(false); }} style={{ width: "100%", padding: "7px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.28)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}>
            New debate
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Clone Picker ─────────────────────────────────────────────────────────────

function ClonePicker({ label, clones, selected, onSelect, exclude, color }: {
  label: string; clones: Clone[]; selected: Clone | null;
  onSelect: (c: Clone) => void; exclude?: string; color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const available = clones.filter(c => c.id !== exclude);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ flex: 1, position: "relative" }}>
      <p style={{ margin: "0 0 3px", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.22)" }}>{label}</p>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 8, border: `1px solid ${open ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.09)"}`, background: "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit", transition: "all 100ms" }}>
        {selected ? (
          <>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
              {selected.name[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{selected.name}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", flex: 1, textAlign: "left" }}>Pick…</span>
        )}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "rgba(255,255,255,0.25)" }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && available.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 99, background: "rgba(13,13,13,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, maxHeight: 160, overflowY: "auto", backdropFilter: "blur(20px)", boxShadow: "0 10px 36px rgba(0,0,0,0.65)" }}>
          {available.map(c => (
            <button key={c.id} onClick={() => { onSelect(c); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 8px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: avatarColor(c.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
                {c.name[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Turn Bubble ──────────────────────────────────────────────────────────────

function TurnBubble({ turn, colA, colB }: { turn: Turn; colA: string; colB: string }) {
  const col    = turn.side === "A" ? colA : colB;
  const isRight = turn.side === "B";
  return (
    <div style={{ display: "flex", flexDirection: isRight ? "row-reverse" : "row", gap: 8, animation: "fade-in 200ms ease both" }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0, marginTop: 2 }}>
        {turn.cloneName[0]?.toUpperCase()}
      </div>
      <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", gap: 3, alignItems: isRight ? "flex-end" : "flex-start" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", padding: isRight ? "0 2px 0 0" : "0 0 0 2px" }}>{turn.cloneName} · R{turn.round}</span>
        <div style={{ background: isRight ? `${col}18` : "rgba(255,255,255,0.05)", border: `1px solid ${isRight ? `${col}25` : "rgba(255,255,255,0.08)"}`, borderRadius: isRight ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding: "8px 11px", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.55 }}>
          {turn.text}
        </div>
      </div>
    </div>
  );
}

// ─── Streaming Bubble ─────────────────────────────────────────────────────────

function StreamingBubble({ text, side, colA, colB, cloneA, cloneB }: {
  text: string; side: "A" | "B"; colA: string; colB: string; cloneA: Clone | null; cloneB: Clone | null;
}) {
  const col    = side === "A" ? colA : colB;
  const clone  = side === "A" ? cloneA : cloneB;
  const isRight = side === "B";
  return (
    <div style={{ display: "flex", flexDirection: isRight ? "row-reverse" : "row", gap: 8 }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0, marginTop: 2 }}>
        {clone?.name[0]?.toUpperCase() ?? "?"}
      </div>
      <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", gap: 3, alignItems: isRight ? "flex-end" : "flex-start" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", padding: isRight ? "0 2px 0 0" : "0 0 0 2px" }}>{clone?.name} <span style={{ animation: "live-dot 0.9s ease-in-out infinite" }}>●</span></span>
        <div style={{ background: isRight ? `${col}18` : "rgba(255,255,255,0.05)", border: `1px solid ${isRight ? `${col}25` : "rgba(255,255,255,0.08)"}`, borderRadius: isRight ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding: "8px 11px", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.55, minWidth: 50 }}>
          {text
            ? <>{text}<span style={{ display: "inline-block", width: 2, height: 12, background: "rgba(255,255,255,0.45)", marginLeft: 1, animation: "live-dot 0.7s ease-in-out infinite", verticalAlign: "middle" }} /></>
            : <span style={{ display: "flex", gap: 3 }}>{[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.35)", display: "inline-block", animation: `live-dot 1.1s ease-in-out ${i*0.18}s infinite` }} />)}</span>
          }
        </div>
      </div>
    </div>
  );
}
