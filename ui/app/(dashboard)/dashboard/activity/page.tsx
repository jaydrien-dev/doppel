"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import { submitFeedback } from "@/lib/api";
import type { ActivityTrace, FeedbackSignalType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Reports tab — activity analytics
// ---------------------------------------------------------------------------

interface ActivityReport {
  period_days: number;
  total_queries: number;
  unique_questioners: number;
  total_sessions: number;
  avg_latency_ms: number;
  queries_by_day: { day: string; count: number }[];
  top_questioners: { sender_id: string; query_count: number; last_active: string | null }[];
  top_questions: { message: string; count: number }[];
  themes: { theme: string; count: number }[];
}

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  if (data.length === 0) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>No data for this period</p>
    </div>
  );
  const max = Math.max(...data.map((d) => d.count), 1);
  const barW = Math.max(4, Math.min(18, Math.floor(560 / data.length) - 3));
  const gap = Math.max(2, Math.floor(560 / data.length) - barW);
  const chartW = data.length * (barW + gap) - gap;
  const chartH = 64;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={chartW} height={chartH + 20} viewBox={`0 0 ${chartW} ${chartH + 20}`} style={{ display: "block" }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.count / max) * chartH));
          const x = i * (barW + gap);
          const y = chartH - barH;
          const isWeekend = [0, 6].includes(new Date(d.day).getDay());
          return (
            <g key={d.day}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={d.count > 0 ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.06)"}
                rx={Math.min(2, barW / 3)} />
              {/* Show day label for every ~7th bar */}
              {(i % Math.max(1, Math.floor(data.length / 8)) === 0) && (
                <text x={x + barW / 2} y={chartH + 14} textAnchor="middle"
                  fontSize={9} fill={isWeekend ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.28)"}>
                  {d.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function maskId(id: string): string {
  if (!id || id.length < 6) return "anonymous";
  return id.slice(0, 4) + "…" + id.slice(-4);
}

function ActivityReportTab({ cloneId }: { cloneId: string }) {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useSWR<ActivityReport>(
    `/api/brain/activity-report?clone_id=${cloneId}&days=${days}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  function handleExport() {
    const a = document.createElement("a");
    a.href = `/api/brain/activity-report/export?clone_id=${cloneId}&days=${days}`;
    a.download = `activity-report-${days}d.csv`;
    a.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none", fontFamily: "inherit",
              background: days === d ? "rgba(255,255,255,0.09)" : "transparent",
              color: days === d ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.38)",
              transition: "all 150ms",
            }}>{d}d</button>
          ))}
        </div>
        <button onClick={handleExport} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 500,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
          color: "rgba(255,255,255,0.50)", cursor: "pointer", fontFamily: "inherit",
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v6M3 5l2.5 2.5L8 5M1 9h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Export CSV
        </button>
      </div>

      {isLoading && (
        <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>Loading…</p>
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "Queries", value: data.total_queries.toLocaleString() },
              { label: "Unique askers", value: data.unique_questioners.toLocaleString() },
              { label: "Sessions", value: data.total_sessions.toLocaleString() },
              { label: "Avg latency", value: data.avg_latency_ms > 0 ? `${data.avg_latency_ms}ms` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="card" style={{ padding: "16px 18px" }}>
                <p style={{ fontSize: 22, fontWeight: 300, color: "rgba(255,255,255,0.80)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>{value}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", margin: 0, textTransform: "uppercase", letterSpacing: "0.09em" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Volume chart */}
          <div className="card" style={{ padding: "18px 20px" }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>
              Queries per day
            </p>
            <BarChart data={data.queries_by_day} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Top questioners */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", margin: 0 }}>Top askers</p>
              </div>
              {data.top_questioners.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "16px 18px", margin: 0 }}>No data</p>
              ) : (
                data.top_questioners.map((q, i) => (
                  <div key={q.sender_id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 18px",
                    borderBottom: i < data.top_questioners.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", width: 14, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", margin: 0, fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {maskId(q.sender_id)}
                      </p>
                      {q.last_active && (
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", margin: "2px 0 0" }}>
                          last {new Date(q.last_active).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 300, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>{q.query_count}</span>
                  </div>
                ))
              )}
            </div>

            {/* Top questions */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", margin: 0 }}>Repeated questions</p>
              </div>
              {data.top_questions.filter((q) => q.count > 1).length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "16px 18px", margin: 0 }}>No repeated questions yet</p>
              ) : (
                data.top_questions.filter((q) => q.count > 1).slice(0, 10).map((q, i, arr) => (
                  <div key={i} style={{
                    padding: "9px 18px",
                    borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", width: 14, flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0, flex: 1, lineHeight: 1.5,
                      overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {q.message}
                    </p>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>×{q.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Themes */}
          {data.themes.length > 0 && (
            <div className="card" style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>
                Recurring themes
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.themes.map((t) => (
                  <span key={t.theme} style={{
                    fontSize: 12, padding: "4px 10px", borderRadius: 999,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.50)",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                    {t.theme}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
  // Local signal state for immediate feedback — don't rely on prop propagation from parent
  const [localSignal, setLocalSignal] = useState<FeedbackSignalType | null>(null);
  const signal = localSignal ?? trace.feedback_signal;

  async function act(s: FeedbackSignalType, correctedText?: string) {
    if (saving) return;
    setSaving(true);
    setLocalSignal(s); // show badge immediately on click
    try {
      await onFeedback(trace.id, s, correctedText);
      setEditing(false);
      setCorrection("");
    } catch {
      setLocalSignal(null); // revert on API failure
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

  // Already actioned rows show a badge
  if (signal) {
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
  const { clones, isLoading: cloneLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  const [tab, setTab] = useState<"review" | "reports">("review");
  const [filter, setFilter] = useState<Filter>("all");
  const [localFeedback, setLocalFeedback] = useState<Record<string, FeedbackSignalType>>({});

  // Reset feedback when switching clones
  useEffect(() => { setLocalFeedback({}); }, [clone?.clone_id]);

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
          <h1 className="db-h1">Activity{tab === "review" && pendingCount > 0 && <em> · {pendingCount} to review</em>}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ClonePicker clones={clones} selected={clone ?? clones[0]} onSelect={c => setSelectedId(c.clone_id)} />
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {(["review", "reports"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500,
                cursor: "pointer", border: "none", fontFamily: "inherit",
                background: tab === t ? "rgba(255,255,255,0.09)" : "transparent",
                color: tab === t ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.38)",
                transition: "all 150ms", textTransform: "capitalize",
              }}>{t}</button>
            ))}
          </div>
          {tab === "review" && clone && allTraces.length > 0 && (
            <a href={`/api/activity/export?clone_id=${clone.clone_id}`} download className="btn btn--ghost btn--sm">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v6M3 5l2.5 2.5L8 5M1 9h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export CSV
            </a>
          )}
          {tab === "review" && <button onClick={() => mutate()} className="btn btn--ghost btn--sm">Refresh</button>}
        </div>
      </div>

      {/* Reports tab */}
      {tab === "reports" && clone && <ActivityReportTab cloneId={clone.clone_id} />}
      {tab === "reports" && !clone && !cloneLoading && (
        <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>Create your clone first.</p></div>
      )}

      {tab === "review" && clone && <QualityHeader cloneId={clone.clone_id} />}

      {tab === "review" && allTraces.length > 0 && (
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

      {tab === "review" && (cloneLoading || isLoading) && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>Loading…</p></div>}
      {tab === "review" && !cloneLoading && !clone && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>Create your clone first to see activity.</p></div>}
      {tab === "review" && !isLoading && clone && allTraces.length === 0 && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>No queries yet. Chat with your clone to see activity here.</p></div>}
      {tab === "review" && !isLoading && clone && allTraces.length > 0 && traces.length === 0 && <div className="card"><p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>No responses match this filter.</p></div>}

      {tab === "review" && traces.length > 0 && (
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
