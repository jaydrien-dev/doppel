"use client";

import { useEffect, useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import Link from "next/link";

// 1 credit = $0.05 (100 credits = $5, the smallest pack)
const CREDIT_TO_USD = 0.05;
const PLATFORM_CUT = 0.20;
const CREATOR_RATE = 1 - PLATFORM_CUT;
const MIN_PAYOUT_CREDITS = 500; // $25 minimum

interface EarningsData {
  display_name: string;
  is_listed: boolean;
  total_queries: number;
  total_earnings_usd: number;
  price_per_query: number;
  avg_rating: number;
  rating_count: number;
  query_timeline: { day: string; queries: number }[];
}

function MiniBarChart({ data }: { data: { day: string; queries: number }[] }) {
  if (!data.length) return <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>No query data yet.</p>;
  const max = Math.max(...data.map((d) => d.queries), 1);
  const last30 = data.slice(-30);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
      {last30.map((d, i) => (
        <div key={i} title={`${d.day}: ${d.queries}`}
          style={{
            flex: 1, borderRadius: 3,
            background: "rgba(52,211,153,0.22)",
            height: `${Math.max(4, (d.queries / max) * 100)}%`,
            transition: "background 180ms ease", cursor: "default",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(52,211,153,0.45)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(52,211,153,0.22)"; }}
        />
      ))}
    </div>
  );
}

// Clone picker (same pattern as deploy/test pages)
const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function deriveColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function EarningsPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<EarningsData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [payoutState, setPayoutState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  useEffect(() => {
    if (!clone?.clone_id) return;
    setFetching(true);
    setData(null);
    fetch(`/api/dashboard/earnings?clone_id=${clone.clone_id}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [clone?.clone_id]);

  if (isLoading) return <LoadingSpinner />;
  if (clones.length === 0) {
    return (
      <div className="db-page">
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>Get started →</a>
        </p>
      </div>
    );
  }

  // Credits earned = total_earnings_usd / CREDIT_TO_USD (reverses platform calculation)
  const creditsEarned = data ? Math.round(data.total_earnings_usd / CREDIT_TO_USD) : 0;
  const usdValue = creditsEarned * CREDIT_TO_USD;
  const canPayout = creditsEarned >= MIN_PAYOUT_CREDITS;

  async function requestPayout() {
    if (!clone || payoutState === "loading") return;
    setPayoutState("loading");
    setPayoutError(null);
    try {
      const res = await fetch("/api/credits/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: clone.clone_id, credits: creditsEarned }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setPayoutError(d.detail ?? d.error ?? "Failed to initiate payout.");
        setPayoutState("error");
      } else {
        setPayoutState("done");
      }
    } catch {
      setPayoutError("Network error. Try again.");
      setPayoutState("error");
    }
  }

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 20, "--page-accent": "#34A853" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Marketplace</p>
          <h1 className="db-h1">Earnings</h1>
        </div>
      </div>

      {/* Clone picker (only shown when 2+ clones) */}
      {clones.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {clones.map((c) => {
            const col = deriveColor(c.display_name);
            const active = c.clone_id === (clone?.clone_id);
            return (
              <button key={c.clone_id} onClick={() => setSelectedId(c.clone_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 12px 6px 8px", borderRadius: 10,
                  border: `1px solid ${active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`,
                  background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "#fff", overflow: "hidden", flexShrink: 0 }}>
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : c.display_name[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: active ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.45)" }}>
                  {c.listing_title || c.display_name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Not listed notice */}
      {data && !data.is_listed && (
        <div className="card card--amber" style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(255,255,255,0.30)", flexShrink: 0, marginTop: 1 }}>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>Your clone isn&apos;t listed on the marketplace.</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              Enable listing in{" "}
              <Link href="/dashboard/clones" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                My Clones
              </Link>{" "}
              to start earning.
            </p>
          </div>
        </div>
      )}

      {fetching ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[0,1,2].map(i => <div key={i} className="card" style={{ height: 90 }} />)}
        </div>
      ) : data ? (
        <>
          {/* Balance hero */}
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.30)", marginBottom: 6 }}>Credit balance</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 40, fontWeight: 300, color: "rgba(255,255,255,0.90)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {creditsEarned.toLocaleString()}
                </span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.40)" }}>credits</span>
                <span style={{ fontSize: 16, color: "rgba(52,211,153,0.70)", fontWeight: 500 }}>
                  ≈ ${usdValue.toFixed(2)}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>
                1 credit = ${CREDIT_TO_USD.toFixed(2)} · {Math.round(PLATFORM_CUT * 100)}% platform fee already deducted
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
              {payoutState === "done" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.20)" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 4" stroke="rgba(52,211,153,0.80)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: 12, color: "rgba(52,211,153,0.80)", fontWeight: 500 }}>Payout requested</span>
                </div>
              ) : (
                <button
                  onClick={requestPayout}
                  disabled={!canPayout || payoutState === "loading"}
                  style={{
                    padding: "8px 20px", borderRadius: 10,
                    border: `1px solid ${canPayout ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.08)"}`,
                    background: canPayout ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)",
                    color: canPayout ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.25)",
                    fontSize: 13, fontWeight: 500, cursor: canPayout ? "pointer" : "not-allowed",
                    fontFamily: "inherit", transition: "all 150ms",
                  }}
                >
                  {payoutState === "loading" ? "Processing…" : "Cash out"}
                </button>
              )}
              {!canPayout && payoutState !== "done" && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", textAlign: "right" }}>
                  {MIN_PAYOUT_CREDITS - creditsEarned} more credits needed<br/>
                  (min. {MIN_PAYOUT_CREDITS} · ${(MIN_PAYOUT_CREDITS * CREDIT_TO_USD).toFixed(0)})
                </p>
              )}
              {payoutState === "error" && payoutError && (
                <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", textAlign: "right", maxWidth: 200 }}>{payoutError}</p>
              )}
            </div>
          </div>

          {/* 3-col stat strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <div className="stat-tile stat-tile--green">
              <p className="stat-tile__value">{data.total_queries.toLocaleString()}</p>
              <p className="stat-tile__label">Total queries</p>
              <p className="stat-tile__sub">
                {data.price_per_query > 0 ? `at ${Math.round(data.price_per_query)} cr/query` : "Free listing"}
              </p>
            </div>
            <div className="stat-tile stat-tile--blue">
              <p className="stat-tile__value">
                {Math.round(data.price_per_query * CREATOR_RATE)} cr
              </p>
              <p className="stat-tile__label">You earn per query</p>
              <p className="stat-tile__sub">After {Math.round(PLATFORM_CUT * 100)}% platform fee</p>
            </div>
            <div className="stat-tile stat-tile--amber">
              <p className="stat-tile__value" style={{ fontSize: 22 }}>
                {data.rating_count > 0 ? data.avg_rating.toFixed(1) : "—"}
              </p>
              <p className="stat-tile__label">Rating</p>
              <p className="stat-tile__sub">
                {data.rating_count > 0 ? `${data.rating_count} reviews` : "No reviews yet"}
              </p>
            </div>
          </div>

          {/* Query volume */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 className="db-h3">Query volume</h3>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>Last 30 days</p>
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                {data.query_timeline.reduce((s, d) => s + d.queries, 0)} this month
              </span>
            </div>
            <MiniBarChart data={data.query_timeline} />
          </div>

          {/* Revenue breakdown */}
          {data.price_per_query > 0 && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 16 }}>Per-query breakdown</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Row label="Price per query" value={`${Math.round(data.price_per_query)} cr`} />
                <Row label={`Platform fee (${Math.round(PLATFORM_CUT * 100)}%)`} value={`–${Math.round(data.price_per_query * PLATFORM_CUT * 10) / 10} cr`} dim />
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                  <Row label="You earn per query" value={`${Math.round(data.price_per_query * CREATOR_RATE * 10) / 10} cr · $${(Math.round(data.price_per_query * CREATOR_RATE) * CREDIT_TO_USD).toFixed(3)}`} bright />
                </div>
              </div>
            </div>
          )}

          {data.is_listed && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link href={`/marketplace/${clone?.handle}`} target="_blank" className="btn">
                View marketplace listing ↗
              </Link>
              <Link href="/dashboard/clones" style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}>
                Edit clones →
              </Link>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, dim, bright }: { label: string; value: string; dim?: boolean; bright?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: dim ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ color: bright ? "rgba(255,255,255,0.80)" : dim ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.60)" }}>{value}</span>
    </div>
  );
}
