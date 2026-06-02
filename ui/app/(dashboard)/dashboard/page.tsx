"use client";

import Link from "next/link";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import type { BrainStats, ActivityTrace } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function rel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------
function MemoryBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const nearLimit = pct >= 80;
  const atLimit = pct >= 100;
  const barColor = atLimit
    ? "rgba(248,113,113,0.70)"
    : nearLimit
    ? "rgba(251,191,36,0.70)"
    : "rgba(255,255,255,0.35)";

  function fmt(n: number) {
    return n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : n.toLocaleString();
  }

  return (
    <div style={{ padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: `1px solid ${atLimit ? "rgba(248,113,113,0.18)" : nearLimit ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.07)"}`, marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", margin: 0 }}>
          Memory chunks
        </p>
        <p style={{ fontSize: 12, color: atLimit ? "rgba(248,113,113,0.80)" : nearLimit ? "rgba(251,191,36,0.80)" : "rgba(255,255,255,0.45)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
          {fmt(used)} / {fmt(limit)}
          {atLimit && <span style={{ marginLeft: 8, fontSize: 11 }}>Limit reached — upgrade to store more</span>}
          {!atLimit && nearLimit && <span style={{ marginLeft: 8, fontSize: 11 }}>Approaching limit</span>}
        </p>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: barColor, transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}

function StatsBar({ cloneId }: { cloneId: string }) {
  const { data: stats } = useSWR<BrainStats>(
    `/api/brain/stats?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const { data: quality } = useSWR<{
    total_responses: number;
    pending_review: number;
    approval_rate: number | null;
    avg_confidence: number | null;
  }>(
    `/api/brain/quality?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const approvalModifier =
    quality?.approval_rate != null
      ? quality.approval_rate >= 80
        ? "stat-tile--green"
        : quality.approval_rate < 60
        ? "stat-tile--red"
        : ""
      : "";

  const items: { label: string; value: string; sub: string; modifier: string }[] = [
    {
      label: "Memories",
      value: stats?.total != null ? stats.total.toLocaleString() : "—",
      sub: stats?.sources?.length
        ? `${stats.sources.length} source${stats.sources.length !== 1 ? "s" : ""} connected`
        : "no sources yet",
      modifier: "stat-tile--blue",
    },
    {
      label: "Episodic",
      value: stats?.episodic != null ? stats.episodic.toLocaleString() : "—",
      sub: stats?.semantic != null ? `+${stats.semantic} semantic facts` : "",
      modifier: "",
    },
    {
      label: "Responses",
      value: quality?.total_responses != null ? quality.total_responses.toLocaleString() : "—",
      sub:
        (quality?.pending_review ?? 0) > 0
          ? `${quality!.pending_review} pending review`
          : quality
          ? "all reviewed"
          : "",
      modifier: "stat-tile--green",
    },
    {
      label: "Approval",
      value: quality?.approval_rate != null ? `${quality.approval_rate}%` : "—",
      sub:
        quality?.avg_confidence != null
          ? `${quality.avg_confidence}% avg confidence`
          : "no responses yet",
      modifier: approvalModifier,
    },
  ];

  const memUsed = stats?.memory_used ?? stats?.episodic ?? 0;
  const memLimit = stats?.memory_limit ?? 0;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        {items.map(({ label, value, sub, modifier }) => (
          <div key={label} className={["stat-tile", modifier].filter(Boolean).join(" ")}>
            <p className="stat-tile__value">{value}</p>
            <p className="stat-tile__label">{label}</p>
            {sub && <p className="stat-tile__sub">{sub}</p>}
          </div>
        ))}
      </div>
      {memLimit > 0 && <MemoryBar used={memUsed} limit={memLimit} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Recent queries
// ---------------------------------------------------------------------------
function RecentQueries({ cloneId }: { cloneId: string }) {
  const { data, isLoading } = useSWR<{ traces: ActivityTrace[] }>(
    `/api/activity?clone_id=${cloneId}&limit=8`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const traces = data?.traces ?? [];

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{ height: 44, borderRadius: 12, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease-in-out infinite" }}
          />
        ))}
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>No queries yet.</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 4 }}>
          Test your clone to see activity here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {traces.map((trace) => {
        const sig = trace.feedback_signal;
        const dotColor =
          sig === "approved" ? "#34D399"
          : sig === "edited"   ? "#60A5FA"
          : sig === "rejected" ? "#F87171"
          : "rgba(255,255,255,0.18)";

        return (
          <div key={trace.id} className="act-row">
            <span className="act-row__dot" style={{ background: dotColor }} />
            <span className="act-row__text">{trace.input_message}</span>
            <span className="act-row__meta">
              {trace.confidence != null && (
                <span className="act-row__conf">{trace.confidence}%</span>
              )}
              {trace.needs_escalation && (
                <span className="badge badge--warn" style={{ padding: "1px 7px", fontSize: 10 }}>
                  escalated
                </span>
              )}
              <span style={{ width: 22, textAlign: "right" }}>{rel(trace.created_at)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data sources panel
// ---------------------------------------------------------------------------
const SOURCE_LABELS: Record<string, string> = {
  gmail:   "Gmail",
  slack:   "Slack",
  github:  "GitHub",
  notion:  "Notion",
  upload:  "File upload",
  meeting: "Meetings",
  seed_qa: "Manual Q&A",
};

function SourcesPanel({ cloneId }: { cloneId: string }) {
  const { data } = useSWR<BrainStats>(
    `/api/brain/stats?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const connected = new Set(data?.sources ?? []);
  const ALL = ["gmail", "slack", "github", "notion", "upload", "meeting", "seed_qa"];

  return (
    <div className="card">
      <p className="card-title">Data sources</p>
      <div>
        {ALL.map((src) => (
          <div key={src} className="src-row">
            <span className="src-row__name">{SOURCE_LABELS[src]}</span>
            {connected.has(src) ? (
              <span className="src-row__status src-row__status--on">
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#34D399", display: "inline-block" }} />
                Connected
              </span>
            ) : (
              <Link
                href="/dashboard/train"
                className="src-row__status src-row__status--off"
                style={{ transition: "color 180ms" }}
              >
                Connect →
              </Link>
            )}
          </div>
        ))}
      </div>
      <Link href="/dashboard/train" className="btn btn--sm" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
        Manage sources
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No-clone state
// ---------------------------------------------------------------------------
function NoCloneState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 32 }}>
      <div className="card" style={{ width: "100%", maxWidth: 448 }}>
        <h1 style={{ fontSize: 20, fontWeight: 300, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>
          Create your clone
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginBottom: 28, lineHeight: 1.6 }}>
          Your digital consciousness — a chatbot that thinks and sounds exactly like you.
        </p>
        <Link href="/onboarding" className="btn btn--primary">
          Get started →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { clone, isLoading } = useClone();

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.20)", borderTopColor: "rgba(255,255,255,0.60)", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  if (!clone) return <NoCloneState />;

  return (
    <div className="db-page" style={{ "--page-accent": "#1A73E8" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Overview</p>
          <h1 className="db-h1">
            Your clone is responding. <em>Stay in the loop.</em>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/dashboard/test" className="btn btn--primary">
            Test clone →
          </Link>
        </div>
      </div>

      <StatsBar cloneId={clone.clone_id} />

      {/* Two-col layout: activity list + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>
        {/* Left: recent queries */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 className="db-h3">Recent queries</h3>
            <Link href="/dashboard/activity" className="btn btn--ghost btn--sm">
              View all →
            </Link>
          </div>
          <RecentQueries cloneId={clone.clone_id} />
        </div>

        {/* Right: sources */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SourcesPanel cloneId={clone.clone_id} />
        </div>
      </div>
    </div>
  );
}
