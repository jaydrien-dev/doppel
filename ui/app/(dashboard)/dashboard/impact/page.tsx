"use client";

import { useEffect, useState } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";

interface ImpactMetrics {
  days: number;
  queries_answered: number;
  decisions_offloaded: number;
  emails_actioned: number;
  proposals_actioned: number;
  active_days: number;
  memory_chunks: number;
  hours_saved: number;
  minutes_saved: number;
}

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function ImpactPage() {
  const { clone, isLoading } = useClone();
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (clone) load();
  }, [clone?.clone_id, days]);

  async function load() {
    if (!clone) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/impact?clone_id=${clone.clone_id}&days=${days}`);
      if (res.ok) setMetrics(await res.json());
    } finally {
      setFetching(false);
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first.{" "}
          <a href="/onboarding" className="text-white/60 underline underline-offset-2">Get started →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Impact</h1>
        <p className="text-sm text-white/35 mt-1">
          Measure how much time and cognitive load your clone is saving.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 glass rounded-xl p-1 w-fit">
        {PERIODS.map(({ label, days: d }) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs transition-all",
              days === d ? "glass-md text-white/80" : "text-white/35 hover:text-white/55"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {fetching || !metrics ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Hero stat */}
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-5xl font-light text-white/90 mb-1">{metrics.hours_saved}h</p>
            <p className="text-sm text-white/40">estimated time saved in the last {days} days</p>
            <p className="text-xs text-white/25 mt-2">
              Based on 5 min/query · 15 min/email · 10 min/proposal
            </p>
          </div>

          {/* Metric grid */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              value={metrics.queries_answered}
              label="Queries answered"
              sub="Questions your clone handled"
            />
            <MetricCard
              value={metrics.decisions_offloaded}
              label="Decisions offloaded"
              sub="High-confidence answers, no escalation"
            />
            <MetricCard
              value={metrics.emails_actioned}
              label="Email drafts approved"
              sub="Replies written by your clone"
            />
            <MetricCard
              value={metrics.proposals_actioned}
              label="Proposals actioned"
              sub="Code reviews & calendar decisions"
            />
            <MetricCard
              value={metrics.active_days}
              label="Active days"
              sub={`Days with at least one query in ${days}d`}
            />
            <MetricCard
              value={metrics.memory_chunks}
              label="Memory chunks"
              sub="Indexed knowledge available to the brain"
            />
          </div>

          {/* Efficiency breakdown */}
          {metrics.queries_answered > 0 && (
            <div className="glass rounded-2xl p-6">
              <h3 className="text-sm font-medium text-white/60 mb-4">Breakdown</h3>
              <div className="flex flex-col gap-2.5">
                <BreakdownRow
                  label="Queries"
                  count={metrics.queries_answered}
                  minutes={metrics.queries_answered * 5}
                  color="bg-blue-400/30"
                  total={metrics.minutes_saved}
                />
                <BreakdownRow
                  label="Email drafts"
                  count={metrics.emails_actioned}
                  minutes={metrics.emails_actioned * 15}
                  color="bg-violet-400/30"
                  total={metrics.minutes_saved}
                />
                <BreakdownRow
                  label="Proposals"
                  count={metrics.proposals_actioned}
                  minutes={metrics.proposals_actioned * 10}
                  color="bg-emerald-400/30"
                  total={metrics.minutes_saved}
                />
              </div>
            </div>
          )}

          {metrics.queries_answered === 0 && (
            <div className="glass rounded-2xl p-6 text-center">
              <p className="text-sm text-white/30">
                No activity yet in this period.{" "}
                <a href="/dashboard/train" className="text-white/50 underline underline-offset-2">
                  Train your clone
                </a>{" "}
                and share it with your team.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ value, label, sub }: { value: number; label: string; sub: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-3xl font-light text-white/85 mb-1">{value.toLocaleString()}</p>
      <p className="text-xs text-white/55 font-medium">{label}</p>
      <p className="text-[11px] text-white/25 mt-0.5 leading-snug">{sub}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  count,
  minutes,
  color,
  total,
}: {
  label: string;
  count: number;
  minutes: number;
  color: string;
  total: number;
}) {
  const pct = total > 0 ? Math.round((minutes / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/45 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 glass rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/35 w-20 text-right shrink-0">
        {count} × → {Math.round(minutes / 60 * 10) / 10}h
      </span>
    </div>
  );
}
