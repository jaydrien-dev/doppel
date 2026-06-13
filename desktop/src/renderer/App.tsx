import React, { useEffect, useState } from "react";
import { ChatPage } from "./pages/Chat";
import { SynthesisPage } from "./pages/Synthesis";

const CLERK_PK = "pk_test_ZWxlY3RyaWMtbW9yYXktNzMuY2xlcmsuYWNjb3VudHMuZGV2JA";

declare global {
  interface Window {
    electronAPI?: {
      isElectron:          boolean;
      openPill:            (clone: { id: string; handle: string; name: string; avatar_url?: string }) => void;
      minimize:            () => void;
      close:               () => void;
      toggleFullscreen:    () => void;
      getSettings:         () => Promise<any>;
      saveSettings:        (data: Record<string, any>) => void;
      openExternal:        (url: string) => void;
      onOverlayChanged:    (cb: (val: boolean) => void) => () => void;
      onFullscreenChanged: (cb: (val: boolean) => void) => () => void;
    };
  }
}

// ─── Logo mark (matches landing page DoppelMark) ─────────────────────────────
function DoppelMark({ size = 18 }: { size?: number }) {
  const rx = size * 0.31;
  const c1x = size * 0.404, c1y = size * 0.404, c1r = size * 0.212;
  const c2x = size * 0.635, c2y = size * 0.635, c2r = size * 0.173;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={rx}
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" />
      <circle cx={c1x} cy={c1y} r={c1r} fill="rgba(255,255,255,0.95)" />
      <circle cx={c2x} cy={c2y} r={c2r} fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

interface Clone { id: string; handle: string; name: string; category?: string; avatar_url?: string; }

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ─── Clerk singleton ──────────────────────────────────────────────────────────

let _clerk: any = null;

async function getClerk() {
  if (_clerk) return _clerk;
  const mod = await import("@clerk/clerk-js");
  const Clerk = mod.default ?? (mod as any).Clerk;
  _clerk = new Clerk(CLERK_PK);
  await _clerk.load();
  return _clerk;
}

function useClerkAuth() {
  const [user, setUser]     = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    getClerk().then(clerk => {
      setUser(clerk.user ?? null);
      setLoaded(true);
      unsub = clerk.addListener(({ user: u }: any) => {
        setUser(u ?? null);
        window.electronAPI?.saveSettings({ userId: u?.id ?? "" });
      });
    }).catch(() => setLoaded(true));
    return () => { unsub?.(); };
  }, []);

  return { user, loaded };
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<"messages" | "synthesis" | "settings">("messages");

  const baseStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#080808", color: "rgba(255,255,255,0.82)",
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  };

  return (
    <div style={baseStyle}>
      <TitleBar />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "messages"   && <MessagesLayout />}
        {tab === "synthesis"  && <SynthesisPage />}
        {tab === "settings"   && <SettingsPage />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// ─── Title bar ───────────────────────────────────────────────────────────────

function TitleBar() {
  const [isFS, setIsFS] = React.useState(false);

  React.useEffect(() => {
    const unsub = window.electronAPI?.onFullscreenChanged?.((val) => setIsFS(val));
    return () => unsub?.();
  }, []);

  return (
    <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, WebkitAppRegion: "drag" } as React.CSSProperties}>
      {/* Logo — matches landing page nav__brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <DoppelMark size={18} />
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.025em", color: "rgba(255,255,255,0.93)" }}>
          doppel
        </span>
      </div>
      <div style={{ display: "flex", gap: 5, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {window.electronAPI?.isElectron && <>
          <WinBtn onClick={() => window.electronAPI!.minimize()}>
            <svg width="9" height="2" viewBox="0 0 9 2"><line x1="0.5" y1="1" x2="8.5" y2="1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </WinBtn>
          <WinBtn onClick={() => window.electronAPI!.toggleFullscreen?.()} title={isFS ? "Exit fullscreen" : "Fullscreen"}>
            {isFS ? (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M1 4h3V1M9 4H6V1M1 6h3v3M9 6H6v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M1 4V1h3M6 1h3v3M9 6v3H6M3 9H1V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </WinBtn>
          <WinBtn onClick={() => window.electronAPI!.close()} danger>
            <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </WinBtn>
        </>}
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

function BottomNav({ tab, setTab }: { tab: string; setTab: (t: any) => void }) {
  return (
    <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
      {([
        { id: "messages",   label: "Messages",   icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5A1.5 1.5 0 013.5 2h7A1.5 1.5 0 0112 3.5v5A1.5 1.5 0 0110.5 10H7L4 12.5V10H3.5A1.5 1.5 0 012 8.5v-5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
        { id: "synthesis",  label: "Synthesis",  icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.2"/><circle cx="10" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5.8L7 8.2M10 5.8L7 8.2M4 5.8h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg> },
        { id: "settings",   label: "Settings",   icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.929 2.929l1.06 1.06M10.01 10.01l1.061 1.061M2.929 11.071l1.06-1.06M10.01 3.99l1.061-1.061" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
      ] as const).map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, padding: "9px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          background: "none", border: "none", cursor: "pointer",
          color: tab === t.id ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)",
          borderTop: `1.5px solid ${tab === t.id ? "rgba(255,255,255,0.30)" : "transparent"}`,
          fontFamily: "inherit",
        }} className="bottom-tab">
          {t.icon}
          <span style={{ fontSize: 10 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Messages Layout (split-pane) ─────────────────────────────────────────────

function MessagesLayout() {
  const { user: clerkUser } = useClerkAuth();
  const [clones,   setClones]   = useState<Clone[]>([]);
  const [filtered, setFiltered] = useState<Clone[]>([]);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<Clone | null>(null);
  const [loading,  setLoading]  = useState(true);

  async function fetchClones() {
    setLoading(true);
    try {
      const s = await window.electronAPI?.getSettings();
      const url = s?.fastapiUrl ?? "https://doppel.up.railway.app";
      let headers: Record<string, string> = {};
      if (s?.userId) {
        headers = { "X-User-Id": s.userId };
      } else {
        const clerk = await getClerk().catch(() => null);
        const token = await clerk?.session?.getToken?.().catch(() => null);
        if (token) headers = { Authorization: `Bearer ${token}` };
      }
      const res = await fetch(`${url}/clones/mine`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list: Clone[] = (data.clones ?? data).map((c: any) => ({
        id: c.clone_id, handle: c.handle,
        name: c.listing_title ?? c.display_name ?? c.handle,
        category: c.category,
        avatar_url: c.avatar_url ?? undefined,
      }));
      setClones(list);
      setFiltered(list);
      if (!selected && list.length > 0) setSelected(list[0]);
    } catch {
      setClones([]); setFiltered([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchClones(); }, [clerkUser?.id]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? clones.filter(c => c.name.toLowerCase().includes(q) || (c.category ?? "").toLowerCase().includes(q)) : clones);
  }, [search, clones]);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <style>{`
        @keyframes msg-fade-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .clone-row:active { transform: scale(0.97) !important; }
        .bottom-tab {
          transition: color 260ms cubic-bezier(0.25,0.46,0.45,0.94),
                      border-color 260ms cubic-bezier(0.25,0.46,0.45,0.94) !important;
        }
        .bottom-tab:active { transform: scale(0.88); transition: transform 150ms cubic-bezier(0.34,1.56,0.64,1) !important; }
        .pill-btn { transition: background 220ms cubic-bezier(0.25,0.46,0.45,0.94), color 220ms cubic-bezier(0.25,0.46,0.45,0.94), transform 180ms cubic-bezier(0.34,1.56,0.64,1) !important; }
        .pill-btn:active { transform: scale(0.82) !important; }
      `}</style>

      {/* ── Left sidebar: clone list ──────────────────────────────────── */}
      <div style={{ width: 238, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden", background: "rgba(255,255,255,0.015)" }}>

        {/* Search */}
        <div style={{ padding: "10px 10px 6px", flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "7px 11px", color: "rgba(255,255,255,0.75)", outline: "none", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const }}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"}
            onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
          />
        </div>

        {/* Clone rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 4px" }}>

          {loading && <Spinner />}

          {!loading && !clerkUser && (
            <div style={{ textAlign: "center", padding: "28px 14px" }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 12, lineHeight: 1.5 }}>Sign in to see your clones.</p>
              <button
                onClick={async () => { const c = await getClerk(); c.openSignIn(); }}
                style={{ width: "100%", padding: "8px 0", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.70)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                Sign in →
              </button>
            </div>
          )}

          {!loading && clerkUser && filtered.length === 0 && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "28px 0" }}>
              No clones yet.
            </p>
          )}

          {filtered.map((c, idx) => {
            const col = avatarColor(c.name);
            const sel = selected?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 9px",
                  borderRadius: 10, marginBottom: 1, cursor: "pointer",
                  transition: "background 220ms cubic-bezier(0.25,0.46,0.45,0.94), border-color 220ms cubic-bezier(0.25,0.46,0.45,0.94), transform 180ms cubic-bezier(0.34,1.56,0.64,1)",
                  background: sel ? "rgba(255,255,255,0.08)" : "transparent",
                  border: `1px solid ${sel ? "rgba(255,255,255,0.10)" : "transparent"}`,
                  animation: `msg-fade-in 320ms cubic-bezier(0.34,1.56,0.64,1) ${idx * 40}ms both`,
                }}
                onMouseEnter={e => { if (!sel) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1.01)"; } }}
                onMouseLeave={e => { if (!sel) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "scale(1)"; } }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : c.name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: sel ? 500 : 400, color: sel ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.62)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </p>
                  {c.category && (
                    <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.28)", textTransform: "capitalize" as const }}>
                      {c.category}
                    </p>
                  )}
                </div>
                {sel && (
                  <button
                    onClick={e => { e.stopPropagation(); window.electronAPI?.openPill({ id: c.id, handle: c.handle, name: c.name, avatar_url: c.avatar_url }); }}
                    title="Launch overlay pill"
                    className="pill-btn"
                    style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.45)", cursor: "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; e.currentTarget.style.transform = "scale(1.12)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    {/* pill / overlay icon */}
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="5" width="10" height="4" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* User / credits footer */}
        <SidebarUserFooter />
      </div>

      {/* ── Right panel: chat ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {selected ? (
          <ChatPage clone={selected} onBack={() => setSelected(null)} hideBack />
        ) : !loading && !clerkUser ? (
          /* Not signed in — prominent onboarding */
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
            <DoppelMark size={42} />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: "0 0 6px", letterSpacing: "-0.015em" }}>Sign in to get started</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: 0, lineHeight: 1.6, maxWidth: 240 }}>Chat with your clones or explore the marketplace.</p>
            </div>
            <button
              onClick={async () => { const c = await getClerk(); c.openSignIn(); }}
              style={{ padding: "9px 22px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.80)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em", transition: "background 180ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            >
              Sign in →
            </button>
          </div>
        ) : !loading && clerkUser && filtered.length === 0 ? (
          /* Signed in but no clones */
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.55)", margin: 0 }}>No clones yet</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", margin: 0, lineHeight: 1.6, textAlign: "center", maxWidth: 240 }}>
              Create your first clone at doppel.ai, then come back here to chat.
            </p>
            <button
              onClick={() => window.electronAPI?.openExternal("https://doppel.ai/dashboard")}
              style={{ padding: "7px 18px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "background 180ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
            >
              Open dashboard →
            </button>
          </div>
        ) : (
          /* Signed in, has clones, none selected */
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.22)" }}>Select a clone to start a conversation.</p>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Sidebar User / Credits Footer ───────────────────────────────────────────

function SidebarUserFooter() {
  const { user: clerkUser, loaded } = useClerkAuth();
  const [credits, setCredits] = useState<{ plan: number; bought: number } | null>(null);

  useEffect(() => {
    async function load() {
      const s = await window.electronAPI?.getSettings().catch(() => null);
      const uid = s?.userId;
      const url = s?.fastapiUrl ?? "https://doppel.up.railway.app";
      if (!uid?.trim()) return;
      fetch(`${url}/credits/balance`, { headers: { "X-User-Id": uid } })
        .then(r => { if (r.ok) return r.json(); return null; })
        .then(d => { if (d) setCredits({ plan: d.plan_credits ?? 0, bought: d.bought_credits ?? 0 }); })
        .catch(() => {});
    }
    load();
  }, [clerkUser?.id]);

  if (!loaded || !clerkUser) return null;

  const email = clerkUser?.primaryEmailAddress?.emailAddress
    ?? clerkUser?.emailAddresses?.[0]?.emailAddress
    ?? "";
  const displayName = clerkUser?.fullName ?? clerkUser?.firstName ?? email;
  const initial = displayName?.[0]?.toUpperCase() ?? "?";

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "10px 10px 10px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {/* Avatar */}
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(167,139,250,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: "rgba(167,139,250,0.85)", flexShrink: 0 }}>
          {initial}
        </div>
        {/* Name + ID */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
        </div>
      </div>
      {/* Credits */}
      {credits !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexWrap: "wrap" as const }}>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.13)", color: credits.plan > 0 ? "rgba(96,165,250,0.65)" : "rgba(255,255,255,0.22)", fontVariantNumeric: "tabular-nums" }} title="Plan credits (weekly)">
            {credits.plan.toLocaleString()} plan
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)" }}>·</span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(196,181,253,0.07)", border: "1px solid rgba(196,181,253,0.12)", color: credits.bought > 0 ? "rgba(196,181,253,0.60)" : "rgba(255,255,255,0.22)", fontVariantNumeric: "tabular-nums" }} title="Bought credits (never expire)">
            {credits.bought.toLocaleString()} bought
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

