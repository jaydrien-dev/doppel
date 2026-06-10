import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    quickAskAPI?: {
      close:        () => void;
      getSettings:  () => Promise<any>;
      getActiveApp: () => Promise<{ appName: string; windowTitle: string } | null>;
    };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Clone { id: string; handle: string; name: string; }
type ResponseMode = "fast" | "pro" | "extended";

// ─── Utils ────────────────────────────────────────────────────────────────────

const PALETTE = ["#1A73E8","#7B1FA2","#E91E63","#F57C00","#2E7D32","#546E7A","#00838F","#8E24AA"];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function uuid() { return crypto.randomUUID(); }

// ─── Context-aware clone scoring (feature 4) ─────────────────────────────────

const CTX_MAP: { patterns: RegExp[]; tags: string[] }[] = [
  { patterns: [/code|vscode|visual.?studio|cursor|intellij|webstorm|vim|nvim|terminal|iterm|cmd|powershell|bash|git|github/i], tags: ["engineer","dev","code","tech","software","programming","backend","frontend"] },
  { patterns: [/figma|sketch|adobe|illustrator|photoshop|canva|framer|invision/i],                                             tags: ["design","product","ui","ux","creative","brand"] },
  { patterns: [/notion|docs|word|confluence|obsidian|bear|typora|markdown/i],                                                  tags: ["writing","strategy","content","ops","knowledge","blog"] },
  { patterns: [/excel|sheets|numbers|tableau|looker|metabase|sql|databricks/i],                                               tags: ["data","analytics","finance","ops","growth"] },
  { patterns: [/slack|teams|discord|zoom|meet|webex|loom|cal\.com/i],                                                         tags: ["comms","management","leadership","hr","recruiting"] },
];

function contextScore(clone: Clone, appName: string, windowTitle: string): number {
  const ctx = `${appName} ${windowTitle}`.toLowerCase();
  const meta = `${clone.name} ${clone.category ?? ""}`.toLowerCase();
  for (const c of CTX_MAP) {
    if (c.patterns.some(p => p.test(ctx))) {
      if (c.tags.some(t => meta.includes(t))) return 1;
    }
  }
  return 0;
}

const MODES: { value: ResponseMode; label: string }[] = [
  { value: "fast",     label: "Fast"     },
  { value: "pro",      label: "Pro"      },
  { value: "extended", label: "Extended" },
];

// ─── Icons ───────────────────────────────────────────────────────────────────

const ISend = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/>
  </svg>
);
const IClose = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IChevron = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── CloneDropdown ────────────────────────────────────────────────────────────

