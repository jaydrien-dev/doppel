"use client";

import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

// ---------------------------------------------------------------------------
// Tiny sparkline — inline SVG, no deps
// ---------------------------------------------------------------------------

function Sparkline({ data }: { data: QualityData["trend_7d"] }) {
  if (data.length < 2) return null;

  const W = 120;
  const H = 28;
  const PAD = 2;

  // Approval rate per day (approved + edited = good)
  const rates = data.map((d) =>
    d.total > 0 ? ((d.approved + d.edited) / d.total) * 100 : 0
  );
  const max = Math.max(...rates, 1);
  const min = Math.min(...rates);
  const range = max - min || 1;

  const pts = rates.map((r, i) => {
    const x = PAD + (i / (rates.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((r - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });

  const path = `M${pts.join("L")}`;

  // Filled area
  const area = `M${pts[0]}L${pts.join("L")}L${PAD + (W - PAD * 2)},${H - PAD}L${PAD},${H - PAD}Z`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <path d={area} fill="rgba(255,255,255,0.04)" />
      <path d={path} stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function CloneQualityCard({ cloneId }: { cloneId: string }) {
  const { data, isLoading } = useSWR<QualityData>(
    `/api/brain/quality?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 animate-pulse">
        <div className="h-3 w-24 bg-white/5 rounded mb-4" />
        <div className="h-8 w-16 bg-white/5 rounded" />
      </div>
    );
  }

  if (!data || data.total_responses === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-1">Clone Quality</h3>
        <p className="text-sm text-white/25 mt-2">
          No responses yet. Test your clone to start collecting feedback.
        </p>
      </div>
    );
  }

  const approvalRate = data.approval_rate;
  const rateColor =
    approvalRate == null ? "text-white/40"
    : approvalRate >= 80 ? "text-white/80"
    : approvalRate >= 60 ? "text-white/65"
    : "text-white/45";

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-1">Clone Quality</h3>
          <p className="text-[11px] text-white/25">{data.total_responses} total responses</p>
        </div>
        <Sparkline data={data.trend_7d} />
      </div>

      {/* Primary metric */}
      <div className="flex items-baseline gap-2 mb-5">
        <span className={`text-3xl font-light tabular-nums ${rateColor}`}>
          {approvalRate != null ? `${approvalRate}%` : "—"}
        </span>
        <span className="text-sm text-white/30">approval rate</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Approved", value: data.approved, color: "text-white/60" },
          { label: "Corrected", value: data.edited, color: "text-blue-200/60" },
          { label: "Rejected", value: data.rejected, color: "text-white/35" },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass rounded-xl p-3">
            <p className={`text-lg font-light tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Pending review CTA */}
      {data.pending_review > 0 && (
        <Link
          href="/dashboard/activity?filter=pending"
          className="flex items-center justify-between glass-md hover:glass-hi rounded-xl px-4 py-3 transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300/70 animate-pulse" />
            <span className="text-xs text-white/55 group-hover:text-white/80 transition-colors">
              {data.pending_review} response{data.pending_review !== 1 ? "s" : ""} need review
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/25 group-hover:text-white/50 transition-colors">
            <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      )}

      {data.avg_confidence != null && (
        <p className="text-[11px] text-white/20 mt-3">
          Avg confidence: {data.avg_confidence}%
        </p>
      )}
    </div>
  );
}
