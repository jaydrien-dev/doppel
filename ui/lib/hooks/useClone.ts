"use client";

import useSWR from "swr";
import type { CloneOwnerInfo } from "../types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useClone() {
  const { data, error, isLoading, mutate } = useSWR<CloneOwnerInfo | null>(
    "/api/clones/me",
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    clone: data ?? null,
    isLoading,
    error,
    mutate,
    hasClone: data !== null && data !== undefined,
  };
}
