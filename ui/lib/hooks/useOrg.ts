"use client";

import useSWR from "swr";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  is_owner: boolean;
  created_at: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    const data = await r.json();
    // Backend returns { org: {...} | null }
    return (data?.org as OrgInfo | null) ?? null;
  });

export function useOrg() {
  const { data, error, isLoading, mutate } = useSWR<OrgInfo | null>(
    "/api/org",
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    org: data ?? null,
    isLoading,
    error,
    mutate,
    hasOrg: data !== null && data !== undefined,
  };
}
