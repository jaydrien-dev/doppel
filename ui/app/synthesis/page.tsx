"use client";

import { useEffect, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { MarketplaceActionBar } from "@/components/layout/MarketplaceActionBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CloneOption {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
  price_per_query: number;
}

interface Perspective {
  clone_id: string;
  name: string;
  response: string;
  confidence: number;
}

interface Turn {
  clone_id: string;
  name: string;
  message: string;
  round: number;
}

interface QueryResult {
  perspectives: Perspective[];
  synthesis: string;
  credits_used: number;
}

interface DeliberateResult {
  turns: Turn[];
  summary: string;
  credits_used: number;
}

// ---------------------------------------------------------------------------
// Category color map
// ---------------------------------------------------------------------------
const CAT_COLORS: Record<string, string> = {
  business: "#1A73E8", engineering: "#7B1FA2", design: "#E91E63",
  marketing: "#F57C00", finance: "#2E7D32", legal: "#546E7A",
  healthcare: "#C2185B", education: "#F9A825", science: "#00838F", other: "#8E24AA",
};
function catColor(cat: string | null) { return CAT_COLORS[cat ?? "other"] ?? "#8E24AA"; }

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const I = {
  chevR:  <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  check:  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  layers: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  dot2:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="3" cy="3.5" r="2" fill="currentColor" opacity="0.8"/><circle cx="8" cy="7" r="1.6" fill="currentColor" opacity="0.5"/></svg>,
};

// ---------------------------------------------------------------------------
// Clone chip (light)
// ---------------------------------------------------------------------------
function CloneChip({ clone, selected, onToggle, disabled }: {
  clone: CloneOption; selected: boolean; onToggle: () => void; disabled: boolean;
}) {
  const color = catColor(clone.category);
  return (
    <button
      onClick={onToggle}
      disabled={disabled && !selected}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "7px 12px", borderRadius: 10,
        fontFamily: "inherit", fontSize: 13, fontWeight: 500,
        cursor: disabled && !selected ? "not-allowed" : "pointer",
        opacity: disabled && !selected ? 0.40 : 1,
        background: selected ? `color-mix(in srgb, ${color} 10%, transparent)` : "#F8F9FA",
        border: `1.5px solid ${selected ? color : "rgba(0,0,0,0.08)"}`,
        color: selected ? color : "#5F6368",
        transition: "all 180ms ease",
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: color, color: "rgba(255,255,255,0.35)",
        fontSize: 10, fontWeight: 600,
      }}>
        {clone.display_name.charAt(0).toUpperCase()}
      </span>
      <span>{clone.display_name}</span>
      {clone.price_per_query > 0 && (
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>{clone.price_per_query}cr</span>
      )}
      {selected && (
        <span style={{ color }}>{I.check}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Query results (light)
// ---------------------------------------------------------------------------
function QueryResults({ result }: { result: QueryResult }) {
  const [activeTab, setActiveTab] = useState<string>("synthesis");

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "0 20px", borderBottom: "1px solid #F1F3F4",
        background: "#FAFAFA",
      }}>
        {[
          { id: "synthesis", label: "Synthesis" },
          ...result.perspectives.map((p) => ({ id: p.clone_id, label: p.name.split(" ")[0] })),
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: "12px 14px", fontSize: 13, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer", background: "none",
              borderBottom: `2px solid ${activeTab === id ? "#1A73E8" : "transparent"}`,
              borderTop: "none", borderLeft: "none", borderRight: "none",
              color: activeTab === id ? "#1A73E8" : "#5F6368",
              marginBottom: -1,
              transition: "color 150ms ease",
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF", paddingBottom: 12 }}>
          {result.credits_used} credit{result.credits_used !== 1 ? "s" : ""} used
        </span>
      </div>

      <div style={{ padding: 24 }}>
        {activeTab === "synthesis" ? (
          <>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 14 }}>Synthesised answer</p>
            <p style={{ fontSize: 14, color: "#1D1D1F", lineHeight: 1.7, margin: 0 }}>{result.synthesis}</p>
          </>
        ) : (() => {
          const p = result.perspectives.find((x) => x.clone_id === activeTab);
          if (!p) return null;
          const color = catColor(null);
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600,
                  background: color, color: "rgba(255,255,255,0.35)", flexShrink: 0,
                }}>
                  {p.name.charAt(0)}
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F", margin: 0 }}>{p.name}</p>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#9CA3AF" }}>
                  {Math.round(p.confidence * 100)}% confidence
                </span>
              </div>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0 }}>{p.response}</p>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deliberate results (light)
