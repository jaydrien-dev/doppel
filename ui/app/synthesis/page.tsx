"use client";

import { useEffect, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CloneOption {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
  price_per_query: number;
  source?: "marketplace" | "org" | "own";
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
// Helpers
// ---------------------------------------------------------------------------
const CAT_COLORS: Record<string, string> = {
  business: "#1A73E8", engineering: "#7B1FA2", design: "#E91E63",
  marketing: "#F57C00", finance: "#2E7D32", legal: "#546E7A",
  healthcare: "#C2185B", education: "#F9A825", science: "#00838F", other: "#8E24AA",
};
function catColor(cat: string | null) { return CAT_COLORS[cat ?? "other"] ?? "#8E24AA"; }

// ---------------------------------------------------------------------------
// Clone chip
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
        padding: "6px 12px", borderRadius: 10,
        fontFamily: "inherit", fontSize: 12, fontWeight: 500,
        cursor: disabled && !selected ? "not-allowed" : "pointer",
        opacity: disabled && !selected ? 0.35 : 1,
        background: selected ? `color-mix(in srgb, ${color} 12%, transparent)` : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${selected ? color : "rgba(255,255,255,0.09)"}`,
        color: selected ? color : "rgba(255,255,255,0.55)",
        transition: "all 150ms ease",
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `color-mix(in srgb, ${color} 20%, transparent)`,
        color, fontSize: 9, fontWeight: 600,
      }}>
        {clone.display_name.charAt(0).toUpperCase()}
      </span>
      <span>{clone.display_name}</span>
      {clone.price_per_query > 0 && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{clone.price_per_query}cr</span>
      )}
      {selected && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ color }}>
          <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Query results
// ---------------------------------------------------------------------------
function QueryResults({ result }: { result: QueryResult }) {
  const [activeTab, setActiveTab] = useState<string>("synthesis");

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
      }}>
        {[
          { id: "synthesis", label: "Synthesis" },
          ...result.perspectives.map((p) => ({ id: p.clone_id, label: p.name.split(" ")[0] })),
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: "12px 14px", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer", background: "none",
              borderBottom: `2px solid ${activeTab === id ? "rgba(255,255,255,0.70)" : "transparent"}`,
              borderTop: "none", borderLeft: "none", borderRight: "none",
              color: activeTab === id ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
              marginBottom: -1, transition: "color 150ms ease",
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.25)", paddingBottom: 12 }}>
          {result.credits_used} credit{result.credits_used !== 1 ? "s" : ""} used
        </span>
      </div>

      <div style={{ padding: 24 }}>
        {activeTab === "synthesis" ? (
          <>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>Synthesised answer</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.75, margin: 0 }}>{result.synthesis}</p>
          </>
        ) : (() => {
          const p = result.perspectives.find((x) => x.clone_id === activeTab);
          if (!p) return null;
          const color = catColor(null);
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600,
                  background: `color-mix(in srgb, ${color} 20%, transparent)`, color, flexShrink: 0,
                }}>
                  {p.name.charAt(0)}
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>{p.name}</p>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                  {Math.round(p.confidence * 100)}% confidence
                </span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.75, margin: 0 }}>{p.response}</p>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deliberate results
// ---------------------------------------------------------------------------
function DeliberateResults({ result }: { result: DeliberateResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: 0 }}>
            Deliberation transcript
          </p>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{result.credits_used} credits used</span>
        </div>
        <div>
          {result.turns.map((turn, i) => {
            const color = catColor(null);
            const showHeader = i === 0 || result.turns[i - 1].name !== turn.name;
            return (
              <div key={i} style={{ padding: "14px 20px", borderTop: i !== 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                {showHeader && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 600,
                      background: `color-mix(in srgb, ${color} 20%, transparent)`, color, flexShrink: 0,
                    }}>
                      {turn.name.charAt(0)}
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 500, color, margin: 0 }}>{turn.name}</p>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Round {turn.round}</span>
                  </div>
                )}
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.65, paddingLeft: showHeader ? 0 : 28, margin: 0 }}>
                  {turn.message}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>Summary</p>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.70)", lineHeight: 1.75, margin: 0 }}>{result.summary}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
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
  const [planCredits, setPlanCredits] = useState<number | null>(null);
  const [boughtCredits, setBoughtCredits] = useState<number | null>(null);

  useEffect(() => {
    // Fetch all accessible clones: marketplace + org
    const fetches: Promise<CloneOption[]>[] = [
      fetch("/api/marketplace?limit=100")
        .then((r) => r.json())
        .then((d) => (d.clones ?? []).map((c: CloneOption) => ({ ...c, source: "marketplace" as const }))),
      fetch("/api/org/clones")
        .then((r) => r.json())
        .then((d) => (d.clones ?? []).map((c: CloneOption) => ({ ...c, source: "org" as const }))),
    ];

    Promise.allSettled(fetches).then((results) => {
      const seen = new Set<string>();
      const merged: CloneOption[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const c of r.value) {
            if (!seen.has(c.clone_id)) { seen.add(c.clone_id); merged.push(c); }
          }
        }
      }
      setClones(merged);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => { setPlanCredits(d.plan_credits ?? 0); setBoughtCredits(d.bought_credits ?? 0); })
      .catch(() => {});
  }, [user]);

  const filtered = clones.filter((c) =>
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    c.handle.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const maxSelected = mode === "deliberate" ? 2 : 5;
  const ready = selected.length >= 2 && selected.length <= maxSelected && message.trim();
  const totalCredits = (planCredits ?? 0) + (boughtCredits ?? 0);

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
        if (data.credits_used) {
          const used = data.credits_used;
          const planUsed = Math.min(planCredits ?? 0, used);
          setPlanCredits((p) => p !== null ? Math.max(0, p - planUsed) : p);
          setBoughtCredits((b) => b !== null ? Math.max(0, b - Math.max(0, used - planUsed)) : b);
        }
      } else {
        const res = await fetch("/api/synthesis/deliberate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clone_ids: selected, topic: message.trim(), rounds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Deliberation failed");
        setDeliberateResult(data);
        if (data.credits_used) {
          const used = data.credits_used;
          const planUsed = Math.min(planCredits ?? 0, used);
          setPlanCredits((p) => p !== null ? Math.max(0, p - planUsed) : p);
          setBoughtCredits((b) => b !== null ? Math.max(0, b - Math.max(0, used - planUsed)) : b);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div style={{
      minHeight: "100vh", background: "#080808",
      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
    }}>
      {/* Sticky nav */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 24px", height: 52,
        position: "sticky", top: 0,
        background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)", zIndex: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link href="/home" style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", textDecoration: "none" }}>
          ← Home
        </Link>
        <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>Synthesis</span>
        {(planCredits !== null || boughtCredits !== null) && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {(planCredits ?? 0) > 0 && (
              <span style={{ fontSize: 11, color: "rgba(96,165,250,0.65)" }}>{planCredits} plan</span>
            )}
            {(planCredits ?? 0) > 0 && (boughtCredits ?? 0) > 0 && (
              <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>·</span>
            )}
            {(boughtCredits ?? 0) > 0 && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{boughtCredits} cr</span>
            )}
            {totalCredits === 0 && (
              <Link href="/dashboard/credits" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}>get credits</Link>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 80px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ marginBottom: 4 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>Feature</p>
          <h1 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>Synthesis</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0, lineHeight: 1.6 }}>
            Ask 2–5 clones the same question in parallel, then get a unified synthesised answer. Or let two clones deliberate back and forth.
          </p>
        </div>

        {!isSignedIn ? (
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "48px 24px", textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>Sign in to use Synthesis</p>
            <SignInButton mode="modal">
              <button style={{
                padding: "9px 22px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit",
              }}>
                Sign in
              </button>
            </SignInButton>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div>
              <div style={{
                display: "inline-flex", gap: 3, padding: 3, borderRadius: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              }}>
                {(["query", "deliberate"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setSelected([]); setQueryResult(null); setDeliberateResult(null); }}
                    style={{
                      padding: "6px 16px", fontSize: 12, fontWeight: 500,
                      fontFamily: "inherit", borderRadius: 9, cursor: "pointer",
                      border: "1px solid transparent",
                      background: mode === m ? "rgba(255,255,255,0.08)" : "transparent",
                      borderColor: mode === m ? "rgba(255,255,255,0.10)" : "transparent",
                      color: mode === m ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
                      transition: "all 150ms ease",
                    }}
                  >
                    {m === "query" ? "Query all" : "Deliberate"}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 10, lineHeight: 1.6 }}>
                {mode === "query"
                  ? `Ask the same question to 2–5 clones simultaneously. Costs 1 credit per clone.`
                  : `Pick exactly 2 clones. They debate a topic for ${rounds} rounds. Costs ${rounds * 2} credits.`}
              </p>
            </div>

            {/* Clone picker */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.40)", margin: 0 }}>
                  Select clones{" "}
                  <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.25)" }}>
                    ({selected.length}/{maxSelected}{mode === "deliberate" ? ", exactly 2" : ""})
                  </span>
                </p>
                {selected.length > 0 && (
                  <button
                    onClick={() => setSelected([])}
                    style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input
                  placeholder="Search clones…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    fontSize: 12, color: "rgba(255,255,255,0.70)", fontFamily: "inherit",
                  }}
                />
              </div>
              <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {filtered.length === 0 && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>No clones found</p>
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
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                  {mode === "query" ? "Your question" : "Topic for deliberation"}
                </p>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  mode === "query"
                    ? "Should we raise a Series A right now, or wait two more quarters?"
                    : "Should startups focus on growth or profitability in year 1?"
                }
                rows={3}
                style={{
                  width: "100%", padding: "14px 16px",
                  fontSize: 13, color: "rgba(255,255,255,0.75)",
                  background: "transparent", border: "none", outline: "none",
                  resize: "none", lineHeight: 1.6, fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Rounds slider */}
            {mode === "deliberate" && (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", flexShrink: 0 }}>Rounds: {rounds}</p>
                <input
                  type="range" min={2} max={5} value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "rgba(255,255,255,0.50)" }}
                />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>{rounds * 2} credits</p>
              </div>
            )}

            {/* Submit */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={submit}
                disabled={!ready || loading || (mode === "deliberate" && selected.length !== 2)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                  fontFamily: "inherit", cursor: ready && !loading ? "pointer" : "not-allowed",
                  opacity: ready && !loading ? 1 : 0.45,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,255,255,0.80)", transition: "all 150ms",
                }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 12, height: 12, borderRadius: "50%",
                      border: "1.5px solid rgba(255,255,255,0.20)",
                      borderTopColor: "rgba(255,255,255,0.70)",
                      display: "inline-block",
                      animation: "synth-spin 0.7s linear infinite",
                    }} />
                    {mode === "query" ? "Querying…" : "Deliberating…"}
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2L2 5l5 3 5-3-5-3zM2 8l5 3 5-3M2 11l5 3 5-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                    {mode === "query"
                      ? `Synthesise (${selected.length} credit${selected.length !== 1 ? "s" : ""})`
                      : `Deliberate (${rounds * 2} credits)`}
                  </>
                )}
              </button>
              {!ready && !loading && (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>
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
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)" }}>
                <p style={{ fontSize: 13, color: "rgba(248,113,113,0.80)", margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Results */}
            {queryResult && <QueryResults result={queryResult} />}
            {deliberateResult && <DeliberateResults result={deliberateResult} />}
          </>
        )}
      </div>

      <style>{`@keyframes synth-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
