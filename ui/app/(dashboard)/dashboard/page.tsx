"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import { useTour } from "@/components/tour/TourProvider";
import { useAdvancedMode } from "@/lib/context/AdvancedModeContext";
import type { BrainStats, ActivityTrace, CloneOwnerInfo } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function rel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ---------------------------------------------------------------------------
// Stats bar (advanced only)
// ---------------------------------------------------------------------------
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

  const pending = quality?.pending_review ?? 0;
  const total = quality?.total_responses ?? 0;
  const autoExecuted = total > 0 ? total - pending : 0;

  const items: { label: string; value: string; sub: string; modifier: string }[] = [
    {
      label: "Tasks handled",
      value: total > 0 ? total.toLocaleString() : "—",
      sub: total > 0 ? `${autoExecuted} auto-executed` : "no tasks yet",
      modifier: "stat-tile--blue",
    },
    {
      label: "Awaiting review",
      value: pending > 0 ? pending.toLocaleString() : "0",
      sub: pending > 0 ? "needs your approval" : "all clear",
      modifier: pending > 0 ? "stat-tile--red" : "",
    },
    {
      label: "Tools connected",
      value: stats?.sources?.length != null ? stats.sources.length.toLocaleString() : "—",
      sub: (stats?.sources?.length ?? 0) > 0
        ? `${stats!.sources!.join(", ").slice(0, 28)}`
        : "connect tools in Channels",
      modifier: (stats?.sources?.length ?? 0) > 0 ? "stat-tile--green" : "",
    },
    {
      label: "Confidence",
      value: quality?.avg_confidence != null ? `${quality.avg_confidence}%` : "—",
      sub: quality?.approval_rate != null ? `${quality.approval_rate}% approved` : "no data yet",
      modifier: "",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
      {items.map(({ label, value, sub, modifier }) => (
        <div key={label} className={["stat-tile", modifier].filter(Boolean).join(" ")}>
          <p className="stat-tile__value">{value}</p>
          <p className="stat-tile__label">{label}</p>
          {sub && <p className="stat-tile__sub">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task feed
// ---------------------------------------------------------------------------

const APPROVAL_PATH_LABEL: Record<string, { label: string; color: string }> = {
  auto_execute:     { label: "executed",   color: "rgba(52,211,153,0.70)" },
  consumer_confirm: { label: "confirmed",  color: "rgba(96,165,250,0.70)" },
  creator_review:   { label: "review",     color: "rgba(251,191,36,0.80)" },
  dual_approval:    { label: "approval",   color: "rgba(248,113,113,0.75)" },
};

function TaskFeed({ cloneId, advanced }: { cloneId: string; advanced: boolean }) {
  const { data, isLoading } = useSWR<{ traces: ActivityTrace[] }>(
    `/api/activity?clone_id=${cloneId}&limit=10`,
    fetcher,
    { refreshInterval: 20_000 }
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
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>No tasks yet.</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 4 }}>
          Delegate something to see it here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {traces.map((trace) => {
        const path = (trace as any).approval_path as string | undefined;
        const pathMeta = path ? APPROVAL_PATH_LABEL[path] : null;

        const dotColor =
          trace.feedback_signal === "approved" ? "#34D399"
          : trace.feedback_signal === "edited"   ? "#60A5FA"
          : trace.feedback_signal === "rejected" ? "#F87171"
          : "rgba(255,255,255,0.18)";

        return (
          <div key={trace.id} className="act-row">
            <span className="act-row__dot" style={{ background: dotColor }} />
            <span className="act-row__text">{trace.input_message}</span>
            <span className="act-row__meta">
              {advanced && trace.confidence != null && (
                <span className="act-row__conf">{trace.confidence}%</span>
              )}
              {pathMeta && (
                <span style={{
                  fontSize: 10, padding: "1px 7px", borderRadius: 999,
                  color: pathMeta.color,
                  border: `1px solid ${pathMeta.color.replace("0.70", "0.20").replace("0.75", "0.20").replace("0.80", "0.20")}`,
                  background: pathMeta.color.replace("0.70", "0.07").replace("0.75", "0.07").replace("0.80", "0.07"),
                }}>
                  {pathMeta.label}
                </span>
              )}
              {!pathMeta && advanced && trace.needs_escalation && (
                <span className="badge badge--warn" style={{ padding: "1px 7px", fontSize: 10 }}>
                  review
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
// Connected tools panel (sidebar in advanced mode)
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  gmail:   "Gmail",
  slack:   "Slack",
  github:  "GitHub",
  notion:  "Notion",
  gdrive:  "Google Drive",
  gcal:    "Calendar",
  upload:  "File upload",
  meeting: "Meetings",
};

function ToolsPanel({ cloneId }: { cloneId: string }) {
  const { data } = useSWR<BrainStats>(
    `/api/brain/stats?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const connected = new Set(data?.sources ?? []);
  const ALL = ["gmail", "slack", "gdrive", "gcal", "github", "notion"];

  return (
    <div className="card">
      <p className="card-title">Connected tools</p>
      <div>
        {ALL.map((src) => (
          <div key={src} className="src-row">
            <span className="src-row__name">{TOOL_LABELS[src] ?? src}</span>
            {connected.has(src) ? (
              <span className="src-row__status src-row__status--on">
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#34D399", display: "inline-block" }} />
                Connected
              </span>
            ) : (
              <Link
                href="/dashboard/settings"
                className="src-row__status src-row__status--off"
                style={{ transition: "color 180ms" }}
              >
                Connect →
              </Link>
            )}
          </div>
        ))}
      </div>
      <Link href="/dashboard/settings" className="btn btn--sm" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
        Manage channels →
      </Link>
    </div>
  );
}

function ToolsSummary({ cloneId }: { cloneId: string }) {
  const { data } = useSWR<BrainStats>(
    `/api/brain/stats?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const count = data?.sources?.length ?? 0;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      marginTop: 20,
    }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
        {count > 0 ? (
          <>
            <span style={{ color: "rgba(52,211,153,0.80)" }}>●</span>
            {" "}{count} tool{count !== 1 ? "s" : ""} connected
          </>
        ) : (
          "No tools connected yet"
        )}
      </span>
      <Link href="/dashboard/settings" style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
        Connect →
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
          Create your delegate
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginBottom: 28, lineHeight: 1.6 }}>
          Your delegate handles tasks, responds on your behalf, and executes across your tools — while you stay in control.
        </p>
        <Link href="/onboarding" className="btn btn--primary">
          Get started →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tour button
// ---------------------------------------------------------------------------
function TourTrigger() {
  const { startTour, tourDone } = useTour();
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      setDone(!!localStorage.getItem("doppel_tour_done:getting_started"));
    } catch { /* non-fatal */ }
  }, []);

  if (done || tourDone) return null;

  return (
    <button
      onClick={() => startTour("getting_started", { force: true })}
      style={{
        fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em",
        color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8, padding: "5px 12px", background: "transparent",
        cursor: "pointer", fontFamily: "inherit",
        transition: "background 180ms, color 180ms, border-color 180ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.60)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.40)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
    >
      Take the tour →
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { advanced } = useAdvancedMode();
  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

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
          <p className="db-eyebrow">Delegate</p>
          <h1 className="db-h1">
            Your delegate is active. <em>Here's what it handled.</em>
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TourTrigger />
          <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
          <Link href="/dashboard/test" className="btn btn--primary">
            Delegate task →
          </Link>
        </div>
      </div>

      {/* Advanced-only: stats */}
      {advanced && <StatsBar cloneId={clone.clone_id} />}

      {/* Two-col in advanced, single-col in simple */}
      {advanced ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 20, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 className="db-h3">Task feed</h3>
              <Link href="/dashboard/activity" className="btn btn--ghost btn--sm">
                View all →
              </Link>
            </div>
            <TaskFeed cloneId={clone.clone_id} advanced={advanced} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ToolsPanel cloneId={clone.clone_id} />
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 className="db-h3">Task feed</h3>
            <Link href="/dashboard/activity" className="btn btn--ghost btn--sm">
              View all →
            </Link>
          </div>
          <TaskFeed cloneId={clone.clone_id} advanced={advanced} />
          <ToolsSummary cloneId={clone.clone_id} />
        </div>
      )}
    </div>
  );
}
