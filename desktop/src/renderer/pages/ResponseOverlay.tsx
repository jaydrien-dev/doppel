import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    responseAPI?: {
      onText: (cb: (text: string) => void) => () => void;
      onHide: (cb: () => void) => () => void;
    };
  }
}

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function color(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const WORDS_PER_CHUNK = 5;
const CHUNK_MS        = 1400; // ~214 wpm — comfortable reading speed

function toChunks(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK)
    out.push(words.slice(i, i + WORDS_PER_CHUNK).join(" "));
  return out;
}

export default function ResponseOverlay() {
  const params    = new URLSearchParams(window.location.search);
  const cloneName = params.get("name") ?? "Clone";
  const col       = color(cloneName);
  const initial   = cloneName[0]?.toUpperCase() ?? "?";

  const [displayChunk, setDisplayChunk] = useState("");
  const [chunkKey,     setChunkKey]     = useState(0);   // triggers fade-in animation
  const [visible,      setVisible]      = useState(false);

  const allTextRef  = useRef("");
  const chunkIdxRef = useRef(0);
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer   = useRef<ReturnType<typeof setTimeout>  | null>(null);

  function startTicker() {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      const chunks = toChunks(allTextRef.current);
      if (chunkIdxRef.current < chunks.length) {
        setDisplayChunk(chunks[chunkIdxRef.current]);
        setChunkKey(k => k + 1);
        chunkIdxRef.current++;
      }
      // If we've consumed all chunks, pause until more text arrives
    }, CHUNK_MS);
  }

  function stopTicker() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }

  useEffect(() => {
    const offText = window.responseAPI?.onText(t => {
      // If completely new response (text shorter than current), reset
      if (t.length < allTextRef.current.length) {
        stopTicker();
        chunkIdxRef.current = 0;
        setDisplayChunk("");
      }
      allTextRef.current = t;
      setVisible(true);
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }

      // Show first chunk immediately if ticker hasn't started or just reset
      const chunks = toChunks(t);
      if (chunkIdxRef.current === 0 && chunks.length > 0) {
        setDisplayChunk(chunks[0]);
        setChunkKey(k => k + 1);
        chunkIdxRef.current = 1;
      }
      startTicker();
    });

    const offHide = window.responseAPI?.onHide(() => {
      // Drain any remaining chunks, then fade out
      hideTimer.current = setTimeout(() => {
        stopTicker();
        setVisible(false);
        allTextRef.current = "";
        chunkIdxRef.current = 0;
      }, Math.max(CHUNK_MS, 1200));
    });

    return () => { offText?.(); offHide?.(); stopTicker(); };
  }, []);

  if (!visible && !displayChunk) return null;

  return (
    <>
      <style>{`
        @keyframes chunkIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes overlayIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes overlayOut {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes voice-bar {
          from { transform: scaleY(0.2); }
          to   { transform: scaleY(1); }
        }
      `}</style>

      <div style={{
        padding: "0 16px 16px",
        animation: visible ? "overlayIn 220ms ease-out forwards" : "overlayOut 400ms ease-in forwards",
        pointerEvents: "none",
      }}>
        <div style={{
          background:     "rgba(8,8,8,0.93)",
          border:         "1px solid rgba(255,255,255,0.11)",
          borderRadius:   18,
          padding:        "14px 18px 18px",
          boxShadow:      "0 8px 32px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.05)",
          backdropFilter: "blur(24px)",
          minHeight:      72,
          display:        "flex",
          flexDirection:  "column",
          gap:            10,
        }}>
          {/* Clone label + bars */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "#fff", flexShrink: 0, boxShadow: `0 0 8px ${col}60` }}>
              {initial}
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>{cloneName}</span>
            <div style={{ display: "flex", gap: 2, alignItems: "center", height: 10, marginLeft: 2 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 2, height: "100%", borderRadius: 2, background: col, opacity: 0.55, transformOrigin: "bottom", animation: `voice-bar 0.55s ease-in-out ${i*0.09}s infinite alternate` }} />
              ))}
            </div>
          </div>

          {/* Chunked text — animates on each new chunk */}
          <p key={chunkKey} style={{
            margin:       0,
            fontSize:     17,
            fontWeight:   300,
            lineHeight:   1.45,
            color:        "rgba(255,255,255,0.90)",
            letterSpacing: "-0.015em",
            whiteSpace:   "nowrap",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            animation:    "chunkIn 180ms ease-out forwards",
          }}>
            {displayChunk}
          </p>
        </div>
      </div>
    </>
  );
}
