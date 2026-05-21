"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { MarketplaceActionBar } from "@/components/layout/MarketplaceActionBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BundleClone {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
  total_queries: number;
  avg_rating: number;
  rating_count: number;
  is_verified?: boolean;
}

interface BundleDetail {
  id: string;
  title: string;
  description: string | null;
  price_usd: number;
  queries_included: number;
  creator_name: string;
  creator_handle: string;
  clones: BundleClone[];
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const I = {
  check:  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevR:  <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  arrowS: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  star:   (filled: boolean) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill={filled ? "#FBBF24" : "none"}>
      <path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={filled ? "#F59E0B" : "#444"} strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  layers: <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  bolt:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" opacity="0.8"/></svg>,
};

// ---------------------------------------------------------------------------
// Category color map (matches marketplace)
// ---------------------------------------------------------------------------
const CAT_COLORS: Record<string, string> = {
  business:    "#1A73E8",
  engineering: "#7B1FA2",
  design:      "#E91E63",
  marketing:   "#F57C00",
  finance:     "#2E7D32",
  legal:       "#546E7A",
  healthcare:  "#C2185B",
  education:   "#F9A825",
  science:     "#00838F",
  other:       "#8E24AA",
};
function catColor(cat: string | null) { return CAT_COLORS[cat ?? "other"] ?? "#8E24AA"; }
function catLabel(cat: string | null) {
  const labels: Record<string, string> = { business: "Business", engineering: "Engineering", design: "Design", marketing: "Marketing", finance: "Finance", legal: "Legal", healthcare: "Healthcare", education: "Education", science: "Science", other: "Other" };
  return labels[cat ?? "other"] ?? "Other";
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------
function Stars({ rating, count }: { rating: number; count: number }) {
  const r = Math.round(rating);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[1,2,3,4,5].map((i) => <span key={i}>{I.star(i <= r)}</span>)}
      {count > 0 && (
        <>
          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.65)", marginLeft: 4 }}>{rating.toFixed(1)}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>({count.toLocaleString()})</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Billing radio option
// ---------------------------------------------------------------------------
function BillingOption({ active, label, onSelect }: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: 12,
        border: `1.5px solid ${active ? "#1A73E8" : "rgba(255,255,255,0.08)"}`,
        background: active ? "rgba(26,115,232,0.08)" : "rgba(255,255,255,0.02)",
        borderRadius: 12, cursor: "pointer",
        transition: "border-color 180ms, background 180ms",
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
        border: `1.5px solid ${active ? "#1A73E8" : "rgba(255,255,255,0.20)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1A73E8" }} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: active ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.55)" }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BundleDetailPage() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const { isSignedIn } = useUser();
  const [bundle, setBundle] = useState<BundleDetail | null>(null);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [billingType, setBillingType] = useState<"onetime" | "monthly">("onetime");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [detailRes, accessRes] = await Promise.all([
          fetch(`/api/marketplace/bundles/${bundleId}`),
          fetch(`/api/bundles/${bundleId}/access`),
        ]);
        const detail = await detailRes.json();
        const access = await accessRes.json();
        if (!detailRes.ok) throw new Error(detail.detail ?? "Not found");
        setBundle(detail);
        setHasPurchased(access.has_access === true);
      } catch {
        setError("Bundle not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bundleId]);

  async function purchase() {
    if (!isSignedIn) { setError("Sign in to purchase"); return; }
    setPurchasing(true); setError(null);
    try {
      const res = await fetch(`/api/bundles/${bundleId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "Checkout failed");
      window.location.href = d.checkout_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setPurchasing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ background: "#080808", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.50)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!bundle || error) {
    return (
      <div style={{ background: "#080808", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)" }}>{error ?? "Bundle not found"}</p>
        <Link href="/marketplace/bundles" className="mk-btn mk-btn--primary">Back to bundles</Link>
      </div>
    );
  }

  const monthlyPrice = bundle.price_usd > 0 ? Math.round(bundle.price_usd * 0.80) : 0;
  const totalQueries = bundle.clones.reduce((s, c) => s + c.total_queries, 0);
  const avgRating = bundle.clones.length > 0
    ? bundle.clones.reduce((s, c) => s + c.avg_rating, 0) / bundle.clones.length
    : 0;
  const totalRatingCount = bundle.clones.reduce((s, c) => s + c.rating_count, 0);

  return (
    <div style={{ background: "#080808", minHeight: "100vh", color: "#fff" }}>
      {/* Header */}
      <header className="mk-hdr mk-hdr--scrolled">
        <div className="mk-hdr__inner">
          <Link href="/" className="mk-hdr__brand">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
              <rect x="0.5" y="0.5" width="21" height="21" rx="6.5" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.14)" />
              <circle cx="8.88" cy="8.88" r="4.65" fill="rgba(255,255,255,0.95)" />
              <circle cx="13.96" cy="13.96" r="3.80" fill="rgba(255,255,255,0.52)" />
            </svg>
            doppel
          </Link>
          <div className="mk-hdr__crumbs">
            <span className="mk-hdr__crumb-sep">{I.chevR}</span>
            <Link href="/marketplace" className="mk-hdr__crumb">Marketplace</Link>
            <span className="mk-hdr__crumb-sep">{I.chevR}</span>
            <Link href="/marketplace/bundles" className="mk-hdr__crumb">Bundles</Link>
            <span className="mk-hdr__crumb-sep">{I.chevR}</span>
            <span className="mk-hdr__crumb mk-hdr__crumb--cur">{bundle.title}</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: "#111827", padding: "48px 32px 56px", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", position: "relative", zIndex: 1 }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            background: "rgba(255,255,255,0.10)",
            fontSize: 11, fontWeight: 500, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.7)",
            marginBottom: 16,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#A78BFA" }} />
            Knowledge bundle
          </div>

          <h1 style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 14px" }}>
            {bundle.title}
          </h1>
          {bundle.description && (
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: "0 0 22px", maxWidth: 560 }}>
              {bundle.description}
            </p>
          )}

          {/* Meta row */}
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            {totalRatingCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Stars rating={avgRating} count={totalRatingCount} />
              </span>
            )}
            <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 14 }}>{bundle.clones.length} clone{bundle.clones.length !== 1 ? "s" : ""}</span>
            {bundle.queries_included > 0 && (
              <>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 14 }}>{bundle.queries_included} queries included</span>
              </>
            )}
            {hasPurchased && (
              <>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 999,
                  background: "rgba(52,211,153,0.15)", color: "#34D399",
                }}>
                  {I.check} Purchased
                </span>
              </>
            )}
          </div>
        </div>

        {/* Monogram strip */}
        <div style={{ position: "absolute", right: -40, top: -10, display: "flex", gap: 12, opacity: 0.16, pointerEvents: "none" }}>
          {bundle.clones.slice(0, 5).map((c, i) => (
            <div key={c.clone_id} style={{
              width: 96, height: 96, borderRadius: 20,
              background: catColor(c.category),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 48, fontWeight: 600, color: "rgba(255,255,255,0.5)",
              transform: `translateY(${i * 12}px)`,
            }}>
              {c.display_name.charAt(0)}
            </div>
          ))}
        </div>
      </section>

      {/* Body */}
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32, alignItems: "start" }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Included clones */}
            <section style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", margin: 0 }}>
                  Included clones
                </p>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{bundle.clones.length} total</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {bundle.clones.map((c, i) => (
                  <Link
                    key={c.clone_id}
                    href={`/marketplace/${c.handle}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 20px", textDecoration: "none",
                      borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: catColor(c.category),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.45)",
                    }}>
                      {c.display_name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>{c.display_name}</p>
                        {c.is_verified && (
                          <span style={{ fontSize: 10, color: "#34D399", background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.20)", borderRadius: 999, padding: "1px 6px", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            {I.check} Verified
                          </span>
                        )}
                        {c.total_queries >= 500 && (
                          <span style={{ fontSize: 10, color: "#FBBF24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 999, padding: "1px 6px", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            {I.bolt} Top rated
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                        {catLabel(c.category)} · {c.total_queries.toLocaleString()} queries
                      </p>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.20)", display: "inline-flex", flexShrink: 0 }}>{I.chevR}</span>
                  </Link>
                ))}
                {bundle.clones.length === 0 && (
                  <p style={{ padding: "20px", fontSize: 13, color: "rgba(255,255,255,0.30)" }}>No clones added yet.</p>
                )}
              </div>
            </section>

            {/* How bundles work */}
            <section style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", margin: "0 0 16px" }}>
                How bundles work
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  ["01", "One purchase", "Buy the bundle, get queries pooled across every clone inside."],
                  ["02", "Use as needed", "Spend queries on whichever clone the question fits. No per-clone limits."],
                  ["03", "Never expires", "Queries never expire. Bundles renew at your option, not on a clock."],
                ].map(([n, t, d]) => (
                  <div key={n} style={{ padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                    <span style={{ fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", color: "rgba(255,255,255,0.25)" }}>{n}</span>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)", marginTop: 8 }}>{t}</div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, lineHeight: 1.5 }}>{d}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Synthesize CTA (if purchased) */}
            {hasPurchased && bundle.clones.length >= 2 && (
              <section style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 16, padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(167,139,250,0.50)", margin: "0 0 10px" }}>
                  Multi-clone synthesis
                </p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", margin: "0 0 14px", lineHeight: 1.5 }}>
                  Ask a single question to all {bundle.clones.length} clones and get a synthesised answer.
                </p>
                <Link
                  href={`/synthesis?clones=${bundle.clones.map(c => c.clone_id).join(",")}`}
                  className="mk-btn mk-btn--ghost mk-btn--sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {I.layers} Synthesise across bundle
                </Link>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 80 }}>

            {/* Price panel */}
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 16,
            }}>
              {/* Amount */}
              <div style={{ textAlign: "center", paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 40, fontWeight: 300, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.03em" }}>
                  {bundle.price_usd > 0 ? `$${bundle.price_usd.toFixed(0)}` : "Free"}
                </span>
                <span style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
                  {bundle.queries_included > 0 && `${bundle.queries_included} queries · `}{bundle.clones.length} clone{bundle.clones.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Billing options */}
              {bundle.price_usd > 0 && !hasPurchased && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <BillingOption active={billingType === "onetime"} label={`One-time · $${bundle.price_usd.toFixed(0)}`} onSelect={() => setBillingType("onetime")} />
                  {monthlyPrice > 0 && (
                    <BillingOption active={billingType === "monthly"} label={`Renew monthly · $${monthlyPrice}/mo`} onSelect={() => setBillingType("monthly")} />
                  )}
                </div>
              )}

              {/* CTA */}
              {hasPurchased ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "13px 0", background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.20)", borderRadius: 12,
                  color: "#34D399", fontSize: 13, fontWeight: 500,
                }}>
                  {I.check} Purchased
                </div>
              ) : (
                <button
                  onClick={purchase}
                  disabled={purchasing}
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 12,
                    background: "#1A73E8", border: "none", cursor: purchasing ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 500, fontFamily: "inherit",
                    color: "#fff", opacity: purchasing ? 0.7 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "opacity 180ms, background 180ms",
                  }}
                  onMouseEnter={(e) => { if (!purchasing) (e.currentTarget as HTMLElement).style.background = "#1765C9"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#1A73E8"; }}
                >
                  {purchasing ? "Redirecting…" : bundle.price_usd > 0 ? `Get bundle ${I.arrowS}` : "Get free"}
                </button>
              )}

              {error && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", textAlign: "center", margin: 0 }}>{error}</p>}

              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", margin: 0 }}>
                Secure via Stripe · Refund within 14 days
              </p>
            </div>

            {/* What's included */}
            <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", margin: "0 0 12px" }}>
                What&apos;s included
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                {[
                  bundle.queries_included > 0 ? `${bundle.queries_included} queries across all ${bundle.clones.length} clones` : `${bundle.clones.length} clones in this bundle`,
                  "Synthesise queries across the bundle",
                  "Source citations on every answer",
                  "Conversation export as Markdown",
                  "Queries never expire",
                ].map((text, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    <span style={{ color: "#34A853", marginTop: 1, flexShrink: 0 }}>{I.check}</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Stats strip */}
            {totalQueries > 0 && (
              <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "14px 18px", display: "flex", justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.70)", margin: 0 }}>{totalQueries.toLocaleString()}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>Total queries</p>
                </div>
                {avgRating > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 18, fontWeight: 500, color: "#FBBF24", margin: 0 }}>{avgRating.toFixed(1)}</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>Avg rating</p>
                  </div>
                )}
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.70)", margin: 0 }}>{bundle.clones.length}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>Clones</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      <MarketplaceActionBar />
    </div>
  );
}
