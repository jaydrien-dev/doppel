"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function rel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolAction = {
  id: string;
  title: string;       // tool_name e.g. "Gmail__send_email"
  content: string;     // result text
  context: { args?: Record<string, unknown>; server?: string };
  status: string;      // "executed"
  confidence: number | null;
  created_at: string;
};

// ─── Tool action row ──────────────────────────────────────────────────────────

function ToolActionRow({ action }: { action: ToolAction }) {
  const [expanded, setExpanded] = useState(false);
  const service = action.context?.server ?? action.title.split("__")[0] ?? "Tool";
  const toolFn = action.title.includes("__") ? action.title.split("__").slice(1).join("__").replace(/_/g, " ") : action.title;
  const isError = action.content.startsWith("[") && action.content.includes("error");

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${isError ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.07)"}`,
      background: isError ? "rgba(248,113,113,0.03)" : "rgba(255,255,255,0.02)",
      padding: "13px 16px",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status dot */}
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: isError ? "rgba(248,113,113,0.70)" : "rgba(52,211,153,0.65)",
        }} />

        {/* Tool info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>{service}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>·</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{toolFn}</span>
          </div>
          {!expanded && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {action.content}
            </p>
          )}
        </div>

        {/* Time + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{rel(action.created_at)}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms", opacity: 0.3 }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 10 }}>
          {action.context?.args && Object.keys(action.context.args).length > 0 && (
            <div>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(255,255,255,0.22)", margin: "0 0 6px" }}>Args</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(action.context.args).map(([k, v]) => (
                  <span key={k} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 6,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.45)",
                  }}>
                    <span style={{ color: "rgba(255,255,255,0.30)" }}>{k}:</span> {String(v).slice(0, 80)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(255,255,255,0.22)", margin: "0 0 6px" }}>Result</p>
            <p style={{ fontSize: 12, color: isError ? "rgba(248,113,113,0.65)" : "rgba(255,255,255,0.50)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {action.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool actions feed ────────────────────────────────────────────────────────

function ToolActionsFeed({ cloneId }: { cloneId: string }) {
  const { data, isLoading } = useSWR<{ proposals: ToolAction[] }>(
    `/api/proposals?clone_id=${cloneId}&proposal_type=tool_action&limit=50`,
    fetcher,
    { refreshInterval: 10_000 }
  );
  const actions = data?.proposals ?? [];

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ height: 56, borderRadius: 12, background: "rgba(255,255,255,0.03)" }} />
      ))}
    </div>
  );

  if (actions.length === 0) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "56px 24px", gap: 10, borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)",
    }}>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>No tool actions yet.</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", margin: 0 }}>
        Ask your clone to send an email, search Drive, post to Slack — it will appear here.
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {actions.map((a) => <ToolActionRow key={a.id} action={a} />)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (clones.length === 0) return (
    <div style={{ padding: 32 }}>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
        Create your clone first.{" "}
        <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>Get started →</a>
      </p>
    </div>
  );

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Approvals</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
            Every action your clone takes on your behalf.
          </p>
        </div>
        <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
      </div>

      <ToolActionsFeed cloneId={clone.clone_id} />
    </div>
  );
}
