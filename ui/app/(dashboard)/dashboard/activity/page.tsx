"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import { submitFeedback } from "@/lib/api";
import type { ActivityTrace, FeedbackSignalType } from "@/lib/types";

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
  const rates = trend.map((d) => d.total > 0 ? (d.approved / d.total) * 100 : 0);
  const max = Math.max(...rates, 1);
  const w = 80; const h = 28;
  const pts = rates.map((v, i) => {
    const x = (i / (rates.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  const up = rates[rates.length - 1] >= rates[rates.length - 2];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline points={pts.join(" ")} fill="none"
          stroke={up ? "rgba(52,211,153,0.5)" : "rgba(251,191,36,0.45)"}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 10, color: up ? "rgba(52,211,153,0.60)" : "rgba(251,191,36,0.55)" }}>
        {up ? "↑" : "↓"} 7d
      </span>
    </div>
  );
}

function QualityHeader({ cloneId }: { cloneId: string }) {
  const { data } = useSWR<QualityData>(`/api/brain/quality?clone_id=${cloneId}`, fetcher);
  if (!data || data.total_responses === 0) return null;
  const correctionRate = data.has_feedback > 0 ? Math.round((data.edited / data.has_feedback) * 100) : 0;
  const metrics = [
    { label: "Approval rate", value: data.approval_rate != null ? `${data.approval_rate}%` : "—", sub: `${data.approved} of ${data.has_feedback} rated`, warn: false },
    { label: "Avg confidence", value: data.avg_confidence != null ? `${data.avg_confidence}%` : "—", sub: "across all responses", warn: false },
    { label: "Correction rate", value: `${correctionRate}%`, sub: `${data.edited} corrected · target <15%`, warn: correctionRate > 15 },
    { label: "Pending review", value: String(data.pending_review), sub: "awaiting your feedback", warn: data.pending_review > 10 },
  ];
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", margin: 0 }}>Clone quality</p>
        <Sparkline trend={data.trend_7d} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {metrics.map(({ label, value, sub, warn }) => (
          <div key={label}>
            <p style={{ fontSize: 22, fontWeight: 300, color: warn ? "rgba(251,191,36,0.70)" : "rgba(255,255,255,0.80)", margin: "0 0 3px" }}>{value}</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "0 0 2px" }}>{label}</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", margin: 0 }}>{sub}</p>
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
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SignalBadge({ signal }: { signal: ActivityTrace["feedback_signal"] }) {
  if (!signal) return <span className="badge badge--warn"><span className="badge__dot" />review</span>;
  if (signal === "approved") return <span className="badge badge--neutral">approved</span>;
  if (signal === "edited") return <span className="badge badge--neutral" style={{ color: "rgba(147,197,253,0.70)" }}>corrected</span>;
  return <span className="badge badge--neutral" style={{ opacity: 0.55 }}>rejected</span>;
}

// Inline action buttons — always fixed position in the last column, no expand needed
function ActionButtons({ trace, onFeedback }: {
  trace: ActivityTrace;
  onFeedback: (id: string, signal: FeedbackSignalType, correction?: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState("");
  const signal = trace.feedback_signal;

  async function act(s: FeedbackSignalType, correctedText?: string) {
    if (saving) return;
    setSaving(true);
    try {
      await onFeedback(trace.id, s, correctedText);
      setEditing(false);
      setCorrection("");
    } catch {
      // local state was already updated optimistically in onFeedback; ignore
    } finally {
      setSaving(false);
    }
  }

  // Drawer renders outside the column-content logic so it's never blocked by early returns
  const drawer = editing ? (
    <div
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 50, width: 420,
        background: "rgba(14,14,16,0.97)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16, padding: "18px 20px 16px",
        boxShadow: "0 16px 48px rgba(0,0,0,0.70), 0 0 0 0.5px rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
      }}
      onClick={e => e.stopPropagation()}
    >
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.30)", margin: "0 0 10px" }}>Write correction</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 10px", lineHeight: 1.5 }}>
        What should your clone have said?
      </p>
      <textarea
        value={correction} onChange={e => setCorrection(e.target.value)}
        placeholder="Type the ideal response…" rows={4} autoFocus className="input"
        style={{ resize: "none", lineHeight: 1.6, width: "100%", marginBottom: 12 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => act("edited", correction)} disabled={saving || !correction.trim()} className="btn btn--primary btn--sm">
          {saving ? "Saving…" : "Save correction"}
        </button>
        <button onClick={() => { setEditing(false); setCorrection(""); }} className="btn btn--ghost btn--sm">Cancel</button>
      </div>
    </div>
  ) : null;

  // Already actioned rows show a badge (rejected rows stay actionable)
  if (signal && signal !== "rejected") {
    return <>{drawer}<SignalBadge signal={signal} /></>;
  }

  // While editing show a hint in the column, drawer renders above
  if (editing) {
    return <>{drawer}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>editing↓</span></>;
  }

  return (
    <>{drawer}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        {/* Approve */}
        <button
          onClick={() => act("approved")}
          disabled={saving}
          title="Approve"
          style={{
            width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(52,211,153,0.20)",
            background: "rgba(52,211,153,0.06)", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", transition: "all 130ms",
            color: "rgba(52,211,153,0.65)", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(52,211,153,0.14)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.40)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(52,211,153,0.06)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.20)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1.5 5.5L4.5 8.5 9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* Edit */}
        <button
          onClick={() => setEditing(true)}
          disabled={saving}
          title="Write correction"
          style={{
            width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", transition: "all 130ms",
            color: "rgba(255,255,255,0.40)", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.70)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.40)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M8 2l2 2-6 6H2V8l6-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* Reject */}
        <button
          onClick={() => act("rejected")}
          disabled={saving}
          title="Reject"
          style={{
            width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(248,113,113,0.15)",
            background: "rgba(248,113,113,0.04)", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", transition: "all 130ms",
            color: "rgba(248,113,113,0.45)", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.35)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.04)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </>
  );
}

