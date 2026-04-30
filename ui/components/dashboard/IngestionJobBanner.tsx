"use client";

import { useJobPoller } from "@/lib/hooks/useJobPoller";

interface IngestionJobBannerProps {
  jobId: string | null;
  onComplete?: () => void;
}

export function IngestionJobBanner({ jobId, onComplete }: IngestionJobBannerProps) {
  const { job, isPolling, isComplete } = useJobPoller(jobId);

  if (!job && !jobId) return null;

  const pct = job
    ? job.total_items > 0
      ? Math.round((job.processed_items / job.total_items) * 100)
      : 0
    : 0;

  const isDone = job?.status === "done";
  const isFailed = job?.status === "failed";

  // Notify parent when done
  if (isComplete && isDone && onComplete) {
    onComplete();
  }

  return (
    <div className="glass rounded-xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isPolling && (
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
          )}
          <span className="text-sm text-white/60">
            {isFailed
              ? "Ingestion failed"
              : isDone
              ? "Ingestion complete"
              : isPolling
              ? "Ingesting…"
              : "Queued"}
          </span>
        </div>
        <span className="text-xs text-white/30">
          {job
            ? `${job.processed_items} / ${job.total_items}`
            : "—"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-white/[0.08] rounded-full overflow-hidden">
        <div
          className="h-full bg-white/30 rounded-full transition-all duration-500"
          style={{ width: `${isDone ? 100 : pct}%` }}
        />
      </div>

      {isFailed && job?.error_message && (
        <p className="text-xs text-white/35 mt-2">{job.error_message}</p>
      )}

      {isDone && (
        <p className="text-xs text-white/35 mt-2">
          {job?.processed_items} memories added
          {job?.failed_items ? ` · ${job.failed_items} skipped` : ""}
        </p>
      )}
    </div>
  );
}
