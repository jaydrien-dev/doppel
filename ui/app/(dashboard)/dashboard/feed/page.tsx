"use client";

import { useState } from "react";
import useSWR from "swr";
import { useOrg } from "@/lib/hooks/useOrg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { ActivityTrace } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function rel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Derive a signal category from trace metadata / surface
function getSignalType(trace: ActivityTrace): { label: string; color: string } {
  if (trace.needs_escalation) return { label: "Escalation", color: "text-amber-400/70 bg-amber-400/10" };
  const msg = (trace.input_message ?? "").toLowerCase();
  if (msg.includes("decision") || msg.includes("approved") || msg.includes("decided"))
    return { label: "Decision", color: "text-violet-400/60 bg-violet-400/[0.07]" };
  if (msg.includes("meeting") || msg.includes("call") || msg.includes("sync"))
    return { label: "Meeting", color: "text-white/40 bg-white/[0.05]" };
  if (msg.includes("code") || msg.includes("deploy") || msg.includes("pr") || msg.includes("commit"))
    return { label: "Code", color: "text-white/40 bg-white/[0.05]" };
  return { label: "Query", color: "text-white/30 bg-white/[0.04]" };
}

// Tiny source icons as inline SVG
function SourceDot({ source }: { source?: string }) {
  const colors: Record<string, string> = {
    gmail: "bg-red-400/30",
    slack: "bg-violet-400/30",
    github: "bg-white/20",
    notion: "bg-white/20",
    meeting: "bg-white/20",
    api: "bg-emerald-400/20",
    chat: "bg-emerald-400/20",
  };
  const color = colors[source ?? "chat"] ?? "bg-white/15";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
}

const FILTERS = ["All", "Decisions", "Escalations", "Code", "Meetings"] as const;
type Filter = (typeof FILTERS)[number];

function SignalCard({ trace }: { trace: ActivityTrace }) {
  const signal = getSignalType(trace);
  const fb = trace.feedback_signal;
  const fbDot =
    fb === "approved" ? "bg-emerald-400/60" :
    fb === "edited"   ? "bg-blue-300/50" :
    fb === "rejected" ? "bg-red-400/50" :
    "bg-white/10";

  return (
    <div className="flex items-start gap-3 glass hover:glass-md rounded-xl px-4 py-3.5 transition-all group">
      {/* Left: feedback dot */}
      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${fbDot}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] rounded-full px-2 py-px ${signal.color}`}>{signal.label}</span>
          {trace.needs_escalation && (
            <span className="text-[10px] text-amber-400/60 bg-amber-400/10 rounded-full px-2 py-px">
              needs review
            </span>
          )}
        </div>
        <p className="text-sm text-white/55 group-hover:text-white/70 transition-colors truncate leading-relaxed">
          {trace.input_message}
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 shrink-0">
        {trace.confidence != null && (
          <span className="text-[11px] text-white/20 font-mono">{trace.confidence}%</span>
        )}
        <span className="text-[11px] text-white/20">{rel(trace.created_at)}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass rounded-2xl px-6 py-16 text-center">
      <p className="text-sm text-white/25">No signals yet.</p>
      <p className="text-xs text-white/15 mt-1">
        Connect team members' clones and activity will appear here.
      </p>
    </div>
  );
}

export default function FeedPage() {
  const { org, isLoading: orgLoading } = useOrg();
  const [filter, setFilter] = useState<Filter>("All");

  const { data, isLoading } = useSWR<{ traces: ActivityTrace[] }>(
    `/api/activity?limit=50`,
    fetcher,
    { refreshInterval: 15_000 }
  );

  const allTraces = data?.traces ?? [];

  // Apply filter
  const filtered = allTraces.filter((trace) => {
    if (filter === "All") return true;
    const sig = getSignalType(trace);
    if (filter === "Decisions") return sig.label === "Decision";
    if (filter === "Escalations") return trace.needs_escalation;
    if (filter === "Code") return sig.label === "Code";
    if (filter === "Meetings") return sig.label === "Meeting";
    return true;
  });

  // Counts for filter pills
  const counts: Record<Filter, number> = {
    All: allTraces.length,
    Decisions: allTraces.filter((t) => getSignalType(t).label === "Decision").length,
    Escalations: allTraces.filter((t) => t.needs_escalation).length,
    Code: allTraces.filter((t) => getSignalType(t).label === "Code").length,
    Meetings: allTraces.filter((t) => getSignalType(t).label === "Meeting").length,
  };

  if (orgLoading) return <LoadingSpinner />;

  if (!org) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create an org workspace first from{" "}
          <a href="/dashboard/org" className="text-white/60 underline underline-offset-2">Team</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">Intelligence Feed</h1>
          <p className="text-sm text-white/35 mt-1">
            Signals from your team's clones — decisions, escalations, and activity in one stream.
          </p>
        </div>
        <span className="text-[10px] text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/[0.12] rounded-full px-2.5 py-1">
          Enterprise
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total signals", value: allTraces.length },
          { label: "Escalations", value: counts.Escalations },
          { label: "Decisions",   value: counts.Decisions },
          {
            label: "Reviewed",
            value: allTraces.filter((t) => t.feedback_signal != null).length,
          },
        ].map(({ label, value }) => (
          <div key={label} className="glass rounded-2xl px-5 py-4">
            <p className="text-2xl font-light text-white/80 tabular-nums">{value}</p>
            <p className="text-xs text-white/35 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Feed panel */}
      <div className="glass rounded-2xl p-5">
        {/* Filter row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all ${
                filter === f
                  ? "glass-md text-white/70"
                  : "glass text-white/30 hover:text-white/55"
              }`}
            >
              {f}
              {counts[f] > 0 && (
                <span className="text-[10px] text-white/25 tabular-nums">{counts[f]}</span>
              )}
            </button>
          ))}

          {/* Live indicator */}
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-400/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
            Live
          </div>
        </div>

        {/* Feed */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 glass rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((trace) => (
              <SignalCard key={trace.id} trace={trace} />
            ))}
          </div>
        )}
      </div>

      {/* Feed explainer */}
      <div className="glass rounded-2xl p-5">
        <p className="text-xs font-medium text-white/40 mb-3">How signals are generated</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              title: "Clone queries",
              desc: "Every message sent to any team clone appears here in real time.",
            },
            {
              title: "Escalations",
              desc: "When a clone flags a query as needing human review, it surfaces as an escalation signal.",
            },
            {
              title: "Decisions",
              desc: "Queries containing decision language are automatically tagged and surfaced.",
            },
          ].map(({ title, desc }) => (
            <div key={title}>
              <p className="text-xs text-white/50 mb-1">{title}</p>
              <p className="text-[11px] text-white/25 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