// ---------------------------------------------------------------------------
function DeliberateResults({ result }: { result: DeliberateResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: "1px solid #F1F3F4", background: "#FAFAFA",
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", margin: 0 }}>
            Deliberation transcript
          </p>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{result.credits_used} credits used</span>
        </div>
        <div>
          {result.turns.map((turn, i) => {
            const color = catColor(null);
            const showHeader = i === 0 || result.turns[i - 1].name !== turn.name;
            return (
              <div
                key={i}
                style={{ padding: "14px 20px", borderTop: i !== 0 ? "1px solid #F1F3F4" : "none" }}
              >
                {showHeader && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 600,
                      background: color, color: "rgba(255,255,255,0.35)", flexShrink: 0,
                    }}>
                      {turn.name.charAt(0)}
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 500, color, margin: 0 }}>{turn.name}</p>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF" }}>Round {turn.round}</span>
                  </div>
                )}
                <p style={{
                  fontSize: 13, color: "#374151", lineHeight: 1.65,
                  paddingLeft: showHeader ? 0 : 30, margin: 0,
                }}>
                  {turn.message}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 12 }}>Summary</p>
        <p style={{ fontSize: 14, color: "#1D1D1F", lineHeight: 1.7, margin: 0 }}>{result.summary}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SynthesisPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const [clones, setClones] = useState<CloneOption[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"query" | "deliberate">("query");
  const [message, setMessage] = useState("");
  const [rounds, setRounds] = useState(3);
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [deliberateResult, setDeliberateResult] = useState<DeliberateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/marketplace?limit=50")
      .then((r) => r.json())
      .then((d) => setClones(d.clones ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      fetch("/api/credits/balance")
        .then((r) => r.json())
        .then((d) => setCredits(d.credits_remaining ?? 0))
        .catch(() => {});
    }
  }, [user]);

  const filtered = clones.filter((c) =>
    c.display_name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const maxSelected = mode === "deliberate" ? 2 : 5;
  const ready = selected.length >= 2 && selected.length <= maxSelected && message.trim();

  async function submit() {
    if (!ready || loading || (mode === "deliberate" && selected.length !== 2)) return;
    setLoading(true);
    setError(null);
    setQueryResult(null);
    setDeliberateResult(null);
    try {
      if (mode === "query") {
        const res = await fetch("/api/synthesis/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clone_ids: selected, message: message.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Query failed");
        setQueryResult(data);
        if (data.credits_used) setCredits((c) => c !== null ? c - data.credits_used : c);
      } else {
        const res = await fetch("/api/synthesis/deliberate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clone_ids: selected, topic: message.trim(), rounds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Deliberation failed");
        setDeliberateResult(data);
        if (data.credits_used) setCredits((c) => c !== null ? c - data.credits_used : c);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header className="mk-hdr mk-hdr--scrolled">
        <div className="mk-hdr__inner">
          <Link href="/" className="mk-hdr__brand">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
              <rect x="0.5" y="0.5" width="21" height="21" rx="6.5" fill="rgba(26,115,232,0.08)" stroke="rgba(26,115,232,0.22)" />
              <circle cx="8.88" cy="8.88" r="4.65" fill="#1A73E8" fillOpacity="0.90" />
              <circle cx="13.96" cy="13.96" r="3.80" fill="#1A73E8" fillOpacity="0.50" />
            </svg>
            doppel
          </Link>
          <div className="mk-hdr__crumbs">
            <span className="mk-hdr__crumb-sep">{I.chevR}</span>
            <Link href="/marketplace" className="mk-hdr__crumb">Marketplace</Link>
            <span className="mk-hdr__crumb-sep">{I.chevR}</span>
            <span className="mk-hdr__crumb mk-hdr__crumb--cur">Synthesis</span>
          </div>
          <div className="mk-hdr__actions">
            {credits !== null && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 9999,
                background: "rgba(26,115,232,0.08)", border: "1px solid rgba(26,115,232,0.15)",
                fontSize: 12, fontWeight: 500, color: "#1A73E8",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1A73E8", display: "inline-block" }} />
                {credits} credits
              </div>
            )}
            {!isSignedIn && (
              <SignInButton mode="modal">
                <button className="mk-btn mk-btn--primary mk-btn--sm">Sign in</button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>

      {/* Hero strip */}
      <section style={{
        background: "#0F1B3D", padding: "40px 24px 48px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 70%)",
        }} />
        <div style={{ maxWidth: 680, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
            {I.layers}
            Multi-clone synthesis
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 300, color: "#fff", margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            Ask multiple clones.<br />Get one unified answer.
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.6 }}>
            Query 2–5 experts in parallel, then synthesise their perspectives into one coherent view. Costs 1 credit per clone.
          </p>
        </div>
      </section>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 100px", display: "flex", flexDirection: "column", gap: 16 }}>

        {!isSignedIn ? (
          <div style={{
            background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20,
            padding: "56px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(26,115,232,0.08)", color: "#1A73E8",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              {I.layers}
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F", marginBottom: 6 }}>Sign in to use Synthesis</p>
            <p style={{ fontSize: 13, color: "#5F6368", marginBottom: 24 }}>Synthesis requires credits. Sign in to get started.</p>
            <SignInButton mode="modal">
              <button className="mk-btn mk-btn--primary">Sign in</button>
            </SignInButton>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div>
              <div style={{
                display: "inline-flex", gap: 3, padding: 3, borderRadius: 12,
                background: "#F1F3F4", border: "1px solid rgba(0,0,0,0.06)",
              }}>
                {(["query", "deliberate"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setSelected([]); setQueryResult(null); setDeliberateResult(null); }}
                    style={{
                      padding: "7px 16px", fontSize: 13, fontWeight: 500,
                      fontFamily: "inherit", borderRadius: 9, cursor: "pointer",
                      border: "none",
                      background: mode === m ? "#fff" : "transparent",
                      color: mode === m ? "#1D1D1F" : "#5F6368",
                      boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 180ms ease",
                    }}
                  >
                    {m === "query" ? "Query all" : "Deliberate"}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "#5F6368", marginTop: 10, lineHeight: 1.6 }}>
                {mode === "query"
                  ? "Ask the same question to 2–5 clones. Get individual perspectives plus a synthesised answer. Costs 1 credit per clone."
                  : `Pick exactly 2 clones and give them a topic. They debate back and forth for ${rounds} rounds. Costs ${rounds * 2} credits.`}
              </p>
            </div>

            {/* Clone picker */}
            <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 16px", borderBottom: "1px solid #F1F3F4", background: "#FAFAFA",
              }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#5F6368", margin: 0 }}>
                  Select clones{" "}
                  <span style={{ fontWeight: 400, color: "#9CA3AF" }}>
                    ({selected.length}/{maxSelected}{mode === "deliberate" ? ", exactly 2" : ""})
                  </span>
                </p>
                {selected.length > 0 && (
                  <button
                    onClick={() => setSelected([])}
                    style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #F1F3F4", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#9CA3AF", display: "inline-flex" }}>{I.search}</span>
                <input
                  placeholder="Search clones…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    fontSize: 13, color: "#1D1D1F", fontFamily: "inherit",
                  }}
                />
              </div>
              <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 7, maxHeight: 200, overflowY: "auto" }}>
                {filtered.length === 0 && (
                  <p style={{ fontSize: 12, color: "#9CA3AF" }}>No clones found</p>
                )}
                {filtered.map((c) => (
                  <CloneChip
                    key={c.clone_id}
                    clone={c}
                    selected={selected.includes(c.clone_id)}
                    onToggle={() => toggle(c.clone_id)}
                    disabled={selected.length >= maxSelected}
                  />
                ))}
              </div>
            </div>

            {/* Question / topic */}
            <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ padding: "11px 16px", borderBottom: "1px solid #F1F3F4", background: "#FAFAFA" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#5F6368", margin: 0 }}>
                  {mode === "query" ? "Your question" : "Topic for deliberation"}
                </p>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  mode === "query"
                    ? "Should we raise a Series A right now, or wait two more quarters?"
                    : "Should startups focus on growth or profitability?"
                }
                rows={3}
                style={{
                  width: "100%", padding: "14px 16px",
                  fontSize: 13, color: "#1D1D1F",
                  background: "transparent", border: "none", outline: "none",
                  resize: "none", lineHeight: 1.6, fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Rounds slider */}
            {mode === "deliberate" && (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <p style={{ fontSize: 12, color: "#5F6368", flexShrink: 0 }}>Rounds: {rounds}</p>
                <input
                  type="range" min={2} max={5} value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#1A73E8" }}
                />
                <p style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>{rounds * 2} credits</p>
              </div>
            )}

            {/* Submit */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={submit}
                disabled={!ready || loading || (mode === "deliberate" && selected.length !== 2)}
                className="mk-btn mk-btn--primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 12, height: 12, borderRadius: "50%",
                      border: "1.5px solid rgba(255,255,255,0.30)",
                      borderTopColor: "rgba(255,255,255,0.90)",
                      display: "inline-block",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    {mode === "query" ? "Querying…" : "Deliberating…"}
                  </>
                ) : (
                  <>
                    {I.dot2}
                    {mode === "query"
                      ? `Synthesise (${selected.length} credit${selected.length !== 1 ? "s" : ""})`
                      : `Deliberate (${rounds * 2} credits)`}
                  </>
                )}
              </button>
              {!ready && !loading && (
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {selected.length < 2
                    ? "Select at least 2 clones"
                    : mode === "deliberate" && selected.length !== 2
                    ? "Select exactly 2 clones"
                    : "Enter a question"}
                </span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FFF1F2", border: "1px solid rgba(220,38,38,0.20)" }}>
                <p style={{ fontSize: 13, color: "#DC2626", margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Results */}
            {queryResult && <QueryResults result={queryResult} />}
            {deliberateResult && <DeliberateResults result={deliberateResult} />}
          </>
        )}
      </div>

      <MarketplaceActionBar />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
