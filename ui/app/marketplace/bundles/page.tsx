"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MarketplaceActionBar } from "@/components/layout/MarketplaceActionBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CreatorBundle {
  id: string;
  title: string;
  description: string | null;
  price_usd: number;
  queries_included: number;
  clone_count: number;
  creator_name: string;
  creator_handle: string;
  created_at: string;
}

interface ConsumerBundle {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  price_usd: number;
  clone_count: number;
  purchase_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const I = {
  chevR:  <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  arrowS: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  layers: <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  user:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="6" r="2.5" fill="currentColor" opacity="0.7"/><path d="M3 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.6"/></svg>,
  bolt:   <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" opacity="0.8"/></svg>,
  check:  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ---------------------------------------------------------------------------
// Creator bundle card (light)
// ---------------------------------------------------------------------------
function CreatorBundleCard({ bundle }: { bundle: CreatorBundle }) {
  return (
    <Link
      href={`/marketplace/bundles/${bundle.id}`}
      style={{
        display: "flex", flexDirection: "column",
        background: "#fff", border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16, padding: "18px 20px 16px",
        textDecoration: "none", cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.10)";
        el.style.borderColor = "transparent";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "";
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
        el.style.borderColor = "rgba(0,0,0,0.08)";
      }}
    >
      {/* Banner strip */}
      <div style={{
        height: 80, borderRadius: 10, marginBottom: 14,
        background: "linear-gradient(135deg, #0F1B3D 0%, #1A3A6B 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, fontWeight: 300, color: "rgba(255,255,255,0.18)",
        letterSpacing: "-0.04em", userSelect: "none",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.35,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }} />
        <span style={{ position: "relative", zIndex: 1 }}>{bundle.title.charAt(0)}</span>
      </div>

      {/* Body */}
      <p style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {bundle.title}
      </p>
      <p style={{ fontSize: 12, color: "#5F6368", margin: "0 0 8px" }}>by {bundle.creator_name}</p>
      {bundle.description && (
        <p style={{
          fontSize: 12, color: "#6B7280", lineHeight: 1.5, margin: "0 0 12px",
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
        }}>
          {bundle.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9CA3AF" }}>
          {I.layers} {bundle.clone_count} clone{bundle.clone_count !== 1 ? "s" : ""}
        </span>
        {bundle.queries_included > 0 && (
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {bundle.queries_included} queries</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600, color: bundle.price_usd > 0 ? "#1D1D1F" : "#059669" }}>
          {bundle.price_usd > 0 ? `$${bundle.price_usd.toFixed(0)}` : "Free"}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Consumer bundle card (light)
// ---------------------------------------------------------------------------
function ConsumerBundleCard({ bundle }: { bundle: ConsumerBundle }) {
  return (
    <Link
      href={`/marketplace/bundles/consumer/${bundle.id}`}
      style={{
        display: "flex", flexDirection: "column",
        background: "#fff", border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16, padding: "18px 20px 16px",
        textDecoration: "none", cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.10)";
        el.style.borderColor = "transparent";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "";
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
        el.style.borderColor = "rgba(0,0,0,0.08)";
      }}
    >
      {/* Banner strip */}
      <div style={{
        height: 80, borderRadius: 10, marginBottom: 14,
        background: "linear-gradient(135deg, #3B1D8A 0%, #6D28D9 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.3,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }} />
        <span style={{ position: "relative", zIndex: 1, color: "rgba(255,255,255,0.35)" }}>{I.user}</span>
      </div>

      <p style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {bundle.title}
      </p>
      <p style={{ fontSize: 12, color: "#5F6368", margin: "0 0 8px" }}>
        Community curated · {bundle.clone_count} clone{bundle.clone_count !== 1 ? "s" : ""}
      </p>
      {bundle.description && (
        <p style={{
          fontSize: 12, color: "#6B7280", lineHeight: 1.5, margin: "0 0 12px",
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
        }}>
          {bundle.description}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        {bundle.purchase_count > 0 && (
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{bundle.purchase_count} purchase{bundle.purchase_count !== 1 ? "s" : ""}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600, color: bundle.price_usd > 0 ? "#1D1D1F" : "#059669" }}>
          {bundle.price_usd > 0 ? `$${bundle.price_usd.toFixed(0)}` : "Free"}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Skeleton (light)
// ---------------------------------------------------------------------------
function BundleSkeleton() {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 16, padding: "18px 20px" }}>
      <div className="mk-shimmer" style={{ height: 80, borderRadius: 10, marginBottom: 14 }} />
      <div className="mk-shimmer" style={{ height: 14, borderRadius: 6, marginBottom: 6, width: "65%" }} />
      <div className="mk-shimmer" style={{ height: 12, borderRadius: 6, width: "40%" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function MarketplaceBundlesPage() {
  const [creatorBundles, setCreatorBundles] = useState<CreatorBundle[]>([]);
  const [consumerBundles, setConsumerBundles] = useState<ConsumerBundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/marketplace/bundles?limit=48").then(r => r.json()),
      fetch("/api/marketplace/consumer-bundles?limit=48").then(r => r.json()),
    ]).then(([creator, consumer]) => {
      setCreatorBundles(creator.bundles ?? []);
      setConsumerBundles(consumer.bundles ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
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
            <span className="mk-hdr__crumb mk-hdr__crumb--cur">Bundles</span>
          </div>
          <div className="mk-hdr__actions">
            <Link href="/dashboard/bundles" className="mk-btn mk-btn--ghost mk-btn--sm">My bundles</Link>
            <Link href="/dashboard" className="mk-btn mk-btn--primary mk-btn--sm">Dashboard {I.arrowS}</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mk-hero" style={{ padding: "48px 24px 56px" }}>
        <div className="mk-hero__grid" />
        <div style={{ maxWidth: 680, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div className="mk-hero__eyebrow">
            <span className="mk-hero__eyebrow__dot" />
            Knowledge Bundles
          </div>
          <h1 className="mk-hero__title" style={{ margin: "0 0 14px", textAlign: "center", maxWidth: "100%" }}>
            Packaged knowledge,<br />ready to use.
          </h1>
          <p className="mk-hero__sub" style={{ margin: "0 auto", textAlign: "center" }}>
            Creator bundles are expert briefings packaged by clone owners. Community bundles are curated research packs put together by the community.
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="mk-page" style={{ paddingTop: 40 }}>

        {/* Creator bundles */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(26,115,232,0.08)", color: "#1A73E8",
                display: "flex", alignItems: "center", justifyContent: "center" }}>{I.layers}</div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F", margin: 0 }}>Creator bundles</h2>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Packaged by clone owners from their own expertise</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => <BundleSkeleton key={i} />)}
            </div>
          ) : creatorBundles.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)" }}>
              <p style={{ fontSize: 14, color: "#5F6368", marginBottom: 12 }}>No creator bundles yet.</p>
              <Link href="/dashboard/bundles" className="mk-btn mk-btn--ghost mk-btn--sm">
                Publish your first bundle {I.arrowS}
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {creatorBundles.map((b) => <CreatorBundleCard key={b.id} bundle={b} />)}
            </div>
          )}
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.06)", marginBottom: 48 }} />

        {/* Community bundles */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(109,40,217,0.08)", color: "#6D28D9",
                display: "flex", alignItems: "center", justifyContent: "center" }}>{I.user}</div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F", margin: 0 }}>Community bundles</h2>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Curated research packs from community members</p>
              </div>
            </div>
            <Link href="/dashboard/bundles" className="mk-btn mk-btn--ghost mk-btn--sm">
              Create yours {I.arrowS}
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {Array.from({ length: 4 }).map((_, i) => <BundleSkeleton key={i} />)}
            </div>
          ) : consumerBundles.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)" }}>
              <p style={{ fontSize: 14, color: "#5F6368", marginBottom: 6 }}>No community bundles published yet.</p>
              <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>Be the first to curate and share a knowledge bundle.</p>
              <Link href="/dashboard/bundles" className="mk-btn mk-btn--primary mk-btn--sm">
                Create a bundle {I.arrowS}
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {consumerBundles.map((b) => <ConsumerBundleCard key={b.id} bundle={b} />)}
            </div>
          )}
        </section>

        {/* CTA strip */}
        <div className="mk-cta">
          <div className="mk-cta__grid" />
          <div className="mk-cta__inner">
            <p className="mk-cta__eyebrow">Create your bundle</p>
            <h2 className="mk-cta__title">Package your knowledge.</h2>
            <p className="mk-cta__sub">Bundle your clone&apos;s expertise into a product people can buy once and use forever.</p>
          </div>
          <Link href="/dashboard/bundles" className="mk-cta__btn">
            Get started {I.arrowS}
          </Link>
        </div>
      </div>

      <MarketplaceActionBar />
    </div>
  );
}