function TraceRow({ trace, idx, total, onFeedback }: {
  trace: ActivityTrace; idx: number; total: number;
  onFeedback: (id: string, signal: FeedbackSignalType, correction?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: idx < total - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
      {/* Main row — click text area to expand, buttons stay in column */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 60px 100px",
        gap: 16, padding: "12px 20px", alignItems: "center",
      }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", minWidth: 0, padding: 0 }}
        >
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.70)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {trace.input_message}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>
            {formatTime(trace.created_at)}
            {trace.latency_ms != null && <span style={{ marginLeft: 8 }}>{trace.latency_ms}ms</span>}
          </p>
        </button>

        <button
          onClick={() => setOpen(v => !v)}
          style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", minWidth: 0, padding: 0 }}
        >
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {trace.response}
          </p>
        </button>

        <div>
          {trace.confidence != null
            ? <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", fontFamily: "ui-monospace,Menlo,monospace" }}>{Math.round(trace.confidence * 100)}%</span>
            : <span style={{ color: "rgba(255,255,255,0.20)", fontSize: 12 }}>—</span>}
        </div>

        {/* Always-fixed action column */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <ActionButtons trace={trace} onFeedback={onFeedback} />
        </div>
      </div>

      {/* Expandable detail — only Q&A text, no action buttons here */}
      {open && (
        <div style={{ padding: "4px 20px 18px", display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", margin: "0 0 6px" }}>Question</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6, margin: 0 }}>{trace.input_message}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", margin: "0 0 6px" }}>Response</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{trace.response}</p>
            </div>
          </div>
          {trace.needs_escalation && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>Flagged for escalation — clone was uncertain</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const { clone, isLoading: cloneLoading } = useClone();
  const [filter, setFilter] = useState<Filter>("all");
  const [localFeedback, setLocalFeedback] = useState<Record<string, FeedbackSignalType>>({});

  const { data, isLoading, mutate } = useSWR<{ traces: ActivityTrace[] }>(
    clone?.clone_id ? `/api/activity?clone_id=${clone.clone_id}&limit=100` : null,
    fetcher, { refreshInterval: 30_000 }
  );

  const allTraces = data?.traces ?? [];
  const traces = allTraces.filter((t) => {
    const signal = localFeedback[t.id] ?? t.feedback_signal;
    if (filter === "all") return true;
    if (filter === "pending") return !signal;
    return signal === filter || (filter === "edited" && signal === "edited");
  });
  const pendingCount = allTraces.filter((t) => !(localFeedback[t.id] ?? t.feedback_signal)).length;

  async function handleFeedback(traceId: string, signal: FeedbackSignalType, correction?: string) {
    if (!clone) return;
    // Optimistic update — UI responds immediately
    setLocalFeedback((prev) => ({ ...prev, [traceId]: signal }));
    try {
      await submitFeedback({ trace_id: traceId, clone_id: clone.clone_id, signal_type: signal, corrected_response: correction });
      mutate();
    } catch (e) {
      // Revert optimistic update on failure
      setLocalFeedback((prev) => { const next = { ...prev }; delete next[traceId]; return next; });
      console.error("[activity] feedback failed:", e);
    }
  }

  return (
    <div className="db-page" style={{ "--page-accent": "#1A73E8" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Monitoring</p>
          <h1 className="db-h1">Activity{pendingCount > 0 && <em> · {pendingCount} to review</em>}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {clone && allTraces.length > 0 && (
            <a href={`/api/activity/export?clone_id=${clone.clone_id}`} download className="btn btn--ghost btn--sm">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v6M3 5l2.5 2.5L8 5M1 9h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export CSV
            </a>
          )}
          <button onClick={() => mutate()} className="btn btn--ghost btn--sm">Refresh</button>
        </div>
      </div>

      {clone && <QualityHeader cloneId={clone.clone_id} />}

      {allTraces.length > 0 && (
        <div style={{
          display: "inline-flex", gap: 4, marginBottom: 18, padding: 4, borderRadius: 12,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {FILTERS.map(({ value, label }) => {
            const count = value === "all" ? allTraces.length : value === "pending" ? pendingCount
              : allTraces.filter((t) => (localFeedback[t.id] ?? t.feedback_signal) === value).length;
            return (
              <button key={value} onClick={() => setFilter(value)} style={{
                padding: "6px 14px", borderRadius: 9, fontSize: 12, fontWeight: 500,
                cursor: "pointer", border: "none", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                background: filter === value ? "rgba(255,255,255,0.09)" : "transparent",
                color: filter === value ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
                transition: "all 180ms",
              }}>
                {label}
                {count > 0 && (
                  <span style={{
                    fontSize: 10, borderRadius: 9999, padding: "1px 6px", minWidth: 18, textAlign: "center",
                    background: filter === value ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                    color: filter === value ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.30)",
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {(cloneLoading || isLoading) && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>Loading…</p></div>}
      {!cloneLoading && !clone && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>Create your clone first to see activity.</p></div>}
      {!isLoading && clone && allTraces.length === 0 && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>No queries yet. Chat with your clone to see activity here.</p></div>}
      {!isLoading && clone && allTraces.length > 0 && traces.length === 0 && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>No responses match this filter.</p></div>}

      {traces.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 100px", gap: 16, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["Question", "Response", "Conf.", "Actions"].map((h) => (
              <span key={h} style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>{h}</span>
            ))}
          </div>
          {traces.map((trace, idx) => (
            <TraceRow
              key={trace.id}
              trace={{ ...trace, feedback_signal: localFeedback[trace.id] ?? trace.feedback_signal }}
              idx={idx} total={traces.length} onFeedback={handleFeedback}
            />
          ))}
        </div>
      )}
    </div>
  );
}
