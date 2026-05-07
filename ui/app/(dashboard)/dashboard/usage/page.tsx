"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface UsageData {
  tier: "free" | "personal" | "enterprise_pro" | "enterprise_max";
  queries_this_month: number;
  queries_today: number;
  queries_total: number;
  monthly_limit: number;
  rate_limit_per_day: number;
  memory_chunks: number;
  member_since: string | null;
}

const TIER_NAMES: Record<string, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Enterprise Pro",
  enterprise_max: "Enterprise Max",
};

const TIER_COLORS: Record<string, string> = {
  free: "text-white/40 bg-white/[0.05] border-white/[0.08]",
  personal: "text-emerald-400/70 bg-emerald-400/[0.08] border-emerald-400/[0.15]",
  enterprise_pro: "text-violet-400/60 bg-violet-400/[0.07] border-violet-400/[0.12]",
  enterprise_max: "text-violet-400/70 bg-violet-400/[0.09] border-violet-400/[0.15]",
};

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!data) return (
    <div className="p-8">
      <p className="text-sm text-white/30">Could not load usage data.</p>
    </div>
  );

  const { tier, queries_this_month, queries_today, queries_total, monthly_limit, memory_chunks, member_since, rate_limit_per_day } = data;
  const unlimited = monthly_limit === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((queries_this_month / monthly_limit) * 100));
  const nearLimit = !unlimited && pct >= 80;

  return (
    <div className="p-8 max-w-4xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-light text-white/85">Usage</h1>
        <p className="text-sm text-white/35 mt-1">Your plan usage for the current billing period.</p>
      </div>

      {/* Plan banner */}
      <div className="glass rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-1">Current plan</p>
          <div className="flex items-center gap-2">
            <span className="text-lg font-light text-white/85">{TIER_NAMES[tier] ?? tier}</span>
            <span className={`text-xs border rounded-full px-2 py-0.5 capitalize ${TIER_COLORS[tier]}`}>
              {TIER_NAMES[tier] ?? tier}
            </span>
          </div>
          {member_since && (
            <p className="text-xs text-white/25 mt-1">
              Member since {new Date(member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        {(tier === "free" || tier === "personal") && (
          <Link
            href="/dashboard/billing"
            className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white/85 transition-all shrink-0"
          >
            Upgrade →
          </Link>
        )}
      </div>

      {/* Monthly queries */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-white/60">Queries this month</p>
            <p className="text-xs text-white/30 mt-0.5">Resets on the 1st of each month</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-light text-white/85">{queries_this_month.toLocaleString()}</p>
            <p className="text-xs text-white/30 mt-0.5">
              {unlimited ? "unlimited" : `of ${monthly_limit.toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {!unlimited && (
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${nearLimit ? "bg-red-400/50" : "bg-white/25"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={`text-xs ${nearLimit ? "text-red-400/60" : "text-white/25"}`}>
              {pct}% used
              {nearLimit && (tier === "free" || tier === "personal") && (
                <span> — running low. <Link href="/dashboard/billing" className="underline underline-offset-2 hover:text-red-400/80">Upgrade</Link></span>
              )}
            </p>
          </div>
        )}

        {unlimited && (
          <div className="h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-full w-full rounded-full bg-emerald-400/30" />
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today" value={queries_today} unit="queries" />
        <StatCard label="All time" value={queries_total} unit="queries" />
        <StatCard label="Memory" value={memory_chunks} unit="chunks" />
      </div>

      {/* Limits table */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-medium text-white/60">Plan limits</h3>
        <div className="space-y-3">
          <LimitRow
            label="Monthly queries"
            value={unlimited ? "Unlimited" : `${monthly_limit.toLocaleString()} / month`}
            active={tier !== "free"}
          />
          <LimitRow
            label="Daily rate limit"
            value={rate_limit_per_day > 0 ? `${rate_limit_per_day} / day` : "None set"}
            active={rate_limit_per_day > 0}
          />
          <LimitRow
            label="All ingestion sources"
            value="Included"
            active={true}
          />
          <LimitRow
            label="API access"
            value={tier === "free" ? "Not included" : "Included"}
            active={tier !== "free"}
          />
          <LimitRow
            label="Data export + legal hold"
            value={tier === "free" ? "Not included" : "Included"}
            active={tier !== "free"}
          />
          <LimitRow
            label="Company Brain"
            value={tier === "enterprise_pro" || tier === "enterprise_max" ? "Included" : "Not included"}
            active={tier === "enterprise_pro" || tier === "enterprise_max"}
          />
          <LimitRow
            label="SCIM + SSO"
            value={tier === "enterprise_pro" || tier === "enterprise_max" ? "Included" : "Not included"}
            active={tier === "enterprise_pro" || tier === "enterprise_max"}
          />
        </div>

        {(tier === "free" || tier === "personal") && (
          <div className="pt-2 border-t border-white/[0.06]">
            <p className="text-xs text-white/30 leading-relaxed">
              {tier === "free"
                ? "Upgrade to Personal for 250 queries/month, API access, and data export."
                : "Upgrade to Enterprise Pro for Company Brain, role brains, and the Skills API."}{" "}
              <Link href="/dashboard/billing" className="text-white/50 underline underline-offset-2 hover:text-white/70">
                View plans →
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="glass rounded-2xl p-4 text-center">
      <p className="text-2xl font-light text-white/80">{value.toLocaleString()}</p>
      <p className="text-[11px] text-white/30 mt-0.5">{unit}</p>
      <p className="text-[11px] text-white/20 uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}

function LimitRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/40">{label}</span>
      <span className={`text-xs ${active ? "text-white/70" : "text-white/25"}`}>{value}</span>
    </div>
  );
}
