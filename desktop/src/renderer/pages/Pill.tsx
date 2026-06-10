import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCached, setCached } from "../lib/cache";

// Settings are loaded async on mount (from Electron userData/settings.json)
// defaults used until settings arrive

declare global {
  interface Window {
    pillAPI?: {
      resize:             (h: number) => void;
      exit:               () => void;
      openFull:           () => void;
      getSettings:        () => Promise<any>;
      getActiveApp:       () => Promise<{ appName: string; windowTitle: string } | null>;
      onClipboardChange:  (cb: (text: string) => void) => void;
      offClipboardChange: (cb: (text: string) => void) => void;
    };
    pillResponseAPI?:       { show: (text: string) => void; hide: () => void; };
    pillGetScreenSourceId?: () => Promise<string | null>;
  }
}

// ─── Heights ─────────────────────────────────────────────────────────────────

const H = { idle: 68, recording: 68, thinking: 68, speaking: 68, expanded: 470 };

// ─── Color ───────────────────────────────────────────────────────────────────

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function color(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type State = "idle" | "recording" | "thinking" | "speaking";
interface Msg { role: "user" | "clone"; text: string; fromCache?: boolean; }

// ─── Component ───────────────────────────────────────────────────────────────

export default function Pill() {
  const params      = new URLSearchParams(window.location.search);
  const cloneId     = params.get("id")     ?? "";
  const cloneName   = params.get("name")   ?? "Clone";
  const cloneHandle = params.get("handle") ?? "";
  const avatarUrl   = params.get("avatar") ?? "";
  const col         = color(cloneName);
  const initial     = cloneName[0]?.toUpperCase() ?? "?";

  const [pillState,      setPillState]      = useState<State>("idle");
  const [expanded,       setExpanded]       = useState(false);
  const [messages,       setMessages]       = useState<Msg[]>([]);
  const [liveText,       setLiveText]       = useState("");
  const [statusText,     setStatusText]     = useState("watching");
  const [inputText,      setInputText]      = useState("");
  const [clipboardText,  setClipboardText]  = useState<string | null>(null);
  const [clipboardDone,  setClipboardDone]  = useState(false);
  const [activeAppLabel, setActiveAppLabel] = useState<string | null>(null);

  // Persist session ID per clone so working memory survives pill close/reopen (Redis TTL: 4h)
  const sessionId = useRef<string>((() => {
    const key = `doppel_pill_session:${cloneId}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  })());
  const mediaRef      = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const readerRef     = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const messagesEnd   = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const apiRef        = useRef("https://doppel.up.railway.app");
  const openaiKeyRef  = useRef("");
  const userIdRef     = useRef("");

  // ── Load settings ────────────────────────────────────────────────────────

  useEffect(() => {
    window.pillAPI?.getSettings().then((s: any) => {
      if (s?.openaiKey)  openaiKeyRef.current = s.openaiKey;
      if (s?.fastapiUrl) apiRef.current       = s.fastapiUrl;
      if (s?.userId)     userIdRef.current    = s.userId;
      console.log("[pill] settings loaded, key length:", openaiKeyRef.current.length, "user:", userIdRef.current || "(anon)");
    }).catch((e: any) => console.error("[pill] getSettings failed:", e));
  }, []);

  // ── Window sizing ─────────────────────────────────────────────────────────

  useEffect(() => {
    window.pillAPI?.resize(expanded ? H.expanded : H.idle);
  }, [expanded]);

  // ── Scroll ───────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveText]);

  // ── Clipboard detection ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (text: string) => {
      setClipboardText(text);
      setClipboardDone(false);
    };
    window.pillAPI?.onClipboardChange?.(handler);
    return () => window.pillAPI?.offClipboardChange?.(handler);
  }, []);

  // ── Active app polling ────────────────────────────────────────────────────

  useEffect(() => {
    const refresh = async () => {
      const info = await window.pillAPI?.getActiveApp?.();
      if (info?.appName) setActiveAppLabel(info.appName);
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Screen capture helper (called early, in parallel with Whisper) ───────

  async function captureScreen(): Promise<string | null> {
    try {
      if (!window.pillGetScreenSourceId) return null;
      const sourceId = await window.pillGetScreenSourceId();
      if (!sourceId) return null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } } as any,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
      video.play();
      // One rAF is enough to get the first rendered frame
      await new Promise<void>(res => requestAnimationFrame(() => res()));
      // Scale down to max 1280px wide — reduces payload from ~250kb to ~60kb
      const MAX_W = 1280;
      const scale = Math.min(1, MAX_W / (video.videoWidth || 1920));
      const w = Math.round((video.videoWidth  || 1920) * scale);
      const h = Math.round((video.videoHeight || 1080) * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
      stream.getTracks().forEach(t => t.stop());
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      console.log("[pill] capture ok", `${Math.round(dataUrl.length / 1024)}kb`);
      return dataUrl;
    } catch (e) {
      console.error("[pill] capture error:", e);
      return null;
    }
  }

  // ── Record → (Whisper + capture in parallel) → send ──────────────────────

  const startRecording = useCallback(async () => {
    setPillState("recording"); setStatusText("listening…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Fire both in parallel — don't wait for capture before starting Whisper
        const [transcript, dataUrl] = await Promise.all([
          transcribe(blob),
          captureScreen(),
        ]);
        console.log("[pill] transcript:", transcript, "| capture:", dataUrl ? "ok" : "none");
        if (transcript) await sendMessage(transcript, dataUrl);
        else { setPillState("idle"); setStatusText("watching"); }
      };
      mediaRef.current = mr;
      mr.start();
    } catch {
      setPillState("idle"); setStatusText("mic error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
    setPillState("thinking"); setStatusText("thinking…");
  }, []);

  // ── Whisper STT ───────────────────────────────────────────────────────────

  async function transcribe(blob: Blob): Promise<string | null> {
    try {
      const form = new FormData();
      form.append("file", blob, "audio.webm");
      form.append("model", "whisper-1");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method:  "POST",
        headers: { Authorization: `Bearer ${openaiKeyRef.current}` },
        body:    form,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => res.status.toString());
        console.error("[pill] whisper error:", res.status, err);
        setStatusText(`whisper ${res.status}`);
        setTimeout(() => setStatusText("watching"), 2000);
        return null;
      }
      const data = await res.json();
      return (data.text ?? "").trim() || null;
    } catch (e) {
      console.error("[pill] whisper fetch failed:", e);
      setStatusText("no connection");
      setTimeout(() => setStatusText("watching"), 2000);
      return null;
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  // dataUrl comes pre-captured in parallel with Whisper — no extra wait here
  const sendMessage = useCallback(async (text: string, dataUrl: string | null = null) => {
    setMessages(prev => [...prev, { role: "user", text }]);
    setPillState("thinking"); setStatusText("thinking…");
    setLiveText("");

    // ── Cache check ─────────────────────────────────────────────────────────
    const cached = await getCached(cloneHandle, text);
    if (cached) {
      setMessages(prev => [...prev, { role: "clone", text: cached, fromCache: true }]);
      window.pillResponseAPI?.show(cached);
      await speakText(cached);
      return;
    }

    const imageMeta: Record<string, string> = dataUrl
      ? { image_base64: dataUrl.split(",")[1], image_media_type: "image/jpeg" }
      : {};

    try {
      // Always fast — the pill is a reactive overlay, not a deep-reasoning tool.
      // Fast path = 1 LLM call with vision, target <1.5s vs 6-12s on slow path.
      const responseMode = "fast";

      // Build auth headers — prefer Clerk JWT, fall back to userId header
      const authHeaders: Record<string, string> = {};
      try {
        const token = await (window as any).Clerk?.session?.getToken?.();
        if (token) authHeaders["Authorization"] = `Bearer ${token}`;
        else if (userIdRef.current) authHeaders["X-User-Id"] = userIdRef.current;
      } catch {
        if (userIdRef.current) authHeaders["X-User-Id"] = userIdRef.current;
      }

      console.log(`[pill] sending mode=${responseMode} screenshot=${!!dataUrl} user=${userIdRef.current || "anon"}`);
      const res = await fetch(`${apiRef.current}/brain/chat/stream`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          stream:        true,
          clone_id:      cloneId,
          session_id:    sessionId.current,
          message:       text,
          response_mode: responseMode,
          ...(Object.keys(imageMeta).length ? { metadata: imageMeta } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => res.status.toString());
        console.error("[pill] stream error:", res.status, err);
        setPillState("idle"); setStatusText(`error ${res.status}`);
        setTimeout(() => setStatusText("watching"), 3000);
        window.pillResponseAPI?.hide();
        return;
      }

      const reader  = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buf = "", full = "";
      setPillState("speaking"); setStatusText("speaking…");

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;
          try {
            const p = JSON.parse(raw);
            const tok = p.token ?? p.text ?? p.delta ?? "";
            full += tok; setLiveText(full);
            window.pillResponseAPI?.show(full);
          } catch { /* skip */ }
        }
      }

      readerRef.current = null;
      setMessages(prev => [...prev, { role: "clone", text: full }]);
      setLiveText("");
      // Write to cache for next time (skip if vision was used — context changes)
      if (!dataUrl) setCached(cloneHandle, text, full);
      await speakText(full);
    } catch (e) {
      console.error("[pill] sendMessage error:", e);
      setPillState("idle"); setStatusText("fetch error");
      setTimeout(() => setStatusText("watching"), 3000);
      window.pillResponseAPI?.hide();
    }
  }, [cloneId, cloneHandle]);

  // ── TTS ───────────────────────────────────────────────────────────────────

  async function speakText(text: string) {
    try {
      const snippet = text.length > 500 ? text.slice(0, 497) + "…" : text;
      const res = await fetch(`${apiRef.current}/consumer/voice/synthesize`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: snippet, clone_handle: cloneHandle }),
      });
      if (!res.ok) { setPillState("idle"); setStatusText("watching"); window.pillResponseAPI?.hide(); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = new Audio(url);
      audioRef.current = a;
      a.play();
      a.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setPillState("idle"); setStatusText("watching");
        window.pillResponseAPI?.hide();
      };
    } catch { setPillState("idle"); setStatusText("watching"); window.pillResponseAPI?.hide(); }
  }

  function stopAll() {
    audioRef.current?.pause(); audioRef.current = null;
    readerRef.current?.cancel(); readerRef.current = null;
    if (mediaRef.current?.state === "recording") { mediaRef.current.stop(); mediaRef.current = null; }
    setPillState("idle"); setStatusText("watching"); setLiveText("");
  }

  // ── Mic tap ───────────────────────────────────────────────────────────────

  function handleMic() {
    if (pillState === "idle") startRecording();
    else if (pillState === "recording") stopRecording();
    else stopAll();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const radius = expanded ? 20 : 999;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes voice-bar { from { transform: scaleY(0.2); } to { transform: scaleY(1); } }
        @keyframes breathe { 0%,100% { opacity:.5; } 50% { opacity:1; } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius:2px; }
      `}</style>

      <div style={{
        width: 300, height: expanded ? H.expanded : H.idle,
        borderRadius: radius,
        background:  "rgba(10,10,10,0.97)",
        border:      "1px solid rgba(255,255,255,0.12)",
        boxShadow:   "0 16px 48px rgba(0,0,0,0.70), 0 0 0 0.5px rgba(255,255,255,0.05)",
        overflow:    "hidden",
        display:     "flex", flexDirection: "column",
        fontFamily:  '"Plus Jakarta Sans", system-ui, sans-serif',
        WebkitAppRegion: "drag",
      } as React.CSSProperties}>

        {/* ── Compact row (always visible) ── */}
        <div style={{ height: H.idle, minHeight: H.idle, display: "flex", alignItems: "center", gap: 10, padding: "0 10px 0 12px", flexShrink: 0 }}>
          {/* Avatar with status ring */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {pillState === "recording" && (
              <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `2px solid rgba(248,113,113,0.50)`, animation: "breathe 0.8s ease-in-out infinite" }} />
            )}
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, color: "#fff", boxShadow: `0 0 12px ${col}50`, overflow: "hidden" }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : initial}
            </div>
          </div>

          {/* Name + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.80)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cloneName}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              {pillState === "recording" && <Bars color="rgba(248,113,113,0.70)" />}
              {pillState === "thinking"  && <Spin />}
              {pillState === "speaking"  && <Bars color={col} />}
              {pillState === "idle"      && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.70)", display: "inline-block", animation: "breathe 2.5s ease-in-out infinite" }} />}
              <span style={{ fontSize: 10, color: pillState === "recording" ? "rgba(248,113,113,0.70)" : pillState === "idle" ? "rgba(52,211,153,0.60)" : "rgba(255,255,255,0.30)" }}>
                {statusText}
              </span>
              {activeAppLabel && pillState === "idle" && (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>
                  · {activeAppLabel}
                </span>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 5, alignItems: "center", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {/* Mic */}
            <button onClick={handleMic} style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              background: pillState === "recording" ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.07)",
              border: `1.5px solid ${pillState === "recording" ? "rgba(248,113,113,0.40)" : "rgba(255,255,255,0.12)"}`,
              color: pillState === "recording" ? "rgba(248,113,113,0.90)" : pillState !== "idle" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.65)",
              transition: "all 150ms",
            }}>
              {pillState === "recording" ? <StopIcon /> : pillState !== "idle" ? <StopIcon /> : <MicIcon />}
            </button>
            {/* Expand */}
            <button onClick={() => setExpanded(v => !v)} style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", transition: "all 120ms" }}>
              {expanded
                ? <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 3h3V1M9 3H6V1M1 7h3v2M9 7H6v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
            {/* Exit */}
            <button onClick={() => window.pillAPI?.exit()} style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.25)", transition: "all 120ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.10)"; e.currentTarget.style.color = "rgba(248,113,113,0.65)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}>
              <svg width="8" height="8" viewBox="0 0 9 9" fill="none"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* ── Expanded: message history ── */}
        {expanded && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              {messages.length === 0 && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 20 }}>
                  Tap the mic — I can see your screen.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "85%" }}>
                    <p style={{
                      margin: 0, padding: "7px 10px",
                      borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                      background: m.role === "user" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.78)", wordBreak: "break-word",
                    }}>{m.text}</p>
                    {m.fromCache && (
                      <span style={{ fontSize: 9, color: "rgba(99,102,241,0.55)", marginTop: 2, display: "block" }}>
                        cached
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {liveText && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <p style={{ maxWidth: "85%", margin: 0, padding: "7px 10px", borderRadius: "12px 12px 12px 3px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.55)", wordBreak: "break-word" }}>
                    {liveText}<span style={{ display: "inline-block", width: 5, height: 9, background: "rgba(255,255,255,0.35)", borderRadius: 2, marginLeft: 2, animation: "breathe 0.7s ease-in-out infinite" }} />
                  </p>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>

            {/* ── Clipboard chip ── */}
            {clipboardText && !clipboardDone && (
              <div style={{
                margin: "0 12px 6px",
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(99,102,241,0.10)",
                border: "1px solid rgba(99,102,241,0.20)",
                display: "flex", alignItems: "center", gap: 8,
                WebkitAppRegion: "no-drag",
              } as React.CSSProperties}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "rgba(165,180,252,0.70)" }}>
                  <rect x="2" y="1" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4 1.5A1 1 0 015 1h2a1 1 0 011 .5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M4 5h4M4 7h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.6"/>
                </svg>
                <span style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {clipboardText.slice(0, 60)}{clipboardText.length > 60 ? "…" : ""}
                </span>
                <button
                  onClick={() => { setInputText(prev => prev ? `${prev} ${clipboardText}` : clipboardText); setClipboardDone(true); inputRef.current?.focus(); }}
                  style={{ fontSize: 10, color: "rgba(165,180,252,0.80)", background: "rgba(99,102,241,0.15)", border: "none", borderRadius: 5, padding: "2px 7px", cursor: "pointer" }}
                >
                  Use
                </button>
                <button
                  onClick={() => setClipboardDone(true)}
                  style={{ color: "rgba(255,255,255,0.20)", background: "none", border: "none", cursor: "pointer", padding: "0 2px", fontSize: 12, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            )}

            {/* ── Text input ── */}
            <div style={{ padding: "6px 12px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = inputText.trim();
                  if (!t || pillState !== "idle") return;
                  setInputText("");
                  sendMessage(t);
                }}
                style={{ display: "flex", gap: 6, alignItems: "center" }}
              >
                <input
                  ref={inputRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Type a message…"
                  disabled={pillState !== "idle"}
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
                    padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.75)",
                    outline: "none", opacity: pillState !== "idle" ? 0.4 : 1,
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || pillState !== "idle"}
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: inputText.trim() && pillState === "idle" ? "rgba(99,102,241,0.50)" : "rgba(255,255,255,0.05)",
                    color: inputText.trim() && pillState === "idle" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.25)",
                    transition: "all 150ms",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Bars({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center", height: 12 }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ width: 2.5, borderRadius: 2, background: color, transformOrigin: "bottom", height: "100%", animation: `voice-bar 0.5s ease-in-out ${i*0.08}s infinite alternate` }} />
      ))}
    </div>
  );
}
function Spin() {
  return <div style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.12)", borderTopColor: "rgba(255,255,255,0.55)", animation: "spin 0.7s linear infinite" }} />;
}
function MicIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="4.5" y="1" width="5" height="7" rx="2.5" fill="currentColor" stroke="none" opacity="0.75"/><path d="M2 7a5 5 0 0010 0"/><line x1="7" y1="12" x2="7" y2="14"/><line x1="4.5" y1="14" x2="9.5" y2="14"/></svg>;
}
function StopIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="2"/></svg>;
}
