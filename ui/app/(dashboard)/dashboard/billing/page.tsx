"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Tier = "free" | "personal" | "enterprise_pro" | "enterprise_max";
type Period = "monthly" | "yearly";

interface BillingStatus {
  tier: Tier;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

const PLANS: {
  id: Tier;
  name: string;
  color: string;
  desc: string;
  monthly: number;
  yearly: number;
  perSeat?: boolean;
  monthlyEnvKey: string;
  yearlyEnvKey: string;
  features: string[];
  featured: boolean;
  contactSales: boolean;
}[] = [
  {
    id: "free",
    name: "Free",
    color: "#34D399",
    desc: "Build your clone. Share it. Yours forever.",
    monthly: 0,
    yearly: 0,
    monthlyEnvKey: "",
    yearlyEnvKey: "",
    features: [
      "2 clones",
      "500 memory chunks per clone",
      "50 queries / month per clone",
      "Train from any source (Gmail, Notion, Slack…)",
      "Public /c/[handle] chat link",
      "Sell on the marketplace · 70% rev share",
    ],
    featured: false,
    contactSales: false,
  },
  {
    id: "personal",
    name: "Personal",
    color: "#1A73E8",
    desc: "Sell your knowledge. Earn on every query.",
    monthly: 15,
    yearly: 150,
    monthlyEnvKey: "NEXT_PUBLIC_STRIPE_PERSONAL_MONTHLY_PRICE_ID",
    yearlyEnvKey: "NEXT_PUBLIC_STRIPE_PERSONAL_YEARLY_PRICE_ID",
    features: [
      "5 clones",
      "5,000 memory chunks per clone",
      "250 queries / month per clone",
      "80% revenue share on consumer queries",
      "Priority marketplace listing",
      "API access",
      "Custom clone pricing",
    ],
    featured: false,
    contactSales: false,
  },
  {
    id: "enterprise_pro",
    name: "Pro",
    color: "#A78BFA",
    desc: "Scale your knowledge across a team.",
    monthly: 49,
    yearly: 490,
    perSeat: true,
    monthlyEnvKey: "NEXT_PUBLIC_STRIPE_ENT_PRO_MONTHLY_PRICE_ID",
    yearlyEnvKey: "NEXT_PUBLIC_STRIPE_ENT_PRO_YEARLY_PRICE_ID",
    features: [
      "20 clones org-wide · everything in Personal per seat",
      "30,000 memory chunks per clone",
      "1,250 queries / month per clone",
      "Org-wide audit log",
      "Priority support",
    ],
    featured: true,
    contactSales: false,
  },
  {
    id: "enterprise_max",
    name: "Max",
    color: "#E91E63",
    desc: "Enterprise-grade. No compromises.",
    monthly: 149,
    yearly: 1490,
    perSeat: true,
    monthlyEnvKey: "",
    yearlyEnvKey: "",
    features: [
      "50 clones org-wide · everything in Pro",
      "200,000 memory chunks per clone",
      "5,000 queries / month per clone",
      "SOC 2 Type II",
      "Guaranteed uptime SLA",
      "Dedicated CSM + priority support",
      "Custom contracts + volume pricing",
    ],
    featured: false,
    contactSales: true,
  },
];
// Price IDs are resolved server-side — no NEXT_PUBLIC_ vars needed.

const ISparkle = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.9"/>
  </svg>
);

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M2.5 6.5l3 3 5-5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const success = params.get("success") === "1";
  const canceled = params.get("canceled") === "1";

  useEffect(() => {
    // Sync first (reconciles any missed Stripe webhooks), then read fresh status
    fetch("/api/billing/sync", { method: "POST" })
      .then((r) => r.json())
      .then((sync) => {
        // sync returns the resolved tier directly — use it, then also fetch status for IDs
        setStatus((prev) => prev ? { ...prev, tier: sync.tier ?? prev.tier } : { tier: sync.tier ?? "free" });
        return fetch("/api/billing/status");
      })
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => {
        // Fallback: just read status from DB
        fetch("/api/billing/status")
          .then((r) => r.json())
          .then((d) => setStatus(d))
          .catch(() => setStatus({ tier: "free" }));
      });
  }, [success]); // re-run after successful checkout return

  async function handleUpgrade(planId: Tier) {
    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: planId, period }),
      });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        alert(data.detail ?? "Checkout failed — check Stripe configuration.");
      }
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) router.push(data.url);
    } finally {
      setPortalLoading(false);
    }
  }

  const currentTier = status?.tier ?? "free";
  const isSubscribed = !!status?.stripe_subscription_id;

  return (
    <div className="db-page" style={{ "--page-accent": "#F59E0B" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Account</p>
          <h1 className="db-h1">Billing <em>&amp; Plans</em></h1>
        </div>
        {isSubscribed && (
          <button onClick={handlePortal} disabled={portalLoading} className="btn btn--sm">
            {portalLoading ? "Opening…" : "Manage billing ↗"}
          </button>
        )}
      </div>

      {/* Banners */}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, padding: "12px 18px", marginBottom: 20, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="rgba(52,211,153,0.15)"/><path d="M4 7l2.5 2.5 4-4" stroke="#34D399" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <p style={{ fontSize: 13, color: "rgba(52,211,153,0.80)", margin: 0 }}>Plan updated successfully.</p>
        </div>
      )}
      {canceled && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, padding: "12px 18px", marginBottom: 20, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.16)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="rgba(251,191,36,0.55)" strokeWidth="1.2"/><path d="M7 4.5v3M7 9v.5" stroke="rgba(251,191,36,0.55)" strokeWidth="1.2" strokeLinecap="round"/></svg>
          <p style={{ fontSize: 13, color: "rgba(251,191,36,0.70)", margin: 0 }}>Checkout canceled — no charge was made.</p>
        </div>
      )}

      {/* Period toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 3, padding: 4, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["monthly", "yearly"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "5px 18px", borderRadius: 999, fontSize: 12, fontWeight: 500,
                cursor: "pointer", border: "none", fontFamily: "inherit",
                background: period === p ? "rgba(255,255,255,0.10)" : "transparent",
                color: period === p ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                transition: "all 180ms",
                textTransform: "capitalize",
              }}
            >
              {p}
            </button>
          ))}
        </div>
        {period === "yearly" && (
          <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 999, background: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.80)", border: "1px solid rgba(52,211,153,0.20)" }}>
            save 2 months
          </span>
        )}
      </div>

      {/* Plan cards — landing page visual style */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const price = period === "yearly" && plan.monthly > 0
            ? Math.round(plan.yearly / 12)
            : plan.monthly;
          const isLoading = loadingPlan === plan.id;

          return (
            <div
              key={plan.id}
              style={{
                position: "relative", overflow: "hidden",
                background: plan.featured
                  ? "rgba(26,115,232,0.05)"
                  : isCurrent
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.02)",
                border: plan.featured
                  ? "1px solid rgba(26,115,232,0.38)"
                  : isCurrent
                  ? "1px solid rgba(255,255,255,0.18)"
                  : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 20,
                padding: 24,
                display: "flex", flexDirection: "column", gap: 14,
                boxShadow: plan.featured ? "0 12px 40px rgba(26,115,232,0.16)" : "none",
                transition: "transform 260ms ease, border-color 260ms ease",
              }}
              onMouseEnter={(e) => { if (!plan.featured) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
            >
              {/* Top glow for featured */}
              {plan.featured && (
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(26,115,232,0.18) 0%, transparent 55%)", pointerEvents: "none" }} />
              )}

              {/* Plan name row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: plan.color, flexShrink: 0 }} />
                  {plan.name}
                </div>
                {plan.featured && !isCurrent && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: "rgba(26,115,232,0.22)", color: "#6BAEFF" }}>
                    {ISparkle} Most popular
                  </span>
                )}
                {isCurrent && (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.10)" }}>
                    Current
                  </span>
                )}
              </div>

              {/* Price */}
              {plan.monthly === 0 ? (
                <div>
                  <div style={{ fontSize: 14, color: "#34D399", fontWeight: 500 }}>Free forever</div>
                  <div style={{ fontSize: 11, visibility: "hidden" }}>–</div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 36, fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1, color: "rgba(255,255,255,0.85)" }}>
                      ${price}
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                      /mo{plan.perSeat ? " · per seat" : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 3, visibility: period === "yearly" ? "visible" : "hidden" }}>
                    billed ${plan.yearly}/yr
                  </div>
                </div>
              )}

              {/* Desc */}
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, margin: 0 }}>{plan.desc}</p>

              {/* CTA */}
              {isCurrent ? (
                <button disabled style={{
                  width: "100%", padding: "10px", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "default",
                  background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.30)",
                  fontFamily: "inherit",
                }}>
                  Current plan
                </button>
              ) : plan.contactSales ? (
                <a href="mailto:team@doppel.ai" style={{
                  display: "block", width: "100%", padding: "10px", textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)",
                  fontFamily: "inherit", textDecoration: "none",
                  transition: "background 180ms, border-color 180ms",
                }}>
                  Talk to us
                </a>
              ) : plan.id === "free" ? (
                <button disabled style={{
                  width: "100%", padding: "10px", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "default",
                  background: "transparent", color: "rgba(255,255,255,0.25)",
                  fontFamily: "inherit",
                }}>
                  Default plan
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={!!loadingPlan}
                  style={{
                    width: "100%", padding: "10px", border: "none",
                    borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "pointer",
                    background: plan.featured
                      ? "linear-gradient(135deg, #1A73E8, #4A90E2)"
                      : "rgba(255,255,255,0.09)",
                    color: "rgba(255,255,255,0.85)",
                    fontFamily: "inherit",
                    boxShadow: plan.featured ? "0 4px 18px rgba(26,115,232,0.38)" : "none",
                    transition: "opacity 180ms",
                    opacity: loadingPlan ? 0.6 : 1,
                  }}
                >
                  {isLoading ? "Redirecting…" : plan.featured ? `Get ${plan.name}` : `Upgrade to ${plan.name}`}
                </button>
              )}

              {/* Features */}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9, marginTop: "auto" }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
                    <CheckIcon color={plan.color} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
        Pro requires a 5-seat minimum.{" "}
        <a href="mailto:team@doppel.ai" style={{ color: "rgba(255,255,255,0.45)", textDecoration: "underline", textUnderlineOffset: 2 }}>
          Contact us
        </a>{" "}
        for volume pricing and custom contracts.
      </p>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="4.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.1"/><path d="M3.5 4.5V3A2.5 2.5 0 018.5 3v1.5" stroke="currentColor" strokeWidth="1.1"/></svg>
        Payments processed securely by Stripe. We never store card details.
      </div>

    </div>
  );
}
