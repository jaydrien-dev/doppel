"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface CreditPack {
  id: string;
  credits: number;
  price_usd: number;
  label: string;
}

const PACK_META: Record<string, {
  tagline: string; best_for: string; badge?: string;
  color: string; bg: string; border: string;
}> = {
  pack_100:  { tagline: "Try the marketplace", best_for: "100 queries · $0.05 each",    color: "#6FCF97", bg: "rgba(111,207,151,0.07)", border: "rgba(111,207,151,0.15)" },
  pack_500:  { tagline: "Regular use",          best_for: "500 queries · $0.04 each",    badge: "Popular", color: "#6BAEFF", bg: "rgba(107,174,255,0.07)", border: "rgba(107,174,255,0.20)" },
  pack_1000: { tagline: "Maximum value",         best_for: "1,000 queries · $0.035 each", color: "#C4B5FD", bg: "rgba(196,181,253,0.07)", border: "rgba(196,181,253,0.15)" },
};

function CreditBalance({ credits }: { credits: number }) {
  const pct = Math.min((credits / 500) * 100, 100);
  return (
    <div className="card card--blue">
      <p className="db-eyebrow" style={{ marginBottom: 12 }}>Your balance</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 16 }}>
        <p style={{ fontSize: 48, fontWeight: 300, color: "#60A5FA", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {credits.toLocaleString()}
        </p>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>credits</p>
      </div>
      <div style={{ height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.08)", marginBottom: 8 }}>
        <div
          style={{
            height: "100%", borderRadius: 9999,
            width: `${pct}%`,
            background: "#1A73E8",
            transition: "width 400ms ease",
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
        {credits === 0
          ? "Buy credits to start querying paid clones"
          : `Enough for ~${credits} paid queries`}
      </p>
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense>
      <CreditsContent />
    </Suspense>
  );
}

function CreditsContent() {
  const { user } = useUser();
  const params = useSearchParams();
  const [credits, setCredits] = useState<number | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const success = params.get("success") === "1";
  const cancelled = params.get("cancelled") === "1";

  useEffect(() => {
    if (!user) return;
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => { setCredits(d.credits_remaining ?? 0); setLoadingBalance(false); })
      .catch(() => setLoadingBalance(false));

    fetch("/api/credits/packs")
      .then((r) => r.json())
      .then((d) => setPacks(d.packs ?? []));
  }, [user, success]);

  async function buyPack(packId: string) {
    setBuying(packId);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });
      const d = await res.json();
      if (d.checkout_url) window.location.href = d.checkout_url;
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Marketplace</p>
          <h1 className="db-h1">Credits</h1>
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(52,211,153,0.15)" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(52,211,153,0.70)", flexShrink: 0 }}>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5 8l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, color: "rgba(52,211,153,0.80)" }}>Credits added.</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Your balance has been updated.</p>
          </div>
          <Link href="/marketplace" className="btn btn--sm">
            Browse marketplace →
          </Link>
        </div>
      )}

      {/* Cancelled banner */}
      {cancelled && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 4.5v3M7 9v.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>Checkout canceled — no charge was made.</p>
        </div>
      )}

      {/* Balance card */}
      {loadingBalance ? (
        <div className="card" style={{ height: 120, background: "rgba(255,255,255,0.03)" }} />
      ) : (
        <CreditBalance credits={credits ?? 0} />
      )}

      {/* How credits work */}
      <div className="card">
        <p className="card-title">How credits work</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { title: "Buy credits", desc: "One-time purchase. No subscription needed." },
            { title: "Query any clone", desc: "Credits are spent per query. Standard clones cost 1 credit; premium clones may cost more." },
            { title: "Never expire", desc: "Credits stay in your account until you use them." },
          ].map(({ title, desc }) => (
            <div key={title} style={{ textAlign: "center", padding: "4px 0" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.60)", marginBottom: 4 }}>{title}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pack grid */}
      <div>
        <p className="db-eyebrow" style={{ marginBottom: 14 }}>Buy credits</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {packs.map((pack) => {
            const meta = PACK_META[pack.id] ?? {
              tagline: pack.label, best_for: `${pack.credits} queries`,
              color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)",
            };
            const isLoadingPack = buying === pack.id;
            const pricePerQuery = (pack.price_usd / pack.credits).toFixed(3);

            return (
              <div
                key={pack.id}
                style={{
                  position: "relative", display: "flex", flexDirection: "column",
                  borderRadius: 16, overflow: "hidden",
                  background: meta.bg, border: `1px solid ${meta.border}`,
                  backdropFilter: "blur(20px)",
                }}
              >
                {meta.badge && (
                  <div style={{
                    fontSize: 10, fontWeight: 500, textTransform: "uppercase",
                    letterSpacing: "0.12em", textAlign: "center", padding: "6px 0",
                    color: meta.color,
                    borderBottom: `1px solid ${meta.border}`,
                    background: "rgba(255,255,255,0.03)",
                  }}>
                    {meta.badge}
                  </div>
                )}
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>{pack.label}</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{meta.tagline}</p>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 30, fontWeight: 300, color: meta.color }}>${pack.price_usd.toFixed(0)}</span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>one-time</span>
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{meta.best_for}</p>
                  </div>
                  <button
                    onClick={() => buyPack(pack.id)}
                    disabled={!!buying}
                    className="btn"
                    style={{
                      width: "100%", justifyContent: "center", marginTop: "auto",
                      background: meta.bg, borderColor: meta.border, color: meta.color,
                    }}
                  >
                    {isLoadingPack ? "Redirecting…" : `Buy ${pack.credits} credits`}
                  </button>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
                    ${pricePerQuery}/query
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="card">
        <p className="card-title">FAQ</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { q: "Do credits expire?", a: "No. Credits never expire and carry over indefinitely." },
            { q: "Can I query free clones without credits?", a: "Yes — free marketplace clones don't require credits. Credits are only spent on paid clones." },
            { q: "What happens if I run out mid-session?", a: "You'll be prompted to top up before the next query. Your conversation history is saved." },
            { q: "Do clone owners get a cut?", a: "Yes. Clone owners keep 80% of every credit spent on their clone. Doppel takes 20%." },
          ].map(({ q, a }) => (
            <div key={q}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{q}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 3, lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stripe notice */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.20)" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="4.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M3.5 4.5V3.5a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        Payments processed securely by Stripe. Credits are non-refundable.
      </div>
    </div>
  );
}
