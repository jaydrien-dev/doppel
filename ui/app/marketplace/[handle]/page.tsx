"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { MarketplaceActionBar } from "@/components/layout/MarketplaceActionBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MarketplaceCloneDetail {
  clone_id: string;
  display_name: string;
  listing_title?: string;
  handle: string;
  category: string | null;
  listing_description: string | null;
  price_per_query: number;
  total_queries: number;
  total_earnings_usd: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  is_verified?: boolean;
  verified_at?: string;
  avatar_url?: string | null;
  listing_banner_url?: string | null;
  memory_stats: { episodic: number; semantic: number; procedural: number };
  recent_ratings: { rating: number; review_text: string | null; created_at: string }[];
}

interface CreditPack { id: string; credits: number; price_usd: number; label: string }

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
const I = {
  check:  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrow:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowS: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevR:  <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  heart:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13.5s-5-3-5-7a2.7 2.7 0 015-1.5A2.7 2.7 0 0113 6.5c0 4-5 7-5 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  share:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 11V2M8 2L5 5M8 2l3 3M3 9v4a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  more:   <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>,
  shield: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L3 3.5v4c0 3 2 5.5 5 7 3-1.5 5-4 5-7v-4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M6 8l1.5 1.5L10.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  source: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 013 13V3a.5.5 0 010-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9 2.5V5h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  clock:  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  brain:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 4a2 2 0 014 0c0 .5-.2 1-.5 1.3.6.5 1 1.3 1 2.2 0 .5-.1 1-.3 1.4.2.3.3.7.3 1.1a2 2 0 11-3 1.7c-.3.2-.6.3-1 .3a2 2 0 01-2-2 2 2 0 01.3-1.1 2.4 2.4 0 01-.3-1.3 2.5 2.5 0 011-2C4.2 5 4 4.5 4 4a2 2 0 011-1.7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  sparkle:<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/></svg>,
  msg:    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0112 4v4a1.5 1.5 0 01-1.5 1.5H6L3 12V9.5H2.5A.5.5 0 012 9V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  warn:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4.5v3M7 9.5v.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
};

