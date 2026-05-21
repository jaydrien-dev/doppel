"use client";

import useSWR from "swr";
import type { CloneOwnerInfo } from "../types";

interface ClonesResponse {
  clones: CloneOwnerInfo[];
  count: number;
  limit: number;
  tier: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useClones() {
  const { data, error, isLoading, mutate } = useSWR<ClonesResponse>(
    "/api/clones/mine",
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    clones: data?.clones ?? [],
    count: data?.count ?? 0,
    limit: data?.limit ?? 2,
    tier: data?.tier ?? "free",
    isLoading,
    error,
    mutate,
  };
}
