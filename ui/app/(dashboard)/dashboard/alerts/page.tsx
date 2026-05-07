"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrg } from "@/lib/hooks/useOrg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AlertSeverity = "high" | "medium" | "low";
type AlertType =
  | "goal_drift"
  | "knowledge_gap"
  | "escalation_spike"
  | "silence"
  | "confidence_drop";

interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  affected: string;         // role name, person name, or area
  detected_at: string;     // ISO
  resolved: boolean;
  investigate_href?: string;
}

// Demo alerts until backend detection is wired
const DEMO_ALERTS: Alert[] = [
  {
    id: "a1",
    type: "escalation_spike",
    severity: "high",
    title: "Escalation rate spiked 3× this week",
    description:
      "Your engineering clones are flagging 3× more queries for human review compared to last week. This often indicates a knowledge gap or a new topic area that hasn't been trained.",
    affected: "Engineering team",
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    resolved: false,
    investigate_href: "/dashboard/feed?filter=escalations",
  },
  {
    id: "a2",
    type: "knowledge_gap",
    severity: "medium",
    title: "Frequent unanswered questions about pricing",
    description:
      "15 queries in the last 7 days mentioned pricing or contracts — none were answered with high confidence. Consider adding pricing FAQ to the Company Brain.",
    affected: "Sales clones",
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    resolved: false,
    investigate_href: "/dashboard/train",
  },
  {
    id: "a3",
    type: "goal_drift",
    severity: "medium",
    title: "Activity diverging from Q2 OKR: enterprise pilots",
    description:
      'Conversations across team clones show declining discussion of enterprise pilot topics. You set "Close 3 enterprise pilots" as a Q2 objective — this may need attention.',
    affected: "Company-wide",
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    resolved: false,
    investigate_href: "/dashboard/goals",
  },
  {
    id: "a4",
    type: "silence",
    severity: "low",
    title: "Alex Chen's clone hasn't been queried in 14 days",
    description:
      "Clones that go unused may indicate the team isn't aware of them or their knowledge is outdated. Consider re-promoting or updating training data.",
    affected: "Alex Chen",
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    resolved: false,
    investigate_href: "/dashboard/team-knowledge",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SEVERITY_STYLES: Record<AlertSeverity, { dot: string; badge: string; label: string }> = {
  high:   { dot: "bg-red-400/60",   badge: "text-red-400/70 bg-red-400/[0.08] border-red-400/[0.15]",   label: "High" },
  medium: { dot: "bg-amber-400/50", badge: "text-amber-400/60 bg-amber-400/[0.07] border-amber-400/[0.12]", label: "Medium" },
  low:    { dot: "bg-white/25",     badge: "text-white/35 bg-white/[0.05] border-white/[0.07]",           label: "Low" },
};

const TYPE_LABELS: Record<AlertType, string> = {
  goal_drift:       "Goal drift",
  knowledge_gap:    "Knowledge gap",
  escalation_spike: "Escalation spike",
  silence:          "Inactivity",
  confidence_drop:  "Confidence drop",
};

function rel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function AlertCard({
  alert,
  onResolve,
  onDelete,
}: {
  alert: Alert;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sv = SEVERITY_STYLES[alert.severity];

  return (
    <div className={`glass rounded-2xl p-5 ${alert.resolved ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sv.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] rounded-full px-2 py-px border ${sv.badge}`}>
                  {sv.label}
                </span>
                <span className="text-[10px] text-white/25 bg-white/[0.04] border border-white/[0.07] rounded-full px-2 py-px">
                  {TYPE_LABELS[alert.type]}
                </span>
                <span className="text-[10px] text-white/20">{alert.affected}</span>
              </div>
              <p className="text-sm font-medium text-white/70 leading-snug">{alert.title}</p>
              <p className="text-xs text-white/35 mt-1 leading-relaxed">{alert.description}</p>
            </div>
            <span className="text-[11px] text-white/20 shrink-0 whitespace-nowrap">
              {rel(alert.detected_at)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-3">
            {!alert.resolved && (
              <>
                {alert.investigate_href && (
                  <Link
                    href={alert.investigate_href}
                    className="text-xs text-white/40 hover:text-white/65 transition-colors"
                  >
                    Investigate →
                  </Link>
                )}
                <button
                  onClick={() => onResolve(alert.id)}
                  className="text-xs text-white/20 hover:text-white/45 transition-colors"
                >
                  Mark resolved
                </button>
              </>
            )}
            {alert.resolved && (
              <span className="text-[10px] text-emerald-400/50">Resolved</span>
            )}
            <button
              onClick={() => onDelete(alert.id)}
              className="ml-auto text-xs text-white/10 hover:text-red-400/50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertRulesPanel() {
  const rules = [
    { label: "Escalation rate spike", desc: "Alert when escalation rate increases > 2× week-over-week", enabled: true },
    { label: "Knowledge gap detection", desc: "Alert when > 10 low-confidence queries share a topic cluster", enabled: true },
    { label: "Goal drift", desc: "Alert when conversation topics diverge from active OKRs", enabled: true },
    { label: "Clone inactivity", desc: "Alert when a team clone goes 14+ days without a query", enabled: false },
    { label: "Confidence drop", desc: "Alert when avg confidence drops below 50% over 7 days", enabled: false },
  ];

  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(rules.map((r) => [r.label, r.enabled]))
  );

  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs font-medium text-white/45 mb-4">Alert rules</p>
      <div className="flex flex-col gap-3">
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-start gap-3">
            <button
              onClick={() => setEnabled((p) => ({ ...p, [rule.label]: !p[rule.label] }))}
              className={`mt-0.5 w-8 h-4.5 rounded-full transition-all shrink-0 relative ${
                enabled[rule.label] ? "bg-emerald-400/30" : "bg-white/[0.07]"
              }`}
              style={{ height: "18px" }}
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                  enabled[rule.label]
                    ? "left-[calc(100%-16px)] bg-emerald-400/80"
                    : "left-0.5 bg-white/25"
                }`}
              />
            </button>
            <div>
              <p className="text-xs text-white/55">{rule.label}</p>
              <p className="text-[11px] text-white/25 mt-0.5 leading-relaxed">{rule.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AlertsPage() {
  const { org, isLoading } = useOrg();
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS);

  function resolve(id: string) {
    setAlerts((p) =>
      p.map((a) => (a.id === id ? { ...a, resolved: true } : a))
    );
  }

  function remove(id: string) {
    setAlerts((p) => p.filter((a) => a.id !== id));
  }

  if (isLoading) return <LoadingSpinner />;

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

  const active = alerts.filter((a) => !a.resolved);
  const high = active.filter((a) => a.severity === "high").length;
  const medium = active.filter((a) => a.severity === "medium").length;

  return (
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">Alerts</h1>
          <p className="text-sm text-white/35 mt-1">
            Detected patterns that may need your attention.
          </p>
        </div>
        <span className="text-[10px] text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/[0.12] rounded-full px-2.5 py-1">
          Enterprise
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Active alerts",   value: active.length },
          { label: "High severity",   value: high,   sub: high > 0 ? "requires attention" : "none" },
          { label: "Medium severity", value: medium },
          { label: "Resolved",        value: alerts.filter((a) => a.resolved).length },
        ].map(({ label, value, sub }) => (
          <div key={label} className="glass rounded-2xl px-5 py-4">
            <p className="text-2xl font-light text-white/80 tabular-nums">{value}</p>
            <p className="text-xs text-white/35 mt-1">{label}</p>
            {sub && <p className="text-[11px] text-white/20 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Alert list */}
        <div className="flex flex-col gap-3">
          {active.length === 0 ? (
            <div className="glass rounded-2xl px-6 py-14 text-center">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-400/10 border border-emerald-400/20 mx-auto mb-3">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400/70"/>
                </svg>
              </div>
              <p className="text-sm text-white/30">All clear.</p>
              <p className="text-xs text-white/20 mt-1">No active alerts. The system is monitoring continuously.</p>
            </div>
          ) : (
            active.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onResolve={resolve} onDelete={remove} />
            ))
          )}

          {/* Resolved section */}
          {alerts.some((a) => a.resolved) && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-white/25 hover:text-white/45 transition-colors list-none flex items-center gap-1.5 px-1">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className="group-open:rotate-90 transition-transform">
                  <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {alerts.filter((a) => a.resolved).length} resolved
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {alerts.filter((a) => a.resolved).map((alert) => (
                  <AlertCard key={alert.id} alert={alert} onResolve={resolve} onDelete={remove} />
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Right: alert rules */}
        <AlertRulesPanel />
      </div>
    </div>
  );
}
