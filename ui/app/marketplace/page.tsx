"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { MarketplaceActionBar } from "@/components/layout/MarketplaceActionBar";

// ---------------------------------------------------------------------------
// SVG icon set (no emoji)
// ---------------------------------------------------------------------------
const I = {
  search:  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  arrowS:  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bolt:    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor"/></svg>,
  heart:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13.5s-5-3-5-7a2.7 2.7 0 015-1.5A2.7 2.7 0 0113 6.5c0 4-5 7-5 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/></svg>,
  heartFilled: <svg width="14" height="14" viewBox="0 0 16 16" fill="#E11D48"><path d="M8 13.5s-5-3-5-7a2.7 2.7 0 015-1.5A2.7 2.7 0 0113 6.5c0 4-5 7-5 7z"/></svg>,
  layers:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  chevR:   <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  close:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
};

// ---------------------------------------------------------------------------
// Category config — SVG glyphs, no emoji
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
const catKeys = Object.keys(CATS);
function catColor(key: string | null): string { return CATS[key ?? "other"]?.color ?? "#1A73E8"; }
function catLabel(key: string | null): string { return CATS[key ?? "other"]?.label ?? "Other"; }

const SORT_OPTIONS = [
  { value: "best_rated",   label: "Best rated" },
  { value: "most_queries", label: "Most popular" },
  { value: "price_asc",    label: "Price: low to high" },
  { value: "price_desc",   label: "Price: high to low" },
  { value: "newest",       label: "Newest" },
  { value: "free_first",   label: "Free first" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MarketplaceClone {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
  listing_description: string | null;
  price_per_query: number;
  total_queries: number;
  avg_rating: number;
  rating_count: number;
  memory_chunks: number;
  is_verified?: boolean;
  avatar_url?: string | null;
  listing_banner_url?: string | null;
}

// ---------------------------------------------------------------------------
// Stars component
// ---------------------------------------------------------------------------
function Stars({ rating, count }: { rating: number; count: number }) {
  const r = Math.round(rating);
  return (
    <span className="mk-gig__rating">
      <span style={{ display: "inline-flex" }}>
        {[1,2,3,4,5].map((i) => (
          <svg key={i} width="13" height="13" viewBox="0 0 16 16" fill={i <= r ? "#FBBF24" : "none"}>
            <path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={i <= r ? "#F59E0B" : "#D1D5DB"} strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        ))}
      </span>
      {count > 0 && rating > 0 && (
        <>
          <span className="mk-gig__rating__val">{rating.toFixed(1)}</span>
          <span className="mk-gig__rating__count">({count.toLocaleString()})</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Monogram avatar
// ---------------------------------------------------------------------------
function Monogram({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "rgba(255,255,255,0.45)",
      fontSize: Math.round(size * 0.46), fontWeight: 500,
      letterSpacing: "-0.02em",
      flexShrink: 0, userSelect: "none",
    }}>{initial}</div>
  );
}

// ---------------------------------------------------------------------------
// Level badge (no emoji — SVG icons)
// ---------------------------------------------------------------------------
function LevelBadge({ queries }: { queries: number }) {
  if (queries >= 500) return (
    <span className="mk-gig__pill mk-gig__pill--top">{I.bolt} Top rated</span>
  );
  if (queries >= 100) return (
    <span className="mk-gig__pill mk-gig__pill--lvl2"><span className="mk-gig__pill__dot"></span>Level 2</span>
  );
  if (queries >= 10) return (
    <span className="mk-gig__pill mk-gig__pill--lvl1"><span className="mk-gig__pill__dot"></span>Level 1</span>
  );
  return null;
}

// ---------------------------------------------------------------------------
// Clone card
// ---------------------------------------------------------------------------
function CloneCard({ clone, saved, toggleSave }: {
  clone: MarketplaceClone;
  saved: boolean;
  toggleSave: (id: string) => void;
}) {
  const color = catColor(clone.category);

  return (
    <Link
      href={`/marketplace/${clone.handle}`}
      className="mk-gig"
      style={{ "--clone-color": color } as React.CSSProperties}
    >
      {/* Banner */}
      <div className="mk-gig__media">
        {clone.listing_banner_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={clone.listing_banner_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <span className="mk-gig__initial">{clone.display_name.charAt(0).toUpperCase()}</span>
        }

        <div className="mk-gig__badges">
          {clone.is_verified && (
            <span className="mk-gig__pill mk-gig__pill--verified">{I.check} Verified</span>
          )}
          <LevelBadge queries={clone.total_queries} />
        </div>

        <button
          className={`mk-gig__heart${saved ? " mk-gig__heart--saved" : ""}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSave(clone.clone_id); }}
          aria-label={saved ? "Remove from saved" : "Save"}
        >
          {saved ? I.heartFilled : I.heart}
        </button>

        <span className="mk-gig__cat">{catLabel(clone.category)}</span>
      </div>

      {/* Body */}
      <div className="mk-gig__body">
        <div className="mk-gig__seller">
          {clone.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={clone.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <Monogram name={clone.display_name} color={color} size={24} />
          }
          <span className="mk-gig__seller-name">{clone.display_name}</span>
          <span className="mk-gig__seller-meta">{clone.memory_chunks.toLocaleString()} chunks</span>
        </div>

        <p className="mk-gig__desc">
          {clone.listing_description ?? "Expert knowledge clone available for queries."}
        </p>

        <Stars rating={clone.avg_rating} count={clone.rating_count} />

        <div className="mk-gig__divider"></div>

        <div className="mk-gig__foot">
          <div className={`mk-gig__price${clone.price_per_query === 0 ? " mk-gig__price--free" : ""}`}>
            <span>{clone.price_per_query > 0 ? "Fast / Pro / Extended" : "Free"}</span>
            <strong>{clone.price_per_query > 0 ? `${Math.round(clone.price_per_query)} / ${Math.round(clone.price_per_query) * 3} / ${Math.round(clone.price_per_query) * 8} cr` : "Free"}</strong>
          </div>
          <span className="mk-gig__queue">
            <span className="mk-gig__queue-dot"></span>
            {clone.total_queries.toLocaleString()} queries
          </span>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="mk-skel">
      <div className="mk-skel__media mk-shimmer" />
      <div className="mk-skel__body">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mk-skel__line mk-shimmer" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
          <div className="mk-skel__line mk-shimmer" style={{ width: "60%" }} />
        </div>
        <div className="mk-skel__line mk-shimmer" style={{ width: "100%" }} />
        <div className="mk-skel__line mk-shimmer" style={{ width: "80%" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <div className="mk-skel__line mk-shimmer" style={{ width: 70 }} />
          <div className="mk-skel__line mk-shimmer" style={{ width: 50 }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone Finder — guided 2-step discovery widget
// ---------------------------------------------------------------------------
const INTENTS = [
  { id: "advice",    label: "Get advice",         search: "advice guidance" },
  { id: "review",    label: "Review my work",      search: "review critique feedback" },
  { id: "decision",  label: "Make a decision",     search: "decision strategy" },
  { id: "learn",     label: "Learn from an expert",search: "teaching explain" },
  { id: "brainstorm",label: "Brainstorm ideas",    search: "brainstorm ideas" },
  { id: "validate",  label: "Validate a plan",     search: "validate plan" },
];

function CloneFinder({
  onApply,
  onClose,
}: {
  onApply: (category: string, search: string) => void;
  onClose: () => void;
}) {
  const [step, setStep]     = useState<1 | 2>(1);
  const [intent, setIntent] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);

  function apply() {
    const searchTerm = INTENTS.find(i => i.id === intent)?.search ?? "";
    onApply(domain ?? "", searchTerm);
    onClose();
  }

  return (
    <div style={{
      marginTop: 20,
      padding: "20px 24px 22px",
      borderRadius: 16,
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.09)",
      backdropFilter: "blur(12px)",
      animation: "mk-finder-in 220ms cubic-bezier(0.25,0.46,0.45,0.94) both",
    }}>
      <style>{`
        @keyframes mk-finder-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>
            {step === 1 ? "What are you trying to do?" : "Which domain?"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
            Step {step} of 2
          </p>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.30)", padding: 4, lineHeight: 1 }}
          aria-label="Close"
        >
          {I.close}
        </button>
      </div>

      {/* Step 1 — intent */}
      {step === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {INTENTS.map(it => (
            <button
              key={it.id}
              onClick={() => { setIntent(it.id); setStep(2); }}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: "pointer", transition: "all 150ms",
                background: intent === it.id ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${intent === it.id ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}`,
                color: intent === it.id ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.50)",
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}

      {/* Step 2 — domain */}
      {step === 2 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {/* "Any domain" option */}
            <button
              onClick={() => setDomain(null)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: "pointer", transition: "all 150ms",
                background: domain === null ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${domain === null ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}`,
                color: domain === null ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.50)",
              }}
            >
              Any domain
            </button>
            {catKeys.map(k => (
              <button
                key={k}
                onClick={() => setDomain(k)}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", transition: "all 150ms", display: "flex", alignItems: "center", gap: 6,
                  background: domain === k ? `${CATS[k].color}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${domain === k ? CATS[k].color + "66" : "rgba(255,255,255,0.08)"}`,
                  color: domain === k ? CATS[k].color : "rgba(255,255,255,0.50)",
                }}
              >
                {CATS[k].glyph} {CATS[k].label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={apply}
              style={{
                padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                cursor: "pointer", background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.20)",
                color: "rgba(255,255,255,0.88)", transition: "all 150ms",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              Show matches {I.arrowS}
            </button>
            <button
              onClick={() => { setStep(1); setIntent(null); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "rgba(255,255,255,0.30)", padding: "9px 4px",
              }}
            >
              ← Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header (scroll-aware)
// ---------------------------------------------------------------------------
function Header({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`mk-hdr${scrolled ? " mk-hdr--scrolled" : ""}`}>
      <div className="mk-hdr__inner">
        <Link href="/" className="mk-hdr__brand">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
            <rect x="0.5" y="0.5" width="21" height="21" rx="6.5"
              fill="rgba(26,115,232,0.08)" stroke="rgba(26,115,232,0.22)" />
            <circle cx="8.88" cy="8.88" r="4.65" fill="#1A73E8" fillOpacity="0.90" />
            <circle cx="13.96" cy="13.96" r="3.80" fill="#1A73E8" fillOpacity="0.50" />
          </svg>
          doppel
        </Link>

        <div className="mk-hdr__search">
          <span className="mk-hdr__search-icon">{I.search}</span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search clones, expertise, topics…"
          />
        </div>

        <div className="mk-hdr__actions">
          <Link href="/dashboard/clones" className="mk-btn mk-btn--ghost mk-btn--sm">
            Sell your knowledge
          </Link>
          <Link href="/dashboard" className="mk-btn mk-btn--primary mk-btn--sm">
            Dashboard {I.arrowS}
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Category strip
// ---------------------------------------------------------------------------
function CatStrip({ active, onChange, counts }: {
  active: string;
  onChange: (v: string) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="mk-cats">
      <button
        className={`mk-cat${active === "" ? " mk-cat--active" : ""}`}
        onClick={() => onChange("")}
        style={{ "--cat-color": "#5F6368" } as React.CSSProperties}
      >
        <span className="mk-cat__glyph">{I.layers}</span>
        All
        <span className="mk-cat__count">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
      </button>
      {catKeys.map((k) => (
        <button
          key={k}
          className={`mk-cat${active === k ? " mk-cat--active" : ""}`}
          onClick={() => onChange(active === k ? "" : k)}
          style={{ "--cat-color": CATS[k].color } as React.CSSProperties}
        >
          <span className="mk-cat__glyph">{CATS[k].glyph}</span>
          {CATS[k].label}
          {(counts[k] ?? 0) > 0 && (
            <span className="mk-cat__count">{counts[k]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function MarketplacePage() {
  const [clones, setClones] = useState<MarketplaceClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("best_rated");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [finderOpen, setFinderOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), 280);
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSaved((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "48", sort });
    if (category) params.set("category", category);
    if (debouncedSearch) params.set("q", debouncedSearch);
    fetch(`/api/marketplace?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const list: MarketplaceClone[] = d.clones ?? [];
        setClones(list);
        // build counts per category
        const c: Record<string, number> = {};
        list.forEach((cl) => {
          const cat = cl.category ?? "other";
          c[cat] = (c[cat] ?? 0) + 1;
        });
        setCounts(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [category, sort, debouncedSearch]);

  const hasFilter = !!category || !!debouncedSearch;

  return (
    <div>
      <Header search={search} onSearch={handleSearch} />

      {/* Hero */}
      <section className="mk-hero">
        <div className="mk-hero__grid" />
        <div className="mk-hero__inner">
          <div className="mk-anim-up">
            <div className="mk-hero__eyebrow">
              <span className="mk-hero__eyebrow__dot"></span>
              Knowledge marketplace
            </div>
            <h1 className="mk-hero__title">
              Ask the people who built it.
              <br />
              <em>Pay only when you do.</em>
            </h1>
            <p className="mk-hero__sub">
              Doppel is a marketplace of AI clones trained on real expertise — engineers, operators, designers, clinicians. Query directly. Cite real sources. No subscriptions.
            </p>

            <div className="mk-hero__search">
              <span className="mk-hero__search-icon">{I.search}</span>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder='Try "scaling a payments team" or "board memo"'
              />
              <button
                className="mk-hero__search-go"
                onClick={() => setDebouncedSearch(search)}
              >
                Search {I.arrowS}
              </button>
            </div>

            <div className="mk-hero__tags">
              <span className="mk-hero__tags-label">Trending:</span>
              {["Engineering leadership", "GTM positioning", "Board prep", "Design critique"].map((t) => (
                <button key={t} className="mk-hero__tag" onClick={() => handleSearch(t)}>
                  {t}
                </button>
              ))}
            </div>

            {/* Guided finder */}
            <div style={{ marginTop: 4 }}>
              {!finderOpen ? (
                <button
                  onClick={() => setFinderOpen(true)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: "6px 0",
                    fontSize: 12, color: "rgba(255,255,255,0.35)",
                    display: "flex", alignItems: "center", gap: 5,
                    transition: "color 150ms",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <circle cx="6" cy="6" r="4.5"/>
                    <path d="M6 5v-.3a1.2 1.2 0 111.2 1.2L6 6.5"/>
                    <circle cx="6" cy="8.5" r=".5" fill="currentColor" stroke="none"/>
                  </svg>
                  Not sure who to ask? Answer 2 questions →
                </button>
              ) : (
                <CloneFinder
                  onApply={(cat, q) => {
                    setCategory(cat);
                    handleSearch(q);
                    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  onClose={() => setFinderOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Mock chat card */}
          <div className="mk-hero__card mk-anim-up" style={{ animationDelay: "120ms" }}>
            <div className="mk-hero__card-head">
              <div className="mk-hero__card-avatar">SC</div>
              <div>
                <div className="mk-hero__card-name">Sarah Chen</div>
                <div className="mk-hero__card-role">VP Engineering · former Stripe</div>
              </div>
              <div className="mk-hero__card-live">
                <span className="mk-hero__card-live-dot"></span>
                Live
              </div>
            </div>
            <div className="mk-hero__card-msg">
              When should I rewrite our payments service instead of refactoring?
            </div>
            <div className="mk-hero__card-msg mk-hero__card-msg--ai">
              Three signals push me toward rewrite: API surface is fundamentally wrong, the team can&apos;t reason about failure modes, and on-call cost exceeds new-feature cost. Otherwise refactor in flight.
            </div>
            <div className="mk-hero__card-sources">
              <strong>92% confident</strong>
              <span>·</span>
              <span className="mk-hero__card-sources-pill">3 sources</span>
              <span>·</span>
              <span>1.8s</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="mk-page" ref={gridRef}>
        <CatStrip active={category} onChange={setCategory} counts={counts} />

        {/* Sort row */}
        <div className="mk-sortrow">
          <div className="mk-sortrow__count">
            {loading ? (
              "Loading…"
            ) : (
              <>
                <strong>{clones.length.toLocaleString()}</strong>
                {" "}clone{clones.length !== 1 ? "s" : ""}
                {category ? ` in ${CATS[category]?.label ?? category}` : ""}
                {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
                {hasFilter && (
                  <button
                    className="mk-btn mk-btn--ghost mk-btn--sm"
                    onClick={() => { setCategory(""); setSearch(""); setDebouncedSearch(""); }}
                    style={{ marginLeft: 8 }}
                  >
                    {I.close} Clear
                  </button>
                )}
              </>
            )}
          </div>
          <div className="mk-sortrow__right">
            <div className="mk-sortrow__sort">
              <span>Sort:</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="mk-grid">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : clones.length === 0 ? (
          <div className="mk-empty mk-anim-up">
            <div className="mk-empty__icon">{I.search}</div>
            <h3 className="mk-empty__title">No clones match these filters.</h3>
            <p className="mk-empty__sub">
              Try clearing the search or picking a different category.
            </p>
            <div className="mk-empty__ctas">
              <button
                className="mk-btn mk-btn--primary"
                onClick={() => { setCategory(""); setSearch(""); setDebouncedSearch(""); }}
              >
                Clear filters
              </button>
              <Link href="/dashboard/clones" className="mk-btn mk-btn--outline">
                List your clone {I.arrowS}
              </Link>
            </div>
          </div>
        ) : (
          <div className="mk-grid mk-stagger">
            {clones.map((c) => (
              <CloneCard
                key={c.clone_id}
                clone={c}
                saved={!!saved[c.clone_id]}
                toggleSave={toggleSave}
              />
            ))}
          </div>
        )}

        {/* For-creators CTA */}
        {!loading && clones.length > 0 && (
          <div className="mk-cta mk-anim-up">
            <div className="mk-cta__grid" />
            <div className="mk-cta__inner">
              <div className="mk-cta__eyebrow">For creators</div>
              <h3 className="mk-cta__title">Earn from what you know.</h3>
              <p className="mk-cta__sub">Train a clone on your work. Set a price. Keep 80% of every paid query.</p>
            </div>
            <Link href="/dashboard/clones" className="mk-cta__btn">
              Start selling {I.arrowS}
            </Link>
          </div>
        )}
      </div>

      <MarketplaceActionBar />
    </div>
  );
}