function CloneDropdown({ clones, selected, onSelect }: {
  clones: Clone[];
  selected: Clone | null;
  onSelect: (c: Clone) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (clones.length === 0) return null;

  const col = selected ? avatarColor(selected.name) : "rgba(255,255,255,0.20)";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px 5px 6px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)", background: open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit", transition: "all 120ms" }}
      >
        {selected && (
          <div style={{ width: 20, height: 20, borderRadius: 5, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
            {selected.name[0]?.toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
          {selected ? selected.name : "Pick clone"}
        </span>
        <span style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }}><IChevron /></span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 99, background: "rgba(14,14,14,0.97)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, minWidth: 180, maxHeight: 200, overflowY: "auto", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
          {clones.map(c => {
            const cc = avatarColor(c.name);
            const isSel = selected?.id === c.id;
            return (
              <button key={c.id}
                onClick={() => { onSelect(c); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 7, border: "none", background: isSel ? `${cc}18` : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 100ms" }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, background: cc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
                  {c.name[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: isSel ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </span>
                {isSel && <svg style={{ marginLeft: "auto", flexShrink: 0 }} width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={cc} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main QuickAsk ────────────────────────────────────────────────────────────

// URL params passed from main process when launched via hotkey (feature 6)
const URL_PARAMS     = new URLSearchParams(window.location.search);
const PINNED_CLONE_ID   = URL_PARAMS.get("clone_id")     ?? null;
const PINNED_CLONE_NAME = URL_PARAMS.get("clone_name")   ?? null;
const PINNED_CLONE_HANDLE = URL_PARAMS.get("clone_handle") ?? null;

function QuickAsk() {
  const [clones,        setClones]        = useState<Clone[]>([]);
  const [selectedClone, setSelectedClone] = useState<Clone | null>(null);
  const [contextLabel,  setContextLabel]  = useState<string | null>(null); // e.g. "VS Code"
  const [input,         setInput]         = useState("");
  const [response,      setResponse]      = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [isThinking,    setIsThinking]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [mode,          setMode]          = useState<ResponseMode>("fast");
  const [apiUrl,        setApiUrl]        = useState("https://doppel.up.railway.app");
  const [userId,        setUserId]        = useState("");
  const [asked,         setAsked]         = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load settings + clones + context on mount
  useEffect(() => {
    window.quickAskAPI?.getSettings().then(async (s: any) => {
      const url = s?.fastapiUrl ?? "https://doppel.up.railway.app";
      const uid = s?.userId ?? "";
      setApiUrl(url);
      setUserId(uid);

      if (!uid) return;

      // Fetch clones
      let list: Clone[] = [];
      try {
        const res = await fetch(`${url}/clones/mine`, { headers: { "X-User-Id": uid } });
        if (res.ok) {
          const data = await res.json();
          list = (data.clones ?? data).map((c: any) => ({
            id: c.clone_id, handle: c.handle,
            name: c.listing_title ?? c.display_name ?? c.handle,
            category: c.category,
          }));
          setClones(list);
        }
      } catch { /* non-fatal */ }

      if (list.length === 0) return;

      // Feature 6: if launched with a pinned clone, use it
      if (PINNED_CLONE_ID) {
        const pinned = list.find(c => c.id === PINNED_CLONE_ID)
          ?? (PINNED_CLONE_NAME ? { id: PINNED_CLONE_ID, name: PINNED_CLONE_NAME, handle: PINNED_CLONE_HANDLE ?? "" } : null);
        if (pinned) { setSelectedClone(pinned as Clone); return; }
      }

      // Feature 4: context-aware auto-select
      const activeApp = await window.quickAskAPI?.getActiveApp().catch(() => null);
      if (activeApp?.appName) {
        const appName    = activeApp.appName;
        const windowTitle = activeApp.windowTitle ?? "";
        const best = list.reduce<{ clone: Clone; score: number } | null>((acc, c) => {
          const s = contextScore(c, appName, windowTitle);
          if (!acc || s > acc.score) return { clone: c, score: s };
          return acc;
        }, null);
        if (best && best.score > 0) {
          setSelectedClone(best.clone);
          setContextLabel(appName.split(".")[0]); // e.g. "Code" from "Code.exe"
          return;
        }
      }

      // Default: first clone
      setSelectedClone(list[0]);
    });

    // Auto-focus input
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // Escape to close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") window.quickAskAPI?.close();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function ask() {
    if (!input.trim() || !selectedClone || isLoading) return;
    setIsLoading(true);
    setIsThinking(false);
    setResponse("");
    setError(null);
    setAsked(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) headers["X-User-Id"] = userId;

      const res = await fetch(`${apiUrl}/brain/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          clone_id:      selectedClone.id,
          session_id:    uuid(),
          message:       input.trim(),
          context_type:  "chat",
          response_mode: mode,
          owner_mode:    false,
        }),
      });

      if (!res.ok) {
        const errBody = await res.clone().json().catch(() => ({}));
        throw new Error(errBody.detail ?? errBody.error ?? `Error ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

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

          if (evt.event === "thinking") {
            setIsThinking(true);
          } else if (evt.event === "token") {
            setIsThinking(false);
            acc += evt.text as string;
            setResponse(acc);
          } else if (evt.event === "done") {
            setIsThinking(false);
            const final = (evt.corrected_response as string | null) ?? acc;
            setResponse(final);
          } else if (evt.event === "error") {
            throw new Error(evt.message as string);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
  }

  function reset() {
    setInput("");
    setResponse("");
    setError(null);
    setAsked(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const hasClones = clones.length > 0;
  const cloneColor = selectedClone ? avatarColor(selectedClone.name) : "#444";

  return (
    <div style={{ width: 360, fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes typing-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 0.8; }
        }
        .qa-textarea { scrollbar-width: none; }
        .qa-textarea::-webkit-scrollbar { display: none; }
        .qa-send:not(:disabled):hover { opacity: 0.88; }
        .qa-send:not(:disabled):active { transform: scale(0.94); }
      `}</style>

      <div style={{
        background: "rgba(10,10,10,0.97)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.04)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      } as React.CSSProperties}>

        {/* Title bar — draggable */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px 8px",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <span style={{ fontSize: 11, fontWeight: 600, background: "linear-gradient(110deg,#a78bfa,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>doppel</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em" }}>quick ask</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", letterSpacing: "0.06em" }}>Esc to close</span>
            <button
              onClick={() => window.quickAskAPI?.close()}
              style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.color = "rgba(248,113,113,0.75)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
            >
              <IClose />
            </button>
          </div>
        </div>

        {/* Input area */}
        {!asked && (
          <div style={{ padding: "0 12px 10px" }}>
            {/* Clone picker + mode row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <CloneDropdown clones={clones} selected={selectedClone} onSelect={c => { setSelectedClone(c); setContextLabel(null); }} />
              {contextLabel && (
                <span style={{ fontSize: 10, color: "rgba(52,211,153,0.65)", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" as const }}>
                  {contextLabel}
                </span>
              )}
              {PINNED_CLONE_ID && !contextLabel && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap" as const }}>pinned</span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "2px", border: "1px solid rgba(255,255,255,0.06)", marginLeft: "auto" }}>
                {MODES.map(m => {
                  const active = mode === m.value;
                  return (
                    <button key={m.value} onClick={() => setMode(m.value)}
                      style={{ padding: "3px 7px", borderRadius: 5, border: "none", fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: active ? "rgba(255,255,255,0.09)" : "transparent", color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", transition: "all 100ms", whiteSpace: "nowrap" as const }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Textarea + send */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "10px 10px 10px 12px", transition: "border-color 120ms" }}
              onFocusCapture={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
              onBlurCapture={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
            >
              <textarea
                ref={inputRef}
                className="qa-textarea"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedClone ? `Ask ${selectedClone.name}…` : "Select a clone first…"}
                disabled={!hasClones}
                rows={1}
                style={{
                  flex: 1, border: "none", outline: "none", resize: "none",
                  background: "transparent", color: "rgba(255,255,255,0.90)",
                  fontSize: 14, lineHeight: 1.5, fontFamily: "inherit",
                  minHeight: 22, maxHeight: 120, overflowY: "auto",
                }}
                onInput={e => {
                  const ta = e.currentTarget;
                  ta.style.height = "auto";
                  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
                }}
              />
              <button
                className="qa-send"
                onClick={ask}
                disabled={!input.trim() || !selectedClone || isLoading}
                style={{
                  width: 32, height: 32, borderRadius: 10, border: "none", flexShrink: 0,
                  background: (!input.trim() || !selectedClone || isLoading) ? "rgba(255,255,255,0.06)" : "#1A73E8",
                  color: (!input.trim() || !selectedClone || isLoading) ? "rgba(255,255,255,0.28)" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: (!input.trim() || !selectedClone || isLoading) ? "not-allowed" : "pointer",
                  transition: "opacity 120ms, transform 120ms",
                }}
              >
                <ISend />
              </button>
            </div>

            {!hasClones && !userId && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 8, textAlign: "center" }}>
                Sign in via the main app to use Quick Ask.
              </p>
            )}
            {!hasClones && userId && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 8, textAlign: "center" }}>
                Loading clones…
              </p>
            )}
          </div>
        )}

        {/* Response area */}
        {asked && (
          <div style={{ padding: "0 12px 12px", animation: "fade-in 180ms ease both" }}>
            {/* Question recap + back button */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.45, fontStyle: "italic" }}>
                "{input}"
              </div>
              <button
                onClick={reset}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.30)"; }}
              >
                ← new
              </button>
            </div>

            {/* Clone avatar + response */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: cloneColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0, marginTop: 1 }}>
                {selectedClone?.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {(isLoading && !response) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 4 }}>
                    {isThinking
                      ? <>
                          {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginLeft: 2 }}>Thinking…</span>
                        </>
                      : [0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.40)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)
                    }
                  </div>
                ) : error ? (
                  <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: 0, lineHeight: 1.5 }}>{error}</p>
                ) : (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", lineHeight: 1.6, maxHeight: 280, overflowY: "auto", paddingRight: 4 }}>
                    {response.split("\n").map((line, i, arr) => (
                      <React.Fragment key={i}>
                        {line}
                        {i < arr.length - 1 && <br />}
                      </React.Fragment>
                    ))}
                    {isLoading && <span style={{ display: "inline-block", width: 2, height: 13, background: "rgba(255,255,255,0.50)", marginLeft: 1, animation: "typing-dot 0.8s ease-in-out infinite", verticalAlign: "middle" }} />}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom padding */}
        <div style={{ height: 4 }} />
      </div>
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById("root")!);
root.render(<QuickAsk />);