// ---------------------------------------------------------------------------
// Category config (no emoji)
// ---------------------------------------------------------------------------
const CATS: Record<string, { label: string; color: string; glyph: React.ReactNode }> = {
  business:    { label: "Business",    color: "#1A73E8", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><rect x="2" y="4.5" width="8" height="5.5" rx="0.8" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.5V3.4a1 1 0 011-1h1a1 1 0 011 1v1.1" stroke="currentColor" strokeWidth="1.2"/></svg> },
  engineering: { label: "Engineering", color: "#7B1FA2", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M2.5 9.5l1-1M8.5 3.5l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
  design:      { label: "Design",      color: "#E91E63", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg> },
  marketing:   { label: "Marketing",   color: "#F57C00", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 8V4l7-2v8L2 8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 8h2v2H3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  finance:     { label: "Finance",     color: "#2E7D32", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 9.5l3-3 2 2 3-4M10 4.5V2H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  legal:       { label: "Legal",       color: "#546E7A", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M6 1.5v9M2 4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 4l-1 4h2zM9 4l-1 4h2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg> },
  healthcare:  { label: "Healthcare",  color: "#C2185B", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  education:   { label: "Education",   color: "#F9A825", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 5l4-2 4 2-4 2zM3 6v2c0 .5 1.3 1.5 3 1.5s3-1 3-1.5V6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  science:     { label: "Science",     color: "#00838F", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M5 2h2v3.5l2.5 4.5a1 1 0 01-.9 1.5H3.4a1 1 0 01-.9-1.5L5 5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  other:       { label: "Other",       color: "#8E24AA", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.2"/></svg> },
};

const SAMPLE_QUESTIONS: Record<string, string[]> = {
  business:    ["What's your approach to building company culture?", "How do you handle difficult stakeholder conversations?", "What's the most important metric you track?"],
  engineering: ["How do you approach system design decisions?", "What's your debugging process for hard bugs?", "How do you balance speed vs correctness?"],
  design:      ["How do you handle design-engineering conflicts?", "What's your process for user research?", "How do you know when a design is done?"],
  marketing:   ["How do you think about positioning a new product?", "What's your framework for a go-to-market launch?", "How do you measure brand awareness?"],
  finance:     ["How do you build a 3-year financial model?", "What metrics matter most at seed stage?", "How do you think about burn rate vs growth?"],
  default:     ["What do you know best?", "What would you advise a beginner in your field?", "What's the most important lesson you've learned?"],
};

// ---------------------------------------------------------------------------
// Stars (light surface)
// ---------------------------------------------------------------------------
function Stars({
  rating, count, interactive = false, onRate,
}: {
  rating: number; count?: number; interactive?: boolean; onRate?: (r: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const display = interactive ? (hovered || rating) : rating;
  const r = Math.round(display);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
      <span style={{ display: "inline-flex" }}>
        {[1,2,3,4,5].map((i) => (
          <button
            key={i}
            disabled={!interactive}
            onClick={() => onRate?.(i)}
            onMouseEnter={() => interactive && setHovered(i)}
            onMouseLeave={() => interactive && setHovered(0)}
            style={{ background: "none", border: "none", padding: 0, cursor: interactive ? "pointer" : "default", display: "inline-flex" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill={i <= r ? "#FBBF24" : "none"}>
              <path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={i <= r ? "#F59E0B" : "#D1D5DB"} strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}
      </span>
      {!interactive && count !== undefined && count > 0 && (
        <>
          <span style={{ fontWeight: 600, color: "#1D1D1F", fontVariantNumeric: "tabular-nums" }}>{rating.toFixed(1)}</span>
          <span style={{ color: "#9CA3AF" }}>({count.toLocaleString()})</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Memory tile with count-up
// ---------------------------------------------------------------------------
function MemTile({ label, count, total, barColor }: { label: string; count: number; total: number; barColor: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 5);
      setV(Math.round(count * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count]);
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mem-tile">
      <div className="mem-tile__count">{v.toLocaleString()}</div>
      <div className="mem-tile__label">{label}</div>
      <div className="mem-tile__bar">
        <span style={{ width: `${pct}%`, background: barColor }}></span>
      </div>
      <div className="mem-tile__pct">{pct}% of knowledge base</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price card (credits-based)
// ---------------------------------------------------------------------------
function PriceCard({ clone, chatUrl, credits, canAfford, onBuyCredits }: {
  clone: MarketplaceCloneDetail;
  chatUrl: string;
  credits: number | null;
  canAfford: boolean;
  onBuyCredits: () => void;
}) {
  const color = CATS[clone.category ?? "other"]?.color ?? "#1A73E8";
  const isFree = clone.price_per_query === 0;
  const base = Math.round(clone.price_per_query);
  const displayName = clone.listing_title || clone.display_name;
  const ctaDisabled = !isFree && !canAfford;

  const tiers = [
    { label: "Fast",     cost: base,      hint: "Quick answer" },
    { label: "Pro",      cost: base * 3,  hint: "Scratchpad reasoning" },
    { label: "Extended", cost: base * 8,  hint: "Deep thinking" },
  ];

  return (
    <div className="price-card" style={{ "--clone-color": color } as React.CSSProperties}>
      {isFree ? (
        <div className="price-card__amount">
          <span className="price-card__amount__big price-card__amount__big--free">Free</span>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 10 }}>
            Credits per query
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tiers.map((t) => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", background: "#F8F9FA", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10 }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>{t.label}</span>
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>{t.hint}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{t.cost} cr</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isFree && credits !== null && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 12, color: "#9CA3AF", marginBottom: 12,
          padding: "8px 12px", background: "#F8F9FA", borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.06)",
        }}>
          <span>Your balance</span>
          <span style={{ fontWeight: 500, color: canAfford ? "#1D1D1F" : "#EF4444" }}>
            {credits} cr
          </span>
        </div>
      )}

      {!isFree && credits !== null && !canAfford && (
        <div className="credits-warn" style={{ marginBottom: 14 }}>
          {I.warn}
          <span>
            Need {base} cr minimum.{" "}
            <button onClick={onBuyCredits} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.85)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: "inherit" }}>
              Buy credits
            </button>
          </span>
        </div>
      )}

      <ul className="price-card__list">
        <li>{I.check} Full answer with cited sources</li>
        <li>{I.check} Confidence score included</li>
        <li>{I.check} Quiet refund if unsatisfied</li>
      </ul>

      <Link
        href={ctaDisabled ? "#" : chatUrl}
        className={`price-card__cta${ctaDisabled ? " price-card__cta--disabled" : ""}`}
      >
        Ask {displayName.split(" ")[0]} {I.arrow}
      </Link>

      <div className="price-card__guarantee">
        {I.shield}
        <div>
          <strong style={{ display: "block", color: "#1D1D1F", fontWeight: 500 }}>Quiet refund</strong>
          Unhappy with an answer? Refund in one tap, no review required.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seller card
// ---------------------------------------------------------------------------
function SellerCard({ clone }: { clone: MarketplaceCloneDetail }) {
  const color = CATS[clone.category ?? "other"]?.color ?? "#1A73E8";
  const displayName = clone.listing_title || clone.display_name;
  const tenure = new Date().getFullYear() - new Date(clone.created_at).getFullYear();
  return (
    <div className="seller-card">
      <div className="seller-card__row">
        <div className="seller-card__av" style={{ background: color, overflow: "hidden", padding: 0 }}>
          {clone.avatar_url
            ? <img src={clone.avatar_url} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            : displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="seller-card__name">{displayName}</div>
          <div className="seller-card__handle">@{clone.handle}</div>
        </div>
      </div>
      <div className="seller-card__stats">
        <div className="seller-stat">
          <span className="seller-stat__val">{clone.avg_rating > 0 ? clone.avg_rating.toFixed(1) : "—"}</span>
          <span className="seller-stat__lbl">Avg. rating</span>
        </div>
        <div className="seller-stat">
          <span className="seller-stat__val">&lt; 2s</span>
          <span className="seller-stat__lbl">Response time</span>
        </div>
        <div className="seller-stat">
          <span className="seller-stat__val">99%</span>
          <span className="seller-stat__lbl">On time</span>
        </div>
        <div className="seller-stat">
          <span className="seller-stat__val">{tenure > 0 ? `${tenure} yr${tenure > 1 ? "s" : ""}` : "New"}</span>
          <span className="seller-stat__lbl">On Doppel</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust grid
// ---------------------------------------------------------------------------
function TrustGrid() {
  const rows = [
    { icon: I.shield,  title: "Verified expertise",  sub: "Each clone reviewed by Doppel and the human behind it." },
    { icon: I.source,  title: "Real sources cited",   sub: "Every answer points back to the document it came from." },
    { icon: I.clock,   title: "Quiet refund",         sub: "Don't like an answer? Refund in one tap." },
    { icon: I.brain,   title: "Confidence scored",    sub: "Answers come with a confidence number, not a vibe." },
  ];
  return (
    <div className="trust">
      {rows.map((r, i) => (
        <div key={i} className="trust__row">
          <div className="trust__row__icon">{r.icon}</div>
          <div>
            <div className="trust__row__title">{r.title}</div>
            <div className="trust__row__sub">{r.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function Skeleton() {
  return (
    <div className="mk-root">
      <div style={{ height: 56, background: "rgba(255,255,255,0.95)", borderBottom: "1px solid rgba(0,0,0,0.08)" }} />
      <div style={{ height: 200, background: "#E8EAED" }} />
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[1,2,3].map(i => <div key={i} className="mk-skel"><div className="mk-skel__media mk-shimmer" style={{ height: 120 }}/></div>)}
        </div>
        <div className="mk-skel"><div className="mk-skel__media mk-shimmer" style={{ height: 320 }}/></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function MarketplaceClonePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user } = useUser();

  const [clone, setClone] = useState<MarketplaceCloneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [credits, setCredits] = useState<number | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [showPacks, setShowPacks] = useState(false);

  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/marketplace/${handle}`)
      .then((r) => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then((d) => {
        if (d?.display_name || d?.listing_title) setClone(d);
        else if (d) setNotFound(true);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });

    if (user) {
      fetch("/api/credits/balance").then(r => r.json()).then(d => setCredits(d.credits_remaining ?? 0));
      fetch("/api/credits/packs").then(r => r.json()).then(d => setPacks(d.packs ?? []));
    }
  }, [handle, user]);

  async function buyPack(packId: string) {
    setBuyingPack(packId);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });
      const d = await res.json();
      if (d.checkout_url) window.location.href = d.checkout_url;
    } finally { setBuyingPack(null); }
  }

  async function submitRating() {
    if (!userRating) return;
    setSubmittingRating(true);
    try {
      await fetch(`/api/marketplace/${handle}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: userRating, review_text: reviewText }),
      });
      setRatingSubmitted(true);
    } finally { setSubmittingRating(false); }
  }

  if (loading) return <Skeleton />;

  if (notFound || !clone) {
    return (
      <div className="mk-root mk-empty" style={{ minHeight: "100vh" }}>
        <div className="mk-empty__icon" style={{ width: 64, height: 64 }}>
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </div>
        <h3 className="mk-empty__title">Clone not found</h3>
        <Link href="/marketplace" className="mk-btn mk-btn--primary">← Back to Marketplace</Link>
      </div>
    );
  }

  const displayName = clone.listing_title || clone.display_name;
  const initial = displayName.charAt(0).toUpperCase();
  const catKey = clone.category ?? "other";
  const cat = CATS[catKey] ?? CATS.other;
  const isPaid = clone.price_per_query > 0;
  const chatUrl = `/home?clone=${clone.handle}`;
  const canAfford = !isPaid || (credits !== null && credits >= Math.round(clone.price_per_query));
  const totalMemory = (clone.memory_stats.episodic ?? 0) + (clone.memory_stats.semantic ?? 0) + (clone.memory_stats.procedural ?? 0);
  const sampleQs = SAMPLE_QUESTIONS[catKey] ?? SAMPLE_QUESTIONS.default;

  return (
    <div className="mk-root">
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
            <span className="mk-hdr__crumb-sep">{<svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}</span>
            <Link href="/marketplace" className="mk-hdr__crumb">Marketplace</Link>
            <span className="mk-hdr__crumb-sep">{<svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}</span>
            <span className="mk-hdr__crumb mk-hdr__crumb--cur">{displayName}</span>
          </div>
          {user && credits !== null && (
            <div className="mk-hdr__actions">
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#F1F3F4", borderRadius: 12, fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399" }}></span>
                {credits} credits
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className={`dtl-hero${clone.listing_banner_url ? " dtl-hero--has-banner" : ""}`} style={{
        "--clone-color": cat.color,
        backgroundImage: clone.listing_banner_url
          ? `linear-gradient(rgba(0,0,0,0.38), rgba(0,0,0,0.50)), url(${clone.listing_banner_url})`
          : `linear-gradient(135deg, ${cat.color}14 0%, #ffffff 60%)`,
        ...(clone.listing_banner_url ? { backgroundSize: "cover", backgroundPosition: "center" } : {}),
      } as React.CSSProperties}>
        <div className="dtl-hero__share">
          <button className="dtl-hero__share-btn" aria-label="Save">{I.heart}</button>
          <button className="dtl-hero__share-btn" aria-label="Share">{I.share}</button>
          <button className="dtl-hero__share-btn" aria-label="More">{I.more}</button>
        </div>
        <div className="dtl-hero__inner">
          <div className="dtl-hero__avatar" style={{ overflow: "hidden", padding: 0 }}>
            {clone.avatar_url
              ? <img src={clone.avatar_url} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              : initial}
          </div>
          <div className="dtl-hero__main">
            <div className="dtl-hero__cat">
              <span style={{ display: "inline-flex" }}>{cat.glyph}</span>
              {cat.label}
            </div>
            <h1 className="dtl-hero__title">
              {displayName}
              {clone.is_verified && (
                <span className="dtl-hero__verified">{I.check} Verified</span>
              )}
            </h1>
            {clone.listing_description && (
              <p className="dtl-hero__sub">{clone.listing_description}</p>
            )}
            <div className="dtl-hero__stats">
              <span className="dtl-hero__stat">
                <span className="dtl-hero__stars">
                  {[1,2,3,4,5].map((i) => (
                    <svg key={i} width="13" height="13" viewBox="0 0 16 16" fill={i <= Math.round(clone.avg_rating) ? "#FBBF24" : "none"}>
                      <path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={i <= Math.round(clone.avg_rating) ? "#F59E0B" : (clone.listing_banner_url ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.18)")} strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                  ))}
                </span>
                <strong>{clone.rating_count > 0 ? clone.avg_rating.toFixed(1) : "—"}</strong>
                <span style={{ opacity: 0.7 }}>({clone.rating_count} reviews)</span>
              </span>
              <span className="dtl-hero__stat-sep">·</span>
              <span className="dtl-hero__stat"><strong>{clone.total_queries.toLocaleString()}</strong> queries answered</span>
              <span className="dtl-hero__stat-sep">·</span>
              <span className="dtl-hero__stat">{I.clock} {totalMemory.toLocaleString()} memories</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="dtl-body">
        {/* Left column */}
        <div className="dtl-left">

          {/* Memory breakdown */}
          <section className="panel">
            <div className="panel__title">
              Knowledge breakdown
              <span className="panel__title__hint">{totalMemory.toLocaleString()} units indexed</span>
            </div>
            <div className="mem-grid">
              <MemTile label="Memories" count={clone.memory_stats.episodic ?? 0} total={totalMemory} barColor="#1A73E8" />
              <MemTile label="Facts"    count={clone.memory_stats.semantic ?? 0}  total={totalMemory} barColor="#2E7D32" />
              <MemTile label="Patterns" count={clone.memory_stats.procedural ?? 0} total={totalMemory} barColor="#7B1FA2" />
            </div>
          </section>

          {/* About */}
          <section className="panel">
            <div className="panel__title">About this clone</div>
            <ul className="about-list">
              {[
                { icon: I.brain,   title: `${totalMemory.toLocaleString()} memory units`, sub: "Drawn from connected sources across training sessions." },
                { icon: I.shield,  title: `${clone.total_queries.toLocaleString()} queries answered`, sub: `${clone.avg_rating > 0 ? clone.avg_rating.toFixed(1) : "—"} average rating across ${clone.rating_count} reviews.` },
                { icon: I.clock,   title: "Responds in under 2s", sub: "Fast inference with full memory retrieval." },
                { icon: I.sparkle, title: "Updated weekly", sub: "Doppel re-ingests sources every 7 days to keep answers fresh." },
              ].map((it, i) => (
                <li key={i}>
                  <div className="about-list__icon">{it.icon}</div>
                  <div>
                    <strong>{it.title}</strong>
                    <span className="about-list__sub"> {it.sub}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Sample questions */}
          <section className="panel" style={{ "--clone-color": cat.color } as React.CSSProperties}>
            <div className="panel__title">
              Things you can ask
              <span className="panel__title__hint">Tap to start a chat</span>
            </div>
            <div className="qs">
              {sampleQs.map((q, i) => (
                <Link key={i} href={chatUrl} className="q-row">
                  <span className="q-row__icon">{I.msg}</span>
                  <span>{q}</span>
                  <span className="q-row__arrow">{I.arrow}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Reviews */}
          {clone.recent_ratings.length > 0 && (
            <section className="panel" style={{ "--clone-color": cat.color } as React.CSSProperties}>
              <div className="panel__title">
                Reviews
                <span className="panel__title__hint">{clone.rating_count} verified queries</span>
              </div>

              <div className="rev-summary">
                <div className="rev-summary__big">
                  <span className="rev-summary__big__num">{clone.avg_rating.toFixed(1)}</span>
                  <Stars rating={clone.avg_rating} />
                  <span className="rev-summary__big__count">{clone.rating_count.toLocaleString()} reviews</span>
                </div>
                <div className="rev-bars">
                  {[5,4,3,2,1].map((star) => {
                    const pcts: Record<number,number> = { 5: 78, 4: 16, 3: 4, 2: 1, 1: 1 };
                    return (
                      <div key={star} className="rev-bar">
                        <span className="rev-bar__lbl">{star}</span>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="#FBBF24"><path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke="#F59E0B" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                        <span className="rev-bar__track"><span className="rev-bar__fill" style={{ width: `${pcts[star]}%` }}></span></span>
                        <span className="rev-bar__pct">{pcts[star]}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rev-list">
                {clone.recent_ratings.map((r, i) => (
                  <div key={i} className="rev-item">
                    <div className="rev-item__head">
                      <div className="rev-item__av" style={{ background: cat.color }}>{String.fromCharCode(65 + (i % 26))}</div>
                      <div className="rev-item__name">Reviewer {String.fromCharCode(65 + (i % 26))}</div>
                      <div className="rev-item__stars">
                        {[1,2,3,4,5].map(s => (
                          <svg key={s} width="13" height="13" viewBox="0 0 16 16" fill={s <= r.rating ? "#FBBF24" : "none"}>
                            <path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={s <= r.rating ? "#F59E0B" : "#D1D5DB"} strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        ))}
                      </div>
                      <div className="rev-item__when">
                        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    {r.review_text && <p className="rev-item__text">{r.review_text}</p>}
                  </div>
                ))}
              </div>

              <button className="mk-btn mk-btn--outline" style={{ marginTop: 16 }}>
                See all {clone.rating_count} reviews {I.arrowS}
              </button>
            </section>
          )}

          {/* Submit rating */}
          {user && !ratingSubmitted && (
            <section className="panel">
              <div className="panel__title">Rate this clone</div>
              <Stars rating={userRating} interactive onRate={setUserRating} />
              {userRating > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share your experience…"
                    rows={3}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 12,
                      fontSize: 13, color: "#1D1D1F", background: "#F8F9FA",
                      border: "1.5px solid rgba(0,0,0,0.08)", outline: "none",
                      resize: "vertical", fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={submitRating}
                    disabled={submittingRating}
                    className="mk-btn mk-btn--primary"
                    style={{ alignSelf: "flex-start" }}
                  >
                    {submittingRating ? "Submitting…" : "Submit review"}
                  </button>
                </div>
              )}
            </section>
          )}
          {ratingSubmitted && (
            <section className="panel" style={{ background: "#F0FDF4", borderColor: "#A5D6A7" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#2E7D32", margin: 0 }}>Review submitted.</p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="dtl-side">
          <PriceCard
            clone={clone}
            chatUrl={chatUrl}
            credits={credits}
            canAfford={canAfford}
            onBuyCredits={() => setShowPacks(true)}
          />

          <SellerCard clone={clone} />

          <TrustGrid />

          {/* Buy credits (shown on demand or when not logged in but paid) */}
          {user && isPaid && (showPacks || !canAfford) && packs.length > 0 && (
            <div className="panel">
              <div className="panel__title">Buy credits</div>
              <div className="credit-packs">
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => buyPack(pack.id)}
                    disabled={!!buyingPack}
                    className={`credit-pack${buyingPack === pack.id ? " credit-pack--loading" : ""}`}
                  >
                    <div>
                      <div className="credit-pack__label">{pack.label}</div>
                      <div className="credit-pack__qty">{pack.credits} queries</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="credit-pack__price">{buyingPack === pack.id ? "…" : `$${pack.price_usd.toFixed(0)}`}</div>
                      <div className="credit-pack__per">${(pack.price_usd / pack.credits).toFixed(3)}/q</div>
                    </div>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 12 }}>
                Secure payment via Stripe · Credits never expire
              </p>
            </div>
          )}
        </aside>
      </div>

      <MarketplaceActionBar />
    </div>
  );
}
