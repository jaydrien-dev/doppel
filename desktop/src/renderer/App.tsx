import React, { useEffect, useRef, useState } from "react";
import { ChatPage } from "./pages/Chat";

const CLERK_PK = "pk_test_ZWxlY3RyaWMtbW9yYXktNzMuY2xlcmsuYWNjb3VudHMuZGV2JA";

declare global {
  interface Window {
    electronAPI?: {
      isElectron:   boolean;
      openPill:     (clone: { id: string; handle: string; name: string; avatar_url?: string }) => void;
      captureScreen:() => Promise<string | null>;
      minimize:     () => void;
      close:        () => void;
      getSettings:  () => Promise<any>;
      saveSettings: (data: Record<string, any>) => void;
      openExternal: (url: string) => void;
    };
  }
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
        // Persist userId so the pill can read it
        window.electronAPI?.saveSettings({ userId: u?.id ?? "" });
      });
    }).catch(() => setLoaded(true));
    return () => { unsub?.(); };
  }, []);

  return { user, loaded };
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<"clones" | "settings">("clones");
  const [chatClone, setChatClone] = useState<Clone | null>(null);

  const baseStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#080808", color: "rgba(255,255,255,0.82)",
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  };

  // Chat view — full screen, no bottom nav
  if (chatClone) {
    return (
      <div style={baseStyle}>
        <TitleBar />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatPage clone={chatClone} onBack={() => setChatClone(null)} />
        </div>
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <TitleBar />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "clones"   && <ClonesPage onOpenChat={setChatClone} />}
        {tab === "settings" && <SettingsPage />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// ─── Title bar ───────────────────────────────────────────────────────────────

function TitleBar() {
  return (
    <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, WebkitAppRegion: "drag" } as React.CSSProperties}>
      <span style={{ fontSize: 13, fontWeight: 600, background: "linear-gradient(110deg,#a78bfa,#38bdf8,#34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>doppel</span>
      <div style={{ display: "flex", gap: 5, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {window.electronAPI?.isElectron && <>
          <WinBtn onClick={() => window.electronAPI!.minimize()}>
            <svg width="9" height="2" viewBox="0 0 9 2"><line x1="0.5" y1="1" x2="8.5" y2="1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
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
        { id: "clones",   label: "Clones",   icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M2 12c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
        { id: "settings", label: "Settings", icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.929 2.929l1.06 1.06M10.01 10.01l1.061 1.061M2.929 11.071l1.06-1.06M10.01 3.99l1.061-1.061" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
      ] as const).map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, padding: "9px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          background: "none", border: "none", cursor: "pointer",
          color: tab === t.id ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)",
          borderTop: `1.5px solid ${tab === t.id ? "rgba(255,255,255,0.30)" : "transparent"}`,
          transition: "all 120ms",
          fontFamily: "inherit",
        }}>
          {t.icon}
          <span style={{ fontSize: 10 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Clones Page ─────────────────────────────────────────────────────────────

function ClonesPage({ onOpenChat }: { onOpenChat: (c: Clone) => void }) {
  const { user: clerkUser } = useClerkAuth();
  const [view,     setView]     = useState<"mine" | "all">("mine");
  const [clones,   setClones]   = useState<Clone[]>([]);
  const [filtered, setFiltered] = useState<Clone[]>([]);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<Clone | null>(null);
  const [loading,  setLoading]  = useState(true);

  async function fetchClones(v: "mine" | "all") {
    setLoading(true);
    setClones([]); setFiltered([]);
    try {
      const s = await window.electronAPI?.getSettings();
      const url = s?.fastapiUrl ?? "http://localhost:8000";

      if (v === "mine") {
        // Use persisted userId from settings (saved on Clerk sign-in)
        // Fall back to live Clerk session token if userId not yet persisted
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
        setClones(list); setFiltered(list);
      } else {
        const res = await fetch(`${url}/marketplace?limit=80`);
        const data = await res.json();
        const list: Clone[] = (data.clones ?? data).map((c: any) => ({
          id: c.clone_id, handle: c.handle,
          name: c.display_name ?? c.name ?? c.handle,
          category: c.category,
          avatar_url: c.avatar_url ?? undefined,
        }));
        setClones(list); setFiltered(list);
      }
    } catch { setClones([]); setFiltered([]); } finally { setLoading(false); }
  }

  useEffect(() => { fetchClones(view); }, [view, clerkUser?.id]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? clones.filter(c => c.name.toLowerCase().includes(q) || (c.category ?? "").toLowerCase().includes(q)) : clones);
  }, [search, clones]);

  function launch() {
    if (!selected) return;
    window.electronAPI?.openPill({ id: selected.id, handle: selected.handle, name: selected.name, avatar_url: selected.avatar_url });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 8px" }}>
        {/* Mine / All toggle */}
        <div style={{ display: "flex", gap: 3, marginBottom: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: 3 }}>
          {(["mine", "all"] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setSearch(""); setSelected(null); }}
              style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "none", fontFamily: "inherit", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 120ms",
                background: view === v ? "rgba(255,255,255,0.09)" : "transparent",
                color: view === v ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.32)",
              }}>
              {v === "mine" ? "My clones" : "Marketplace"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "8px 12px", color: "rgba(255,255,255,0.75)", outline: "none", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"}
          onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {loading && <Spinner />}
        {!loading && view === "mine" && !clerkUser && (
          <div style={{ textAlign: "center", marginTop: 40, padding: "0 16px" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginBottom: 12 }}>Sign in to see your clones.</p>
            <button onClick={async () => { const c = await getClerk(); c.openSignIn(); }} style={btnStyle(false)}>
              Sign in with Doppel →
            </button>
          </div>
        )}
        {!loading && view === "mine" && clerkUser && filtered.length === 0 && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 30 }}>You haven&apos;t created any clones yet.</p>
        )}
        {!loading && view === "all" && filtered.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 30 }}>No clones found.</p>}
        {filtered.map(c => {
          const col = avatarColor(c.name), sel = selected?.id === c.id;
          const isMarket = view === "all";
          return (
            <div key={c.id}
              onClick={() => { if (!isMarket) setSelected(c); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, border: `1px solid ${sel ? `${col}50` : "rgba(255,255,255,0.06)"}`, background: sel ? `${col}12` : "rgba(255,255,255,0.02)", cursor: isMarket ? "default" : "pointer", transition: "all 120ms", opacity: isMarket ? 0.45 : 1 }}
              onMouseEnter={e => { if (!sel && !isMarket) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (!sel && !isMarket) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                {c.avatar_url
                  ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : c.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: sel ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                {c.category && <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.28)", textTransform: "capitalize" }}>{c.category}</p>}
              </div>
              {sel && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke={col} strokeWidth="1.3"/><path d="M4.5 7l2 2 3-3" stroke={col} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          );
        })}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "10px 14px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        {view === "all" ? (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.22)", textAlign: "center" }}>Marketplace is view-only on desktop</p>
        ) : selected ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onOpenChat(selected)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 120ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            >Chat →</button>
            <button onClick={launch}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "all 120ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
              title="Launch overlay pill"
            >Pill</button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.22)", textAlign: "center" }}>Select a clone above to begin</p>
        )}
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

