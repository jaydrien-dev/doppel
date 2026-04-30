"use client";

import useSWR from "swr";
import type { JobStatus } from "../types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Polls /api/ingestion/jobs/{id} every 2s until the job reaches a terminal state.
 * Returns null when jobId is undefined/null (no active job).
 */
export function useJobPoller(jobId: string | null) {
  const isDone = (data?: JobStatus) =>
    data?.status === "done" || data?.status === "failed";

  const { data, error } = useSWR<JobStatus>(
    jobId ? `/api/ingestion/jobs/${jobId}` : null,
    fetcher,
    {
      refreshInterval: (data) => (isDone(data) ? 0 : 2000),
      revalidateOnFocus: false,
    }
  );

  return {
    job: data ?? null,
    isPolling: !!jobId && !isDone(data),
    isComplete: isDone(data),
    error,
  };
}
