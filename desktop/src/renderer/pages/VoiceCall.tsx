import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    voiceCallAPI?: {
      close: () => void;
      getSettings: () => Promise<any>;
      getCallData: () => Promise<{ cloneName: string; cloneHandle: string; cloneColor: string; message: string } | null>;
    };
  }
}

type CallState = "ringing" | "speaking" | "ended";

export function VoiceCall() {
  const [state,      setState]     = useState<CallState>("ringing");
  const [cloneName,  setCloneName] = useState("Your Clone");
  const [cloneColor, setCloneColor] = useState("#7C3AED");
  const [message,    setMessage]   = useState("");
  const [transcript, setTranscript] = useState("");
  const [error,      setError]     = useState<string | null>(null);

  useEffect(() => {
    // getCallData may not be available immediately — retry a few times
    let attempts = 0;
    const tryFetch = async () => {
      attempts++;
      try {
        const data = await window.voiceCallAPI?.getCallData();
        if (data) {
          setCloneName(data.cloneName ?? "Your Clone");
          if (data.cloneColor) setCloneColor(data.cloneColor);
          setMessage(data.message ?? "");
          return;
        }
      } catch { /* retry */ }
      if (attempts < 8) setTimeout(tryFetch, 300);
    };
    tryFetch();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { speechSynthesis.cancel(); window.voiceCallAPI?.close(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function answer() {
    if (!message || state !== "ringing") return;
    setState("speaking");

    const words = message.split(" ");
    let spoken = 0;
    const wordRate = Math.max(60, (message.length / words.length) * 80);

    const interval = setInterval(() => {
      spoken++;
      setTranscript(words.slice(0, spoken).join(" "));
      if (spoken >= words.length) clearInterval(interval);
    }, wordRate);

    const utter       = new SpeechSynthesisUtterance(message);
    utter.rate        = 0.92;
    utter.pitch       = 1.0;
    utter.volume      = 1.0;
    utter.onend       = () => {
      clearInterval(interval);
      setTranscript(message);
      setState("ended");
      setTimeout(() => window.voiceCallAPI?.close(), 2800);
    };
    utter.onerror     = () => {
      clearInterval(interval);
      setError("Speech unavailable. Read the message below.");
      setTranscript(message);
      setState("ended");
    };

    // Small delay so UI updates first
    setTimeout(() => {
      try {
        speechSynthesis.speak(utter);
      } catch {
        clearInterval(interval);
        setTranscript(message);
        setState("ended");
      }
    }, 100);
  }

  function decline() {
    speechSynthesis.cancel();
    window.voiceCallAPI?.close();
  }

  const avatarLetter = cloneName[0]?.toUpperCase() ?? "?";

  return (
    <div style={{
      width: 320, height: 400, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "space-between",
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      background: "rgba(10,10,10,0.97)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 24, overflow: "hidden",
      boxShadow: "0 24px 64px rgba(0,0,0,0.72)",
      padding: "36px 20px 28px",
      WebkitAppRegion: "drag",
    } as React.CSSProperties}>
      <style>{`
        @keyframes ring-pulse {
          0%   { box-shadow: 0 0 0 0 ${cloneColor}55; }
          70%  { box-shadow: 0 0 0 20px ${cloneColor}00; }
          100% { box-shadow: 0 0 0 0 ${cloneColor}00; }
        }
        @keyframes ring-scale {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.06); }
        }
        @keyframes wave-bar {
          0%, 100% { transform: scaleY(0.35); }
          50%       { transform: scaleY(1); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Avatar + name */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: cloneColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, fontWeight: 600, color: "#fff",
          animation: state === "ringing" ? "ring-pulse 1.4s ease-out infinite, ring-scale 1.4s ease-in-out infinite" : "none",
          transition: "animation 0.3s",
        }}>
          {avatarLetter}
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.90)", letterSpacing: "-0.01em" }}>{cloneName}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.32)" }}>
            {state === "ringing" ? "is calling you" : state === "speaking" ? "speaking…" : "call ended"}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "12px 0", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {state === "speaking" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, animation: "fade-up 200ms ease both", width: "100%" }}>
            {/* Wave animation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 28 }}>
              {[0,1,2,3,4,5,6].map(i => (
                <div key={i} style={{
                  width: 3, height: 28, borderRadius: 2, background: cloneColor,
                  transformOrigin: "bottom",
                  animation: `wave-bar 0.7s ease-in-out ${i * 0.1}s infinite`,
                }} />
              ))}
            </div>
            {/* Rolling transcript */}
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", lineHeight: 1.6, textAlign: "center", padding: "0 4px", maxHeight: 80, overflow: "hidden" }}>
              {transcript}
            </p>
          </div>
        )}
        {state === "ended" && (
          <div style={{ animation: "fade-up 200ms ease both", textAlign: "center", padding: "0 4px" }}>
            {error && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.60)", marginBottom: 8 }}>{error}</p>}
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{message}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 20, alignItems: "center", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Decline / End call */}
        {(state === "ringing" || state === "speaking") && (
          <button onClick={decline} style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.28)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 130ms" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.32)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}>
            {/* Hang-up icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M18.36 5.64L5.64 18.36M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="rgba(239,68,68,0.85)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        {/* Answer */}
        {state === "ringing" && (
          <button onClick={answer} style={{ width: 56, height: 56, borderRadius: "50%", background: `${cloneColor}28`, border: `1px solid ${cloneColor}45`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 130ms" }}
            onMouseEnter={e => { e.currentTarget.style.background = `${cloneColor}45`; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${cloneColor}28`; }}>
            {/* Phone icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill={`${cloneColor}CC`}>
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.61 21 3 13.39 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.02l-2.21 2.2z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
