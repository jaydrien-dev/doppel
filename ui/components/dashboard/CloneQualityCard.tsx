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
      <div className="card" style={{ opacity: 0.6 }}>
        <div style={{ height: 12, width: 96, background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 16 }} />
        <div style={{ height: 32, width: 64, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} />
      </div>
    );
  }

  if (!data || data.total_responses === 0) {
    return (
      <div className="card">
        <p className="card-title">Clone quality</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
          No responses yet. Test your clone to start collecting feedback.
        </p>
      </div>
    );
  }

  const approvalRate = data.approval_rate;
  const rateOpacity =
    approvalRate == null ? 0.40
    : approvalRate >= 80 ? 0.85
    : approvalRate >= 60 ? 0.65
    : 0.45;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <p className="card-title">Clone quality</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{data.total_responses} total responses</p>
        </div>
        <Sparkline data={data.trend_7d} />
      </div>

      {/* Primary metric */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 30, fontWeight: 300, color: `rgba(255,255,255,${rateOpacity})`, fontVariantNumeric: "tabular-nums" }}>
          {approvalRate != null ? `${approvalRate}%` : "—"}
        </span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>approval rate</span>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Approved", value: data.approved, opacity: 0.60 },
          { label: "Corrected", value: data.edited, opacity: 0.55 },
          { label: "Rejected", value: data.rejected, opacity: 0.35 },
        ].map(({ label, value, opacity }) => (
          <div key={label} className="glass" style={{ borderRadius: 12, padding: 12 }}>
            <p style={{ fontSize: 18, fontWeight: 300, color: `rgba(255,255,255,${opacity})`, fontVariantNumeric: "tabular-nums" }}>{value}</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Pending review CTA */}
      {data.pending_review > 0 && (
        <Link
          href="/dashboard/activity?filter=pending"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: "10px 14px", textDecoration: "none" }}
          className="glass-md"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(251,191,36,0.70)", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              {data.pending_review} response{data.pending_review !== 1 ? "s" : ""} need review
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.25)" }}>
            <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      )}

      {data.avg_confidence != null && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 12 }}>
          Avg confidence: {data.avg_confidence}%
        </p>
      )}
    </div>
  );
}
