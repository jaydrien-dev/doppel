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
  pack_100:  { tagline: "Try the marketplace", best_for: "100 queries · $0.050 each",  color: "#6FCF97", bg: "rgba(111,207,151,0.07)", border: "rgba(111,207,151,0.15)" },
  pack_500:  { tagline: "Regular use",          best_for: "500 queries · $0.046 each",  badge: "Popular", color: "#6BAEFF", bg: "rgba(107,174,255,0.07)", border: "rgba(107,174,255,0.20)" },
  pack_1000: { tagline: "Maximum value",         best_for: "1,000 queries · $0.044 each", color: "#C4B5FD", bg: "rgba(196,181,253,0.07)", border: "rgba(196,181,253,0.15)" },
};

function PlanCreditsCard({ plan, allowance }: { plan: number; allowance: number }) {
  const pct = allowance > 0 ? Math.min((plan / allowance) * 100, 100) : 0;
  const daysUntilReset = (() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    monday.setHours(0, 0, 0, 0);
    return Math.ceil((monday.getTime() - now.getTime()) / 86_400_000);
  })();

  if (allowance === 0) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <p className="db-eyebrow" style={{ marginBottom: 4 }}>Plan credits</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>
            Your current plan doesn&apos;t include weekly credits.{" "}
            <a href="/dashboard/billing" style={{ color: "rgba(107,174,255,0.70)", textDecoration: "none" }}>Upgrade →</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card card--blue">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <p className="db-eyebrow" style={{ marginBottom: 6 }}>Plan credits</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 40, fontWeight: 300, color: "#60A5FA", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {plan.toLocaleString()}
            </span>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.30)" }}>/ {allowance.toLocaleString()} this week</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.20)", marginBottom: 2 }}>Resets in</p>
          <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.50)" }}>{daysUntilReset}d</p>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 9999, background: "rgba(255,255,255,0.07)", marginBottom: 8 }}>
        <div style={{ height: "100%", borderRadius: 9999, width: `${pct}%`, background: "rgba(96,165,250,0.70)", transition: "width 400ms ease" }} />
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>
        Included with your plan — unused credits reset every Monday
      </p>
    </div>
  );
}

function BoughtCreditsCard({ bought }: { bought: number }) {
  return (
    <div className="card" style={{ borderColor: "rgba(196,181,253,0.12)", background: "rgba(196,181,253,0.04)" }}>
      <p className="db-eyebrow" style={{ marginBottom: 10 }}>Bought credits</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 300, color: "rgba(196,181,253,0.80)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {bought.toLocaleString()}
        </span>
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.30)" }}>credits</span>
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>
        {bought === 0
          ? "Purchase a pack below — these never expire"
          : "Never expire · stack with your plan credits · used after plan credits"}
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
  const [planCredits, setPlanCredits] = useState<number | null>(null);
  const [boughtCredits, setBoughtCredits] = useState<number | null>(null);
  const [weeklyAllowance, setWeeklyAllowance] = useState(0);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const success = params.get("success") === "1";
  const cancelled = params.get("cancelled") === "1";

  useEffect(() => {
    if (!user) return;
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => {
        setPlanCredits(d.plan_credits ?? 0);
        setBoughtCredits(d.bought_credits ?? 0);
        setWeeklyAllowance(d.weekly_allowance ?? 0);
        setLoadingBalance(false);
      })
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
          <p className="db-eyebrow">Account</p>
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

      {/* Balance cards */}
      {loadingBalance ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="card" style={{ height: 130, background: "rgba(255,255,255,0.03)" }} />
          <div className="card" style={{ height: 130, background: "rgba(255,255,255,0.03)" }} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <PlanCreditsCard plan={planCredits ?? 0} allowance={weeklyAllowance} />
          <BoughtCreditsCard bought={boughtCredits ?? 0} />
        </div>
      )}

      {/* How credits work */}
      <div className="card">
        <p className="card-title">How credits work</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { title: "Plan credits", desc: "Included weekly with your subscription. Reset every Monday. Used first before bought credits." },
            { title: "Bought credits", desc: "One-time purchase. Stack on top of plan credits. Never expire — carry over indefinitely." },
            { title: "Spend per query", desc: "Credits are deducted per query. Standard clones cost 1 credit; premium clones may cost more." },
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
            { q: "What are plan credits?", a: "Plan credits are a weekly allowance included with your subscription (Personal: 100/week, Enterprise Pro: 500/week, Enterprise Max: 2,000/week). They reset every Monday — unused plan credits do not carry over." },
            { q: "Do bought credits expire?", a: "No. Credits you purchase never expire and carry over indefinitely. Only plan credits reset weekly." },
            { q: "Which credits are spent first?", a: "Plan credits are always spent first. Bought credits are only used once your weekly plan allowance is exhausted." },
            { q: "Can I query free clones without credits?", a: "Yes — free marketplace clones don't require credits. Credits are only spent on paid clones." },
            { q: "Do clone owners get a cut?", a: "Yes. Clone owners keep 70–80% of every credit spent on their clone depending on their plan. Doppel takes the remainder." },
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
