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
    <div className="glass" style={{ borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isPolling && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.40)", display: "inline-block" }} />
          )}
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>
            {isFailed
              ? "Ingestion failed"
              : isDone
              ? "Ingestion complete"
              : isPolling
              ? "Ingesting\u2026"
              : "Queued"}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
          {job ? `${job.processed_items} / ${job.total_items}` : "\u2014"}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div
          style={{
            width: `${isDone ? 100 : pct}%`,
            height: "100%",
            borderRadius: 9999,
            background: "rgba(255,255,255,0.25)",
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {isFailed && job?.error_message && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>{job.error_message}</p>
      )}

      {isDone && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          {job?.processed_items} memories added
          {job?.failed_items ? ` \u00b7 ${job.failed_items} skipped` : ""}
        </p>
      )}
    </div>
  );
}
