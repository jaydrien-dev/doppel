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
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              total > 0 ? "bg-white/50" : "bg-white/15"
            }`}
          />
          <h2 className="text-sm font-medium text-white/60">Brain health</h2>
        </div>
        {lastUpdated && (
          <span className="text-[11px] text-white/20">{formatRelative(lastUpdated)}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-2xl font-light text-white/85 mb-1 tabular-nums">
            {isLoading ? "—" : total.toLocaleString()}
          </p>
          <p className="text-xs font-medium text-white/40">Memories</p>
          <p className="text-[11px] text-white/25 mt-0.5">knowledge chunks</p>
        </div>
        <div>
          <p className="text-2xl font-light text-white/85 mb-1">
            {isLoading ? "—" : sources.length}
          </p>
          <p className="text-xs font-medium text-white/40">Sources</p>
          <p className="text-[11px] text-white/25 mt-0.5 truncate">
            {sources.length > 0
              ? sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")
              : "none connected"}
          </p>
        </div>
        <div>
          <p className="text-2xl font-light text-white/85 mb-1">
            {isLoading ? "—" : data ? `${data.episodic.toLocaleString()}` : "—"}
          </p>
          <p className="text-xs font-medium text-white/40">Episodic</p>
          <p className="text-[11px] text-white/25 mt-0.5">
            {data ? `+${data.semantic} facts` : ""}
          </p>
        </div>
      </div>

      {!isLoading && total === 0 && (
        <div className="glass rounded-xl px-4 py-3 text-sm text-white/40">
          No memories yet. Go to{" "}
          <Link
            href="/dashboard/train"
            className="text-white/60 hover:text-white/80 underline underline-offset-2"
          >
            Train
          </Link>{" "}
          to connect your data.
        </div>
      )}
    </div>
  );
}
