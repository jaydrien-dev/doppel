"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
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

const PATH_META: Record<string, { label: string; color: string; desc: string }> = {
  creator_review: {
    label: "Your review",
    color: "rgba(251,191,36,0.80)",
    desc: "Delegate wasn't confident enough to act alone.",
  },
  dual_approval: {
    label: "Dual approval",
    color: "rgba(248,113,113,0.75)",
    desc: "High-stakes action — both you and the recipient must confirm.",
  },
};

type PendingItem = {
  id: string;
  input_message: string;
  response: string;
  confidence: number | null;
  approval_path: string | null;
  created_at: string;
  sender_id: string | null;
};

function ApprovalCard({
  item,
  cloneId,
  onResolved,
}: {
  item: PendingItem;
  cloneId: string;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [edited, setEdited] = useState(item.response);
  const [editing, setEditing] = useState(false);
  const path = item.approval_path ?? "creator_review";
  const meta = PATH_META[path] ?? PATH_META.creator_review;

  async function submit(signal: "approved" | "rejected", corrected?: string) {
    setLoading(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: item.id,
          clone_id: cloneId,
          signal_type: signal,
          corrected_response: corrected ?? null,
        }),
      });
      onResolved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${meta.color.replace("0.80", "0.15").replace("0.75", "0.15")}`,
      background: meta.color.replace("0.80", "0.04").replace("0.75", "0.04"),
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.10em",
            color: meta.color, fontWeight: 500,
          }}>
            {meta.label}
          </span>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.4 }}>
            {item.input_message}
          </p>
          {item.sender_id && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>
              from {item.sender_id}
            </p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{rel(item.created_at)}</span>
          {item.confidence != null && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>
              {item.confidence}% confidence
            </span>
          )}
        </div>
      </div>

      {/* Proposed response */}
      <div style={{
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        padding: "12px 14px",
      }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.09em", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
          Proposed response
        </p>
        {editing ? (
          <textarea
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            style={{
              width: "100%", minHeight: 100, resize: "vertical",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "8px 10px",
              color: "rgba(255,255,255,0.75)", fontSize: 13,
              fontFamily: "inherit", lineHeight: 1.5, outline: "none",
            }}
          />
        ) : (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {item.response}
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          disabled={loading}
          onClick={() => editing ? submit("approved", edited) : submit("approved")}
          style={{
            padding: "7px 16px", borderRadius: 9, fontSize: 12, fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.22)",
            color: "rgba(52,211,153,0.85)", opacity: loading ? 0.5 : 1,
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(52,211,153,0.20)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(52,211,153,0.12)"; }}
        >
          {editing ? "Approve edited" : "Approve"}
        </button>
        <button
          disabled={loading}
          onClick={() => setEditing(!editing)}
          style={{
            padding: "7px 16px", borderRadius: 9, fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            background: "transparent", border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.45)",
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
        >
          {editing ? "Cancel edit" : "Edit"}
        </button>
        <button
          disabled={loading}
          onClick={() => submit("rejected")}
          style={{
            padding: "7px 16px", borderRadius: 9, fontSize: 12, fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: "transparent", border: "1px solid rgba(248,113,113,0.15)",
            color: "rgba(248,113,113,0.60)", opacity: loading ? 0.5 : 1,
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.30)"; e.currentTarget.style.color = "rgba(248,113,113,0.80)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.60)"; }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function ApprovalInbox({ cloneId }: { cloneId: string }) {
  const key = `/api/activity?clone_id=${cloneId}&pending_review=true&limit=20`;
  const { data, isLoading } = useSWR<{ traces: PendingItem[] }>(key, fetcher, { refreshInterval: 15_000 });
  const items = (data?.traces ?? []).filter((t) => (t as any).needs_escalation);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ height: 160, borderRadius: 16, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "64px 24px", gap: 12,
        borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 9.5l4 4 8-8" stroke="rgba(52,211,153,0.80)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.60)", margin: 0 }}>
          All clear
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", margin: 0 }}>
          No tasks waiting for your review.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => (
        <ApprovalCard
          key={item.id}
          item={item}
          cloneId={cloneId}
          onResolved={() => mutate(key)}
        />
      ))}
    </div>
  );
}

export default function ApprovalsPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (clones.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Get started →
          </a>
        </p>
      </div>
    );
  }

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Delegate</p>
          <h1 className="db-h1">Approvals</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            Tasks your delegate flagged for your review before acting.
          </p>
        </div>
        <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
      </div>
      <ApprovalInbox cloneId={clone.clone_id} />
    </div>
  );
}
