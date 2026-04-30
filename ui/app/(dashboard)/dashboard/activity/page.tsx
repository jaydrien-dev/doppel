"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import { submitFeedback } from "@/lib/api";
import type { ActivityTrace, FeedbackSignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Quality / style score header
// ---------------------------------------------------------------------------

interface QualityData {
  total_responses: number;
  has_feedback: number;
  pending_review: number;
  approved: number;
  edited: number;
  rejected: number;
  approval_rate: number | null;
  avg_confidence: number | null;
  escalations: number;
  trend_7d: { day: string; total: number; approved: number; edited: number }[];
}

function Sparkline({ trend }: { trend: QualityData["trend_7d"] }) {
  if (trend.length < 2) return null;
  const rates = trend.map((d) =>
    d.total > 0 ? (d.approved / d.total) * 100 : 0
  );
  const max = Math.max(...rates, 1);
  const w = 80;
  const h = 28;
  const pts = rates.map((v, i) => {
    const x = (i / (rates.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  const last = rates[rates.length - 1];
  const prev = rates[rates.length - 2];
  const up = last >= prev;

  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={up ? "rgba(52,211,153,0.5)" : "rgba(251,191,36,0.45)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={cn("text-[10px]", up ? "text-emerald-400/60" : "text-amber-400/55")}>
        {up ? "↑" : "↓"} 7d
      </span>
    </div>
  );
}

function QualityHeader({ cloneId }: { cloneId: string }) {
  const { data } = useSWR<QualityData>(
    `/api/brain/quality?clone_id=${cloneId}`,
    fetcher
  );
  if (!data || data.total_responses === 0) return null;

  const correctionRate = data.has_feedback > 0
    ? Math.round((data.edited / data.has_feedback) * 100)
    : 0;

  const metrics = [
    {
      label: "Approval rate",
      value: data.approval_rate != null ? `${data.approval_rate}%` : "—",
      sub: `${data.approved} of ${data.has_feedback} rated`,
    },
    {
      label: "Avg confidence",
      value: data.avg_confidence != null ? `${data.avg_confidence}%` : "—",
      sub: "across all responses",
    },
    {
      label: "Correction rate",
      value: `${correctionRate}%`,
      sub: `${data.edited} corrected · target <15%`,
      warn: correctionRate > 15,
    },
    {
      label: "Pending review",
      value: String(data.pending_review),
      sub: "awaiting your feedback",
      warn: data.pending_review > 10,
    },
  ];

  return (
    <div className="glass rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-white/50">Clone quality</p>
        <Sparkline trend={data.trend_7d} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {metrics.map(({ label, value, sub, warn }) => (
          <div key={label}>
            <p className={cn(
              "text-xl font-light",
              warn ? "text-amber-300/70" : "text-white/80"
            )}>
              {value}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">{label}</p>
            <p className="text-[10px] text-white/20 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filter = "all" | "pending" | "approved" | "edited" | "rejected";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "edited", label: "Corrected" },
  { value: "rejected", label: "Rejected" },
];

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SignalBadge({ signal }: { signal: ActivityTrace["feedback_signal"] }) {
  if (!signal) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/50 bg-amber-400/8 border border-amber-400/15 rounded-full px-2 py-0.5">
        <span className="w-1 h-1 rounded-full bg-amber-300/60 inline-block" />
        review
      </span>
    );
  }
  const styles: Record<string, string> = {
    approved: "text-white/55 bg-white/[0.06] border-white/10",
    edited: "text-blue-200/70 bg-blue-400/[0.08] border-blue-400/15",
    rejected: "text-white/30 bg-white/[0.03] border-white/8",
  };
  const labels: Record<string, string> = {
    approved: "approved",
    edited: "corrected",
    rejected: "rejected",
  };
  return (
    <span className={cn("text-[10px] border rounded-full px-2 py-0.5", styles[signal])}>
      {labels[signal]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline correction row
// ---------------------------------------------------------------------------

function TraceRow({
  trace,
  idx,
  total,
  onFeedback,
}: {
  trace: ActivityTrace;
  idx: number;
  total: number;
  onFeedback: (id: string, signal: FeedbackSignalType, correction?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  const canCorrect = !trace.feedback_signal || trace.feedback_signal === "rejected";

  async function handleFeedback(signal: FeedbackSignalType, correctedText?: string) {
    setSaving(true);
    try {
      await onFeedback(trace.id, signal, correctedText);
      setEditing(false);
      setCorrection("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn(idx < total - 1 && "border-b border-white/[0.04]")}>
      {/* Summary row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full grid grid-cols-[1fr_1fr_72px_68px] gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm text-white/70 truncate leading-snug">{trace.input_message}</p>
          <p className="text-[11px] text-white/25 mt-0.5">
            {formatTime(trace.created_at)}
            {trace.latency_ms != null && (
              <span className="ml-2">{trace.latency_ms}ms</span>
            )}
          </p>
        </div>
        <p className="text-sm text-white/40 truncate leading-snug self-center">
          {trace.response}
        </p>
        <div className="self-center">
          {trace.confidence != null ? (
            <span className="text-xs text-white/40">{Math.round(trace.confidence * 100)}%</span>
          ) : (
            <span className="text-white/20 text-xs">—</span>
          )}
        </div>
        <div className="self-center">
          <SignalBadge signal={trace.feedback_signal} />
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/[0.04] pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Question</p>
              <p className="text-sm text-white/65 leading-relaxed">{trace.input_message}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Response</p>
              <p className="text-sm text-white/55 leading-relaxed whitespace-pre-wrap">{trace.response}</p>
            </div>
          </div>

          {trace.needs_escalation && (
            <div className="glass rounded-xl px-3 py-2">
              <p className="text-xs text-white/40">Flagged for escalation — clone was uncertain</p>
            </div>
          )}

          {/* Correction interface */}
          {canCorrect && (
            <div className="border-t border-white/[0.06] pt-4">
              {!editing ? (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-white/30 mr-1">Train your clone:</p>
                  <button
                    onClick={() => handleFeedback("approved")}
                    disabled={saving}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-40 flex items-center gap-1"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1.5 5.5L4.5 8.5 9.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Approve
                  </button>
                  <span className="text-white/15">·</span>
                  <button
                    onClick={() => setEditing(true)}
                    disabled={saving}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
                  >
                    Write correction
                  </button>
                  <span className="text-white/15">·</span>
                  <button
                    onClick={() => handleFeedback("rejected")}
                    disabled={saving}
                    className="text-xs text-white/30 hover:text-white/55 transition-colors disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-white/30">What should your clone have said?</p>
                  <textarea
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                    placeholder="Type the ideal response…"
                    rows={3}
                    autoFocus
                    className="glass rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 outline-none resize-none leading-relaxed w-full"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleFeedback("edited", correction)}
                      disabled={saving || !correction.trim()}
                      className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/70 hover:text-white/90 transition-all disabled:opacity-40"
                    >
                      {saving ? "Saving…" : "Save correction"}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setCorrection(""); }}
                      className="text-xs text-white/30 hover:text-white/55 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {trace.feedback_signal && !canCorrect && (
            <div className="border-t border-white/[0.06] pt-3">
              <SignalBadge signal={trace.feedback_signal} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  const { clone, isLoading: cloneLoading } = useClone();
  const [filter, setFilter] = useState<Filter>("all");
  const [localFeedback, setLocalFeedback] = useState<Record<string, FeedbackSignalType>>({});

  const { data, isLoading, mutate } = useSWR<{ traces: ActivityTrace[] }>(
    clone?.clone_id ? `/api/activity?clone_id=${clone.clone_id}&limit=100` : null,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const allTraces = data?.traces ?? [];

  const traces = allTraces.filter((t) => {
    const signal = localFeedback[t.id] ?? t.feedback_signal;
    if (filter === "all") return true;
    if (filter === "pending") return !signal;
    return signal === filter || (filter === "edited" && signal === "edited");
  });

  const pendingCount = allTraces.filter(
    (t) => !(localFeedback[t.id] ?? t.feedback_signal)
  ).length;

  async function handleFeedback(traceId: string, signal: FeedbackSignalType, correction?: string) {
    if (!clone) return;
    await submitFeedback({
      trace_id: traceId,
      clone_id: clone.clone_id,
      signal_type: signal,
      corrected_response: correction,
    });
    setLocalFeedback((prev) => ({ ...prev, [traceId]: signal }));
    mutate();
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">Activity</h1>
          <p className="text-sm text-white/35 mt-1">
            Every query your clone has handled.
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-300/60">
                {pendingCount} need{pendingCount === 1 ? "s" : ""} review
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {clone && allTraces.length > 0 && (
            <a
              href={`/api/activity/export?clone_id=${clone.clone_id}`}
              download
              className="text-xs text-white/30 hover:text-white/55 transition-colors flex items-center gap-1.5"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v6M3 5l2.5 2.5L8 5M1 9h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export CSV
            </a>
          )}
          <button onClick={() => mutate()} className="text-xs text-white/30 hover:text-white/55 transition-colors mt-1">
            Refresh
          </button>
        </div>
      </div>

      {/* Quality metrics */}
      {clone && <QualityHeader cloneId={clone.clone_id} />}

      {/* Filter tabs */}
      {allTraces.length > 0 && (
        <div className="flex gap-1 glass rounded-xl p-1 w-fit mb-5">
          {FILTERS.map(({ value, label }) => {
            const count =
              value === "all"
                ? allTraces.length
                : value === "pending"
                ? pendingCount
                : allTraces.filter(
                    (t) => (localFeedback[t.id] ?? t.feedback_signal) === value
                  ).length;
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5",
                  filter === value
                    ? "glass-md text-white/80"
                    : "text-white/35 hover:text-white/55"
                )}
              >
                {label}
                {count > 0 && (
                  <span
                    className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                      filter === value ? "bg-white/10 text-white/60" : "bg-white/[0.06] text-white/30"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading / empty states */}
      {(cloneLoading || isLoading) && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-white/35">Loading…</p>
        </div>
      )}
      {!cloneLoading && !clone && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-white/35">Create your clone first to see activity.</p>
        </div>
      )}
      {!isLoading && clone && allTraces.length === 0 && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-white/35">
            No queries yet. Chat with your clone to see activity here.
          </p>
        </div>
      )}
      {!isLoading && clone && allTraces.length > 0 && traces.length === 0 && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-white/35">No responses match this filter.</p>
        </div>
      )}

      {/* Table */}
      {traces.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_72px_68px] gap-4 px-5 py-3 border-b border-white/[0.06]">
            {["Question", "Response", "Confidence", "Status"].map((h) => (
              <span key={h} className="text-[10px] uppercase tracking-widest text-white/25 font-medium">
                {h}
              </span>
            ))}
          </div>

          {traces.map((trace, idx) => (
            <TraceRow
              key={trace.id}
              trace={{ ...trace, feedback_signal: localFeedback[trace.id] ?? trace.feedback_signal }}
              idx={idx}
              total={traces.length}
              onFeedback={handleFeedback}
            />
          ))}
        </div>
      )}
    </div>
  );
}
