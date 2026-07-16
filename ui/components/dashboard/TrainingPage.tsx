"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker, deriveColor } from "@/components/dashboard/ClonePicker";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface ObsSource {
  source_type: string;
  enabled: boolean;
  items_observed: number;
  items_ingested: number;
  last_observed_at: string | null;
  status: string;
  error_message: string | null;
}

interface ObsActivity {
  id: string;
  source_type: string;
  items_fetched: number;
  items_ingested: number;
  items_skipped: number;
  insights_extracted: number;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
}

interface PendingInsight {
  id: string;
  insight_type: string;
  content: string;
  confidence: number;
  source_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface ObsStats {
  total_observed: number;
  total_ingested: number;
  pending_insights: number;
}

interface TrainingBreakdown { score: number; max: number; label: string; hint: string; }
interface TrainingScore { score: number; grade: string; breakdown: Record<string, TrainingBreakdown>; next_action: string; total_items: number; items_target: number; }

const SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  slack: "Slack",
  gdrive: "Google Drive",
  github: "GitHub",
  notion: "Notion",
  gcal: "Calendar",
  screenwatch: "Screen Watch",
};
const SOURCE_LIST = ["gmail", "slack", "gdrive", "github", "notion", "gcal", "screenwatch"];

const TOOL_NAME_TO_ID: Record<string, string> = {
  Gmail: "gmail", Slack: "slack", "Google Drive": "gdrive",
  GitHub: "github", Notion: "notion", "Google Calendar": "gcal",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function TrainingPage() {
  const { clones, isLoading: clonesLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sources, setSources] = useState<ObsSource[]>([]);
  const [activity, setActivity] = useState<ObsActivity[]>([]);
  const [insights, setInsights] = useState<PendingInsight[]>([]);
  const [stats, setStats] = useState<ObsStats | null>(null);
  const [training, setTraining] = useState<TrainingScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());

  const clone = clones.find((c) => c.clone_id === selectedId) ?? clones[0];
  const cloneId = clone?.clone_id;

  const handle = clone?.handle;

  const load = useCallback(async () => {
    if (!cloneId || !handle) return;
    setLoading(true);
    try {
      const [srcRes, actRes, insRes, statsRes, trainRes] = await Promise.all([
        fetch(`/api/observations/sources?clone_id=${cloneId}`),
        fetch(`/api/observations/activity?clone_id=${cloneId}&limit=30`),
        fetch(`/api/observations/insights?clone_id=${cloneId}&status=pending&limit=20`),
        fetch(`/api/observations/stats?clone_id=${cloneId}`),
        fetch(`/api/clones/${handle}/training-score`),
      ]);
      if (srcRes.ok) { const d = await srcRes.json(); setSources(d.sources || []); }
      if (actRes.ok) { const d = await actRes.json(); setActivity(d.activity || []); }
      if (insRes.ok) { const d = await insRes.json(); setInsights(d.insights || []); }
      if (statsRes.ok) { const d = await statsRes.json(); setStats(d); }
      if (trainRes.ok) { const d = await trainRes.json(); setTraining(d); }

      // Fetch connected tools for gating
      const toolsRes = await fetch(`/api/tools?clone_id=${cloneId}`);
      if (toolsRes.ok) {
        const tools = await toolsRes.json();
        const ids = new Set(
          (Array.isArray(tools) ? tools : [])
            .filter((t: { enabled: boolean }) => t.enabled)
            .map((t: { name: string }) => TOOL_NAME_TO_ID[t.name])
            .filter(Boolean)
        );
        setConnectedIds(ids);
      }

    } catch {}
    setLoading(false);
  }, [cloneId, handle]);

  useEffect(() => { load(); }, [load]);

  const reviewInsight = async (insightId: string, action: "approve" | "reject") => {
    await fetch(`/api/observations/insights/${insightId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== insightId));
  };

  if (clonesLoading) return <LoadingSpinner />;

  if (clones.length === 0) {
    return (
      <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="db-page-head">
          <div>
            <p className="db-eyebrow">Clone</p>
            <h1 className="db-h1">Training</h1>
          </div>
        </div>
        <div className="card">
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            Create your clone first.{" "}
            <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              Get started
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div className="db-page-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p className="db-eyebrow">Clone</p>
            <h1 className="db-h1">Training</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, paddingTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: deriveColor(clone.display_name),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 500, color: "#fff", overflow: "hidden", flexShrink: 0,
              }}>
                {clone.avatar_url
                  ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : clone.display_name[0]?.toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.3 }}>
                  {clone.listing_title || clone.display_name}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>@{clone.handle}</p>
              </div>
            </div>
            <ClonePicker clones={clones} selected={clone} onSelect={(c) => setSelectedId(c.clone_id)} />
          </div>
        </div>
      </div>

      {/* Training Score */}
      {training && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
          className="card" style={{ padding: "20px 24px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
            {/* Score ring */}
            <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
              <circle cx="32" cy="32" r="28" fill="none"
                stroke={training.grade === "A" ? "rgba(52,211,153,0.70)" : training.grade === "B" ? "rgba(52,211,153,0.50)" : training.grade === "C" ? "rgba(255,255,255,0.40)" : "rgba(248,113,113,0.55)"}
                strokeWidth="5" strokeDasharray={`${(training.score / 100) * 175.93} 175.93`}
                strokeLinecap="round" transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
              <text x="32" y="30" textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: 18, fontWeight: 300, fill: "rgba(255,255,255,0.85)" }}>{training.score}</text>
              <text x="32" y="44" textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: 10, fontWeight: 500, fill: training.grade === "A" || training.grade === "B" ? "rgba(52,211,153,0.65)" : "rgba(255,255,255,0.35)" }}>
                {training.grade}
              </text>
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 6px" }}>
                Training completeness
              </p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.70)", margin: "0 0 4px", fontWeight: 400 }}>
                {training.total_items} / {training.items_target} data points
              </p>
              {training.next_action && (
                <p style={{ fontSize: 12, color: "rgba(52,211,153,0.60)", margin: 0 }}>
                  {training.next_action}
                </p>
              )}
            </div>
          </div>

          {/* Breakdown bars */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px 20px" }}>
            {Object.values(training.breakdown).map((b, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: b.score >= b.max ? "rgba(52,211,153,0.65)" : "rgba(255,255,255,0.45)" }}>
                    {b.label}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{b.score}/{b.max}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${(b.score / b.max) * 100}%`,
                    background: b.score >= b.max ? "rgba(52,211,153,0.50)" : "rgba(255,255,255,0.18)",
                    transition: "width 0.5s ease",
                  }} />
                </div>
                {b.score < b.max && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", margin: "3px 0 0", lineHeight: 1.3 }}>
                    {b.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stats overview */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}
        >
          {[
            { label: "Observed", value: stats.total_observed ?? 0 },
            { label: "Ingested", value: stats.total_ingested ?? 0 },
            { label: "Pending review", value: stats.pending_insights ?? 0 },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 * i }}
              className="card" style={{ padding: "16px 18px", textAlign: "center" }}
            >
              <p style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 4px" }}>
                {s.value.toLocaleString()}
              </p>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: 0 }}>
                {s.label}
              </p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Observations */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 12px" }}>
          Observations
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {SOURCE_LIST.map((stype, i) => {
            const src = sources.find((s) => s.source_type === stype);
            const enabled = src?.enabled ?? false;
            const status = src?.status ?? "idle";
            const isScreenwatch = stype === "screenwatch";
            const isConnected = isScreenwatch || connectedIds.has(stype);
            return (
              <motion.div
                key={stype}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * i }}
                className="card"
                style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, opacity: isConnected ? 1 : 0.45 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: enabled && status !== "error" ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.18)",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: 500, flex: 1 }}>
                    {SOURCE_LABELS[stype] || stype}
                  </span>
                  {isConnected ? (
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      background: enabled ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${enabled ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.08)"}`,
                      color: enabled ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.35)",
                    }}>
                      {enabled ? "Active" : "Off"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Not connected</span>
                  )}
                </div>
                {src && isConnected && (
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                    <span>{timeAgo(src.last_observed_at)}</span>
                    <span>{src.items_ingested.toLocaleString()} learned</span>
                  </div>
                )}
                {isScreenwatch && !enabled && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", margin: 0 }}>Desktop app only</p>
                )}
                {!isConnected && !isScreenwatch && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", margin: 0 }}>
                    Connect in <a href="/dashboard/settings" style={{ color: "rgba(255,255,255,0.35)", textDecoration: "underline", textUnderlineOffset: 2 }}>Settings</a>
                  </p>
                )}
                {src?.error_message && (
                  <p style={{ fontSize: 10, color: "rgba(248,113,113,0.60)", margin: 0 }}>{src.error_message}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Pending insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 12px" }}>
            Pending review <span style={{ color: "rgba(255,255,255,0.40)" }}>({insights.length})</span>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {insights.map((insight, i) => (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * i }}
                className="card" style={{ padding: "14px 16px" }}
              >
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                  &ldquo;{insight.content}&rdquo;
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    {SOURCE_LABELS[insight.source_type] || insight.source_type}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    {(insight.confidence * 100).toFixed(0)}% confidence
                  </span>
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 4,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.35)",
                  }}>
                    {insight.insight_type.replace(/_/g, " ")}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button
                      onClick={() => reviewInsight(insight.id, "approve")}
                      style={{
                        fontSize: 11, padding: "4px 14px", borderRadius: 8,
                        border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.08)",
                        color: "rgba(52,211,153,0.75)", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reviewInsight(insight.id, "reject")}
                      style={{
                        fontSize: 11, padding: "4px 14px", borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.40)", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Activity feed */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 12px" }}>
          Activity
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activity.length === 0 && !loading && (
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>
                No observation activity yet. Enable a source to start passive learning.
              </p>
            </div>
          )}
          {activity.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.03 * i }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 12,
                background: a.error_message ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${a.error_message ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              <div style={{
                width: 4, height: 4, borderRadius: "50%",
                background: a.error_message ? "rgba(248,113,113,0.60)" : "rgba(255,255,255,0.20)",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1 }}>
                {a.error_message
                  ? `Error observing ${SOURCE_LABELS[a.source_type] || a.source_type}`
                  : `Observed ${a.items_fetched} items from ${SOURCE_LABELS[a.source_type] || a.source_type}, ingested ${a.items_ingested}${a.insights_extracted > 0 ? `, ${a.insights_extracted} insights` : ""}`}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
                {timeAgo(a.started_at)}
              </span>
              {a.duration_ms != null && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
                  {(a.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {loading && <LoadingSpinner />}
    </div>
  );
}
