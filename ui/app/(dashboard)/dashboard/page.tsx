"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import { createClone } from "@/lib/api";
import { StyleFingerprintCard } from "@/components/dashboard/StyleFingerprintCard";
import { CloneQualityCard } from "@/components/dashboard/CloneQualityCard";
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

  const items = [
    {
      label: "Memories",
      value: stats?.total != null ? stats.total.toLocaleString() : "—",
      sub: stats?.sources?.length
        ? `${stats.sources.length} source${stats.sources.length !== 1 ? "s" : ""} connected`
        : "no sources yet",
    },
    {
      label: "Episodic",
      value: stats?.episodic != null ? stats.episodic.toLocaleString() : "—",
      sub: stats?.semantic != null ? `+${stats.semantic} semantic facts` : "",
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
    },
    {
      label: "Approval",
      value: quality?.approval_rate != null ? `${quality.approval_rate}%` : "—",
      sub:
        quality?.avg_confidence != null
          ? `${quality.avg_confidence}% avg confidence`
          : "no responses yet",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {items.map(({ label, value, sub }) => (
        <div key={label} className="glass rounded-2xl px-5 py-4">
          <p className="text-2xl font-light text-white/85 tabular-nums">{value}</p>
          <p className="text-xs text-white/45 mt-1">{label}</p>
          <p className="text-[11px] text-white/20 mt-0.5 truncate">{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent queries
// ---------------------------------------------------------------------------
function RecentQueries() {
  const { data, isLoading } = useSWR<{ traces: ActivityTrace[] }>(
    `/api/activity?limit=8`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const traces = data?.traces ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-11 glass rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="glass rounded-xl px-4 py-10 text-center">
        <p className="text-sm text-white/25">No queries yet.</p>
        <p className="text-xs text-white/20 mt-1">
          Test your clone to see activity here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {traces.map((trace) => {
        const signal = trace.feedback_signal;
        const dot =
          signal === "approved"
            ? "bg-emerald-400/70"
            : signal === "edited"
            ? "bg-blue-300/60"
            : signal === "rejected"
            ? "bg-red-400/60"
            : "bg-white/15";

        return (
          <div
            key={trace.id}
            className="flex items-center gap-3 glass hover:glass-md rounded-xl px-4 py-3 transition-all group"
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
            <p className="flex-1 text-sm text-white/55 truncate group-hover:text-white/75 transition-colors">
              {trace.input_message}
            </p>
            <div className="flex items-center gap-3 shrink-0">
              {trace.confidence != null && (
                <span className="text-[11px] text-white/25 font-mono">
                  {trace.confidence}%
                </span>
              )}
              {trace.needs_escalation && (
                <span className="text-[10px] text-amber-300/60 bg-amber-400/10 rounded-full px-1.5 py-px">
                  escalated
                </span>
              )}
              <span className="text-[11px] text-white/20 w-5 text-right">
                {rel(trace.created_at)}
              </span>
            </div>
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
  gmail: "Gmail",
  slack: "Slack",
  github: "GitHub",
  notion: "Notion",
  upload: "File upload",
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
    <div className="glass rounded-2xl p-5">
      <p className="text-xs font-medium text-white/45 mb-4">Data sources</p>
      <div className="flex flex-col gap-2.5">
        {ALL.map((src) => (
          <div key={src} className="flex items-center justify-between">
            <span className="text-sm text-white/50">{SOURCE_LABELS[src]}</span>
            {connected.has(src) ? (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/70">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                Connected
              </span>
            ) : (
              <Link
                href="/dashboard/train"
                className="text-[11px] text-white/20 hover:text-white/45 transition-colors"
              >
                Connect →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick actions panel
// ---------------------------------------------------------------------------
function QuickActions({
  cloneHandle,
  cloneId,
}: {
  cloneHandle: string;
  cloneId: string;
}) {
  const { data: stats } = useSWR<BrainStats>(
    `/api/brain/stats?clone_id=${cloneId}`,
    fetcher
  );
  const { data: quality } = useSWR<{ pending_review: number }>(
    `/api/brain/quality?clone_id=${cloneId}`,
    fetcher
  );

  const lowMemory = (stats?.total ?? 0) < 50;
  const pending = quality?.pending_review ?? 0;

  const actions = [
    {
      label: "Open clone chat ↗",
      href: `/c/${cloneHandle}`,
      external: true,
      highlight: false,
    },
    {
      label: lowMemory ? "Add training data →" : "Train →",
      href: "/dashboard/train",
      highlight: lowMemory,
    },
    ...(pending > 0
      ? [
          {
            label: `Review ${pending} response${pending !== 1 ? "s" : ""} →`,
            href: "/dashboard/activity?filter=pending",
            highlight: true,
          },
        ]
      : []),
    { label: "Deploy settings →", href: "/dashboard/deploy", highlight: false },
  ];

  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs font-medium text-white/45 mb-3">Quick actions</p>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            target={"external" in a && a.external ? "_blank" : undefined}
            rel={"external" in a && a.external ? "noopener noreferrer" : undefined}
            className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all ${
              a.highlight
                ? "glass-md text-white/75 hover:glass-hi"
                : "glass text-white/40 hover:glass-md hover:text-white/65"
            }`}
          >
            {a.label}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-white/25 shrink-0"
            >
              <path
                d="M2 6h8M6 2l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No-clone state
// ---------------------------------------------------------------------------
function CreateCloneForm() {
  const router = useRouter();
  const [step, setStep] = useState<"prompt" | "form">("prompt");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (step === "prompt") {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="glass rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-xl font-light text-white/85 mb-2">Create your clone</h1>
          <p className="text-sm text-white/40 mb-7 leading-relaxed">
            Your digital consciousness — a chatbot that thinks and sounds exactly like you.
          </p>
          <button
            onClick={() => setStep("form")}
            className="glass-md hover:glass-hi rounded-xl px-5 py-3 text-sm text-white/70 hover:text-white/90 transition-all"
          >
            Get started →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="glass rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-xl font-light text-white/85 mb-6">Set up your clone</h1>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/85 placeholder:text-white/25 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">
              Handle{" "}
              <span className="text-white/25">· your public URL: /c/your-handle</span>
            </label>
            <input
              type="text"
              value={handle}
              onChange={(e) =>
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="jane-smith"
              className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/85 placeholder:text-white/25 outline-none"
            />
          </div>
          {error && <p className="text-xs text-white/40">{error}</p>}
          <button
            disabled={submitting || !handle || !name}
            onClick={async () => {
              setSubmitting(true);
              setError("");
              try {
                await createClone({ handle, display_name: name });
                router.push("/onboarding");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create clone");
              } finally {
                setSubmitting(false);
              }
            }}
            className="glass-md hover:glass-hi rounded-xl px-5 py-3 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create clone →"}
          </button>
        </div>
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
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (!clone) return <CreateCloneForm />;

  return (
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">{clone.display_name}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-sm text-white/30 font-mono">@{clone.handle}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
              Active
            </span>
            <span className="text-[11px] text-white/25 bg-white/[0.05] border border-white/[0.06] rounded-full px-2 py-px capitalize">
              {clone.access_mode ?? "private"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${clone.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="glass hover:glass-md rounded-xl px-4 py-2 text-sm text-white/45 hover:text-white/65 transition-all"
          >
            Open chat ↗
          </Link>
          <Link
            href="/dashboard/train"
            className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/65 hover:text-white/85 transition-all"
          >
            Train →
          </Link>
        </div>
      </div>

      {/* 4-stat bar */}
      <StatsBar cloneId={clone.clone_id} />

      {/* Main 2-col: recent queries + sidebar */}
      <div className="grid grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Recent queries */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-white/45">Recent queries</p>
            <Link
              href="/dashboard/activity"
              className="text-[11px] text-white/20 hover:text-white/45 transition-colors"
            >
              View all →
            </Link>
          </div>
          <RecentQueries />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <SourcesPanel cloneId={clone.clone_id} />
          <QuickActions cloneHandle={clone.handle} cloneId={clone.clone_id} />
        </div>
      </div>

      {/* Bottom 2-col: style + quality */}
      <div className="grid grid-cols-2 gap-6">
        <StyleFingerprintCard fingerprint={clone.style_fingerprint} />
        <CloneQualityCard cloneId={clone.clone_id} />
      </div>
    </div>
  );
}