interface QASlot { cloneId: string; cloneName: string; cloneHandle: string; }

function SettingsPage() {
  const { user: clerkUser, loaded: clerkLoaded } = useClerkAuth();
  const [fastapiUrl,   setFastapiUrl]   = useState("https://doppel.up.railway.app");
  const [openaiKey,      setOpenaiKey]      = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [saved,        setSaved]        = useState(false);
  const [qaClones,     setQaClones]     = useState<Clone[]>([]);
  const [qaSlots,      setQaSlots]      = useState<(QASlot | null)[]>([null, null, null]);
  const [qaOpenIdx,    setQaOpenIdx]    = useState<number | null>(null);

  // Proactive nudges (Feature 1)
  const [nudgeEnabled,  setNudgeEnabled]  = useState(false);
  const [nudgeClone,    setNudgeClone]    = useState<Clone | null>(null);
  const [nudgeInterval, setNudgeInterval] = useState<number>(30);
  const [nudgeOpen,     setNudgeOpen]     = useState(false);

  // Voice call (Feature 5)
  const [vcEnabled, setVcEnabled] = useState(false);
  const [vcClone,   setVcClone]   = useState<Clone | null>(null);
  const [vcTime,    setVcTime]    = useState("09:00");
  const [vcOpen,    setVcOpen]    = useState(false);

  useEffect(() => {
    window.electronAPI?.getSettings().then(async (s: any) => {
      if (s?.fastapiUrl) setFastapiUrl(s.fastapiUrl); else setFastapiUrl("https://doppel.up.railway.app");
      if (s?.openaiKey)       setOpenaiKey(s.openaiKey);
      if (s?.anthropicApiKey) setAnthropicApiKey(s.anthropicApiKey);
      if (s?.quickAccess) {
        const slots = [...(s.quickAccess as (QASlot | null)[])];
        while (slots.length < 3) slots.push(null);
        setQaSlots(slots.slice(0, 3));
      }
      if (s?.proactiveEnabled)        setNudgeEnabled(true);
      if (s?.proactiveIntervalMinutes) setNudgeInterval(s.proactiveIntervalMinutes);
      if (s?.voiceCallEnabled) setVcEnabled(true);
      if (s?.voiceCallTime)    setVcTime(s.voiceCallTime);

      const url = s?.fastapiUrl ?? "https://doppel.up.railway.app";
      const uid = s?.userId ?? "";
      if (!uid) return;
      try {
        const res = await fetch(`${url}/clones/mine`, { headers: { "X-User-Id": uid } });
        if (res.ok) {
          const data = await res.json();
          const list = (data.clones ?? data).map((c: any) => ({
            id: c.clone_id, handle: c.handle,
            name: c.listing_title ?? c.display_name ?? c.handle,
          }));
          setQaClones(list);
          if (s?.proactiveCloneId) {
            const found = list.find((c: Clone) => c.id === s.proactiveCloneId);
            if (found) setNudgeClone(found);
          }
          if (s?.voiceCallCloneId) {
            const found = list.find((c: Clone) => c.id === s.voiceCallCloneId);
            if (found) setVcClone(found);
          }
        }
      } catch { /* non-fatal */ }
    });
  }, []);

  async function handleSignIn() {
    const clerk = await getClerk();
    clerk.openSignIn();
  }

  async function handleSignOut() {
    const clerk = await getClerk();
    await clerk.signOut();
  }

  function saveConfig() {
    window.electronAPI?.saveSettings({
      fastapiUrl,
      openaiKey,
      anthropicApiKey,
      quickAccess: qaSlots,
      proactiveEnabled:         nudgeEnabled,
      proactiveCloneId:         nudgeClone?.id        ?? "",
      proactiveCloneName:       nudgeClone?.name      ?? "",
      proactiveCloneHandle:     nudgeClone?.handle    ?? "",
      proactiveIntervalMinutes: nudgeInterval,
      voiceCallEnabled:         vcEnabled,
      voiceCallCloneId:         vcClone?.id     ?? "",
      voiceCallCloneName:       vcClone?.name   ?? "",
      voiceCallCloneHandle:     vcClone?.handle ?? "",
      voiceCallTime:            vcTime,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const email = clerkUser?.primaryEmailAddress?.emailAddress
    ?? clerkUser?.emailAddresses?.[0]?.emailAddress
    ?? "";
  const displayName = clerkUser?.fullName ?? clerkUser?.firstName ?? email;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 18px" }}>

      {/* Account */}
      <Section label="Account">
        {!clerkLoaded && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: "0 0 10px" }}>Loading…</p>}

        {clerkLoaded && !clerkUser && (
          <button onClick={handleSignIn} style={btnStyle(false)}>
            Sign in with Doppel →
          </button>
        )}

        {clerkLoaded && clerkUser && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "rgba(167,139,250,0.85)", flexShrink: 0 }}>
                {displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
                <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
              </div>
              <span style={{ fontSize: 10, color: "rgba(52,211,153,0.70)", background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.20)", borderRadius: 999, padding: "2px 7px" }}>signed in</span>
            </div>
            <button onClick={handleSignOut} style={{ ...btnStyle(false), color: "rgba(248,113,113,0.60)", borderColor: "rgba(248,113,113,0.15)" }}>
              Sign out
            </button>
          </div>
        )}
      </Section>

      {/* Quick Access */}
      <Section label="Quick Access  ·  Ctrl+Alt+1/2/3">
        {qaClones.length === 0 && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 10 }}>Sign in and save settings to configure.</p>
        )}
        {([0, 1, 2] as const).map(i => {
          const slot  = qaSlots[i];
          const label = `Ctrl+Alt+${i + 1}`;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, position: "relative" }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "monospace" }}>
                {label}
              </span>
              <button
                onClick={() => setQaOpenIdx(qaOpenIdx === i ? null : i)}
                style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 8, border: `1px solid ${qaOpenIdx === i ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.09)"}`, background: qaOpenIdx === i ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)" }}
              >
                {slot ? (
                  <>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: avatarColor(slot.cloneName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
                      {slot.cloneName[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{slot.cloneName}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>Assign clone…</span>
                )}
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "rgba(255,255,255,0.28)" }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {slot && (
                <button onClick={() => setQaSlots(prev => prev.map((s, j) => j === i ? null : s))}
                  style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.28)", cursor: "pointer", flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </button>
              )}
              {qaOpenIdx === i && qaClones.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 64, zIndex: 99, background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, minWidth: 180, maxHeight: 180, overflowY: "auto", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
                  {qaClones.map(c => (
                    <button key={c.id}
                      onClick={() => { setQaSlots(prev => prev.map((s, j) => j === i ? { cloneId: c.id, cloneName: c.name, cloneHandle: c.handle } : s)); setQaOpenIdx(null); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 100ms" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ width: 20, height: 20, borderRadius: 5, background: avatarColor(c.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Proactive Nudges */}
      <Section label="Proactive Nudges  ·  desktop only">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>Clone reaches out to you on a schedule</p>
          <Toggle value={nudgeEnabled} onChange={setNudgeEnabled} />
        </div>
        {nudgeEnabled && (
          <>
            <CloneDropdownSmall clones={qaClones} selected={nudgeClone} onSelect={setNudgeClone} open={nudgeOpen} setOpen={setNudgeOpen} placeholder="Select clone…" />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>Every</span>
              {[5, 15, 30, 60].map(n => (
                <button key={n} onClick={() => setNudgeInterval(n)} style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${nudgeInterval === n ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`, background: nudgeInterval === n ? "rgba(255,255,255,0.08)" : "transparent", color: nudgeInterval === n ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 200ms cubic-bezier(0.25,0.46,0.45,0.94)" }}>
                  {n}m
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Voice Call */}
      <Section label="Voice Call  ·  desktop only">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>Clone calls you daily at a set time</p>
          <Toggle value={vcEnabled} onChange={setVcEnabled} />
        </div>
        {vcEnabled && (
          <>
            <CloneDropdownSmall clones={qaClones} selected={vcClone} onSelect={setVcClone} open={vcOpen} setOpen={setVcOpen} placeholder="Select clone…" />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Daily at</span>
              <input
                type="time"
                value={vcTime}
                onChange={e => setVcTime(e.target.value)}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "5px 9px", color: "rgba(255,255,255,0.72)", outline: "none", fontSize: 12, fontFamily: "inherit", colorScheme: "dark" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)"}
                onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
              />
            </div>
          </>
        )}
      </Section>

      {/* API Keys */}
      <Section label="API Keys">
        <Field label="Anthropic API Key (for computer agent)" value={anthropicApiKey} onChange={setAnthropicApiKey} placeholder="sk-ant-api03-…" password />
        <Field label="OpenAI API Key (for voice transcription)" value={openaiKey} onChange={setOpenaiKey} placeholder="sk-proj-…" password />
      </Section>

      <button onClick={saveConfig} style={{
        width: "100%", padding: "10px", borderRadius: 10,
        border: `1px solid ${saved ? "rgba(52,211,153,0.30)" : "rgba(255,255,255,0.14)"}`,
        background: saved ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.07)",
        color: saved ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.75)",
        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 200ms",
      }}>
        {saved ? "Saved" : "Save settings"}
      </button>
    </div>
  );
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  width: "100%", padding: "9px 14px", borderRadius: 10, marginBottom: 10,
  border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}`,
  background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.75)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  transition: "all 240ms cubic-bezier(0.25,0.46,0.45,0.94)", textAlign: "left" as const,
});

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ margin: "0 0 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.22)" }}>{label}</p>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, password }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; password?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: "0 0 5px", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{label}</p>
      <input type={password ? "password" : "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "8px 10px", color: "rgba(255,255,255,0.72)", outline: "none", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
        onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
        onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
      />
    </div>
  );
}

function WinBtn({ children, onClick, danger, title }: { children: React.ReactNode; onClick: () => void; danger?: boolean; title?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: hov && danger ? "rgba(248,113,113,0.15)" : hov ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: hov && danger ? "rgba(248,113,113,0.75)" : "rgba(255,255,255,0.35)", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.10)", borderTopColor: "rgba(255,255,255,0.50)", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ width: 34, height: 18, borderRadius: 9, cursor: "pointer", padding: 0, position: "relative", background: value ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.10)", border: `1px solid ${value ? "rgba(52,211,153,0.30)" : "rgba(255,255,255,0.10)"}`, transition: "all 200ms", flexShrink: 0 } as React.CSSProperties}
    >
      <div style={{ position: "absolute", top: 2, left: value ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: value ? "rgba(52,211,153,0.90)" : "rgba(255,255,255,0.40)", transition: "left 300ms cubic-bezier(0.34,1.56,0.64,1), background 260ms cubic-bezier(0.25,0.46,0.45,0.94)" }} />
    </button>
  );
}

function CloneDropdownSmall({ clones, selected, onSelect, open, setOpen, placeholder }: {
  clones: Clone[]; selected: Clone | null; onSelect: (c: Clone) => void;
  open: boolean; setOpen: (v: boolean) => void; placeholder: string;
}) {
  const col = selected ? avatarColor(selected.name) : "rgba(255,255,255,0.20)";
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 8, border: `1px solid ${open ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.09)"}`, background: "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 200ms cubic-bezier(0.25,0.46,0.45,0.94)" }}
      >
        {selected ? (
          <>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
              {selected.name[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", flex: 1 }}>{placeholder}</span>
        )}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "rgba(255,255,255,0.28)" }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && clones.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 99, background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, maxHeight: 160, overflowY: "auto", backdropFilter: "blur(20px)", boxShadow: "0 10px 36px rgba(0,0,0,0.60)" }}>
          {clones.map(c => (
            <button key={c.id}
              onClick={() => { onSelect(c); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 8px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
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
