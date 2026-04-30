"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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
  desc: string;
  monthly: number;
  yearly: number;
  queriesLabel: string;
  monthlyPriceEnvKey: string;
  yearlyPriceEnvKey: string;
  features: string[];
  companyBrain: boolean;
  contactSales: boolean;
}[] = [
  {
    id: "free",
    name: "Free",
    desc: "Try every feature. No credit card required.",
    monthly: 0,
    yearly: 0,
    queriesLabel: "50 queries / month",
    monthlyPriceEnvKey: "",
    yearlyPriceEnvKey: "",
    features: [
      "1 clone",
      "50 queries / month",
      "All ingestion sources",
      "Public shareable link",
      "Confidence + source UI",
      "Gmail, Slack, GitHub connectors",
    ],
    companyBrain: false,
    contactSales: false,
  },
  {
    id: "personal",
    name: "Personal",
    desc: "Full power for individuals.",
    monthly: 15,
    yearly: 150,
    queriesLabel: "250 queries / month",
    monthlyPriceEnvKey: "NEXT_PUBLIC_STRIPE_PERSONAL_MONTHLY_PRICE_ID",
    yearlyPriceEnvKey: "NEXT_PUBLIC_STRIPE_PERSONAL_YEARLY_PRICE_ID",
    features: [
      "Everything in Free",
      "250 queries / month (5×)",
      "Priority response speed",
      "Data export (GDPR Art. 20)",
      "Clone preservation + legal hold",
      "API access",
    ],
    companyBrain: false,
    contactSales: false,
  },
  {
    id: "enterprise_pro",
    name: "Enterprise Pro",
    desc: "Company Brain for teams.",
    monthly: 59,
    yearly: 590,
    queriesLabel: "1,250 queries / seat / month",
    monthlyPriceEnvKey: "NEXT_PUBLIC_STRIPE_ENT_PRO_MONTHLY_PRICE_ID",
    yearlyPriceEnvKey: "NEXT_PUBLIC_STRIPE_ENT_PRO_YEARLY_PRICE_ID",
    features: [
      "Everything in Personal",
      "1,250 queries / seat / month",
      "Company Brain + Role Brains",
      "Skills API for AI agents",
      "Cross-clone org search",
      "SCIM provisioning",
      "SSO / SAML",
      "Audit log + webhooks",
    ],
    companyBrain: true,
    contactSales: false,
  },
  {
    id: "enterprise_max",
    name: "Enterprise Max",
    desc: "Full scale. Dedicated support.",
    monthly: 179,
    yearly: 1790,
    queriesLabel: "5,000 queries / seat / month",
    monthlyPriceEnvKey: "",
    yearlyPriceEnvKey: "",
    features: [
      "Everything in Enterprise Pro",
      "5,000 queries / seat / month",
      "Dedicated CSM",
      "SOC 2 Type II",
      "Custom SLAs",
      "Volume discounts at 50+ seats",
    ],
    companyBrain: true,
    contactSales: true,
  },
];

