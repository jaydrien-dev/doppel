"use client";

import Link from "next/link";
import useSWR from "swr";
import type { BrainStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  upload: "Upload",
  seed_qa: "Q&A",
  chat: "Chat",
  meeting: "Meeting",
  slack: "Slack",
};

function formatRelative(isoString: string): string {
  const d = new Date(isoString);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function BrainHealthCard({
  cloneId,
  lastUpdated,
}: {
  cloneId: string;
  lastUpdated?: string;
}) {
  const { data, isLoading } = useSWR<BrainStats>(
    `/api/brain/stats?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const total = data?.total ?? 0;
  const sources = data?.sources ?? [];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {total > 0 ? (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(52,211,153,0.70)", display: "inline-block" }} />
          ) : (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "inline-block" }} />
          )}
          <p className="card-title" style={{ margin: 0 }}>Brain health</p>
        </div>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)" }}>{formatRelative(lastUpdated)}</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
        {/* Memories */}
        <div>
          <p style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.85)", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "\u2014" : total.toLocaleString()}
          </p>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Memories</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>knowledge chunks</p>
        </div>

        {/* Sources */}
        <div>
          <p style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
            {isLoading ? "\u2014" : sources.length}
          </p>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Sources</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sources.length > 0
              ? sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")
              : "none connected"}
          </p>
        </div>

        {/* Episodic */}
        <div>
          <p style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
            {isLoading ? "\u2014" : data ? data.episodic.toLocaleString() : "\u2014"}
          </p>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Episodic</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
            {data ? `+${data.semantic} facts` : ""}
          </p>
        </div>
      </div>

      {!isLoading && total === 0 && (
        <div className="glass" style={{ borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          No memories yet. Go to{" "}
          <Link
            href="/dashboard/train"
            style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Train
          </Link>{" "}
          to connect your data.
        </div>
      )}
    </div>
  );
}