interface QASlot { cloneId: string; cloneName: string; cloneHandle: string; }

function SettingsPage() {
  const { user: clerkUser, loaded: clerkLoaded } = useClerkAuth();
  const [fastapiUrl,   setFastapiUrl]   = useState("http://localhost:8000");
  const [openaiKey,    setOpenaiKey]    = useState("");
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
      if (s?.fastapiUrl) setFastapiUrl(s.fastapiUrl);
      if (s?.openaiKey)  setOpenaiKey(s.openaiKey);
      if (s?.quickAccess) {
        const slots = [...(s.quickAccess as (QASlot | null)[])];
        while (slots.length < 3) slots.push(null);
        setQaSlots(slots.slice(0, 3));
      }
      // Proactive nudges
      if (s?.proactiveEnabled)        setNudgeEnabled(true);
      if (s?.proactiveIntervalMinutes) setNudgeInterval(s.proactiveIntervalMinutes);

      // Voice call
      if (s?.voiceCallEnabled) setVcEnabled(true);
      if (s?.voiceCallTime)    setVcTime(s.voiceCallTime);

      // Fetch clones
      const url = s?.fastapiUrl ?? "http://localhost:8000";
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
          // Restore saved nudge clone
          if (s?.proactiveCloneId) {
            const found = list.find((c: Clone) => c.id === s.proactiveCloneId);
            if (found) setNudgeClone(found);
          }
          // Restore saved voice call clone
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

      {/* Quick Access — feature 6 */}
      <Section label="Quick Access  ·  Ctrl+Alt+1/2/3">
        {qaClones.length === 0 && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 10 }}>Sign in and save settings to configure.</p>
        )}
        {([0, 1, 2] as const).map(i => {
          const slot  = qaSlots[i];
          const label = `Ctrl+Alt+${i + 1}`;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, position: "relative" }}>
              {/* hotkey badge */}
              <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "monospace" }}>
                {label}
              </span>

              {/* Clone picker trigger */}
              <button
                onClick={() => setQaOpenIdx(qaOpenIdx === i ? null : i)}
                style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 8, border: `1px solid ${qaOpenIdx === i ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.09)"}`, background: qaOpenIdx === i ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 120ms" }}
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

              {/* Clear */}
              {slot && (
                <button onClick={() => setQaSlots(prev => prev.map((s, j) => j === i ? null : s))}
                  style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.28)", cursor: "pointer", flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </button>
              )}

              {/* Dropdown */}
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

      {/* Proactive Nudges — Feature 1 */}
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
                <button key={n} onClick={() => setNudgeInterval(n)} style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${nudgeInterval === n ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`, background: nudgeInterval === n ? "rgba(255,255,255,0.08)" : "transparent", color: nudgeInterval === n ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 100ms" }}>
                  {n}m
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Voice Call — Feature 5 */}
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
        <Field label="OpenAI API Key (for voice transcription)" value={openaiKey} onChange={setOpenaiKey} placeholder="sk-proj-…" password />
      </Section>

      {/* Connection */}
      <Section label="Connection">
        <Field label="Backend URL" value={fastapiUrl} onChange={setFastapiUrl} placeholder="http://localhost:8000" />
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
  transition: "all 120ms", textAlign: "left" as const,
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

function WinBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
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
      <div style={{ position: "absolute", top: 2, left: value ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: value ? "rgba(52,211,153,0.90)" : "rgba(255,255,255,0.40)", transition: "left 200ms, background 200ms" }} />
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
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 8, border: `1px solid ${open ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.09)"}`, background: "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 100ms" }}
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