const PRICE_IDS: Partial<Record<Tier, Record<Period, string>>> = {
  personal: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PERSONAL_MONTHLY_PRICE_ID ?? "",
    yearly: process.env.NEXT_PUBLIC_STRIPE_PERSONAL_YEARLY_PRICE_ID ?? "",
  },
  enterprise_pro: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_ENT_PRO_MONTHLY_PRICE_ID ?? "",
    yearly: process.env.NEXT_PUBLIC_STRIPE_ENT_PRO_YEARLY_PRICE_ID ?? "",
  },
};

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
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus({ tier: "free" }));
  }, []);

  async function handleUpgrade(planId: Tier) {
    const priceId = PRICE_IDS[planId]?.[period];
    if (!priceId) {
      alert("Stripe price not configured. Add the relevant NEXT_PUBLIC_STRIPE_* env vars.");
      return;
    }
    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json();
      if (data.url) router.push(data.url);
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
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-white/85">Billing</h1>
        <p className="text-sm text-white/35 mt-1">Manage your plan and subscription.</p>
      </div>

      {success && (
        <div className="glass-md rounded-2xl px-5 py-3 mb-6 flex items-center gap-3">
          <Check className="w-4 h-4 text-white/50 shrink-0" />
          <p className="text-sm text-white/70">Plan updated. Thanks!</p>
        </div>
      )}
      {canceled && (
        <div className="glass rounded-2xl px-5 py-3 mb-6">
          <p className="text-sm text-white/40">Checkout canceled — no charge was made.</p>
        </div>
      )}

      {/* Current plan */}
      <div className="glass rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-1">Current plan</p>
          <p className="text-lg font-light text-white/85">
            {PLANS.find((p) => p.id === currentTier)?.name ?? currentTier}
          </p>
          <p className="text-xs text-white/30 mt-0.5">
            {PLANS.find((p) => p.id === currentTier)?.queriesLabel}
          </p>
        </div>
        {isSubscribed && (
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/65 transition-colors disabled:opacity-40"
          >
            {portalLoading ? "Opening…" : "Manage billing"}
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Period toggle */}
      <div className="flex items-center gap-3 mb-6">
        <div className="glass rounded-full p-1 flex gap-1">
          {(["monthly", "yearly"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm transition-all capitalize",
                period === p ? "glass-md text-white/85" : "text-white/35 hover:text-white/55"
              )}
            >
              {p}
            </button>
          ))}
        </div>
        {period === "yearly" && <span className="text-xs text-white/30">2 months free</span>}
      </div>

      {/* Plan cards — 2×2 grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const price = period === "yearly"
            ? (plan.monthly > 0 ? Math.round(plan.yearly / 12) : 0)
            : plan.monthly;
          const isLoading = loadingPlan === plan.id;
          const isEnterprisePro = plan.id === "enterprise_pro";

          return (
            <div
              key={plan.id}
              className={cn(
                "rounded-2xl p-5 border flex flex-col transition-all",
                isCurrent ? "glass-hi border-white/[0.14]" : "glass border-white/[0.08]",
                isEnterprisePro && !isCurrent && "border-white/[0.10]"
              )}
            >
              {isCurrent && (
                <p className="text-[10px] uppercase tracking-widest text-white/35 mb-3">Current</p>
              )}

              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-base font-medium text-white/85">{plan.name}</h3>
                {plan.companyBrain && (
                  <span className="text-[10px] text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/12 rounded-full px-2 py-0.5 shrink-0">
                    Company Brain
                  </span>
                )}
              </div>
              <p className="text-xs text-white/35 mb-4 leading-relaxed">{plan.desc}</p>

              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-light text-white/80">
                    {plan.monthly === 0 ? "Free" : `$${price}`}
                  </span>
                  {plan.monthly > 0 && (
                    <span className="text-xs text-white/30">
                      /seat/mo{period === "yearly" && ", billed annually"}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/25 mt-0.5">{plan.queriesLabel}</p>
              </div>

              {isCurrent ? (
                <div className="w-full py-2 rounded-xl text-center text-sm text-white/30 glass mb-4">
                  Active
                </div>
              ) : plan.contactSales ? (
                <a
                  href="mailto:team@doppel.ai"
                  className="w-full py-2 rounded-xl text-center text-sm text-white/55 hover:text-white/75 glass hover:glass-md transition-all mb-4 block"
                >
                  Talk to us →
                </a>
              ) : plan.id === "free" ? (
                <div className="w-full py-2 mb-4" />
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isLoading}
                  className="w-full py-2 rounded-xl text-sm text-white/65 hover:text-white/85 glass hover:glass-md transition-all disabled:opacity-40 mb-4"
                >
                  {isLoading ? "Redirecting…" : `Upgrade to ${plan.name}`}
                </button>
              )}

              <ul className="space-y-2 mt-auto">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/40">
                    <Check className="w-3 h-3 text-white/25 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-white/20 text-center">
        Enterprise Pro requires a 5-seat minimum.{" "}
        <a href="mailto:team@doppel.ai" className="underline underline-offset-2 hover:text-white/40">
          Contact us
        </a>{" "}
        for volume pricing.
      </p>
    </div>
  );
}
