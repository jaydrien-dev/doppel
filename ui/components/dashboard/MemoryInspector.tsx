"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { patchMemory } from "@/lib/api";
import type { MemoryChunk } from "@/lib/types";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = "pinned" | "all";

const SOURCE_LABEL: Record<string, string> = {
  gmail: "Gmail",
  upload: "Upload",
  seed_qa: "Q&A",
  chat: "Chat",
  slack: "Slack",
};

function MemoryRow({
  chunk,
  cloneId,
  onUpdated,
}: {
  chunk: MemoryChunk;
  cloneId: string;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function toggle(field: "is_pinned" | "is_excluded", value: boolean) {
    setSaving(true);
    try {
      await patchMemory(chunk.id, { clone_id: cloneId, [field]: value });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("py-3 px-4 flex items-start gap-3 group", chunk.is_excluded && "opacity-40")}>
      {/* Pin indicator */}
      <button
        onClick={() => toggle("is_pinned", !chunk.is_pinned)}
        disabled={saving}
        title={chunk.is_pinned ? "Unpin" : "Pin — always retrieved"}
        className={cn(
          "mt-0.5 shrink-0 transition-colors disabled:opacity-40",
          chunk.is_pinned ? "text-white/60 hover:text-white/35" : "text-white/15 hover:text-white/50"
        )}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M5 1h2l.5 3.5L9 5v1H7.5L7 11H5l-.5-5H3V5l1.5-.5L5 1z"
            fill={chunk.is_pinned ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70 leading-relaxed line-clamp-2">{chunk.content}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-white/25 bg-white/[0.04] rounded px-1.5 py-0.5">
            {SOURCE_LABEL[chunk.source] ?? chunk.source}
          </span>
          {chunk.topics.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] text-white/20">
              {t}
            </span>
          ))}
          {chunk.created_at && (
            <span className="text-[10px] text-white/15 ml-auto">
              {new Date(chunk.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!chunk.is_excluded ? (
          <button
            onClick={() => toggle("is_excluded", true)}
            disabled={saving}
            className="text-[10px] text-white/25 hover:text-white/50 transition-colors disabled:opacity-40"
            title="Exclude from retrieval"
          >
            hide
          </button>
        ) : (
          <button
            onClick={() => toggle("is_excluded", false)}
            disabled={saving}
            className="text-[10px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
            title="Restore to retrieval"
          >
            restore
          </button>
        )}
      </div>
    </div>
  );
}

export function MemoryInspector({ cloneId }: { cloneId: string }) {
  const [tab, setTab] = useState<Tab>("pinned");
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 20;

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const params = new URLSearchParams({
    clone_id: cloneId,
    limit: String(LIMIT),
    offset: String(page * LIMIT),
  });
  if (tab === "pinned") params.set("pinned_only", "true");
  if (tab === "all") params.set("include_excluded", "true");
  if (search) params.set("search", search);

  const url = `/api/brain/memories?${params}`;

  const { data, isLoading, mutate } = useSWR<{
    memories: MemoryChunk[];
    total: number;
  }>(url, fetcher, { revalidateOnFocus: false });

  const memories = data?.memories ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header + tabs */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-white/60">Memory inspector</h3>
            <p className="text-xs text-white/30 mt-0.5">
              Pin important facts · Hide sensitive content from retrieval
            </p>
          </div>
          <div className="flex gap-1 glass rounded-xl p-1">
            {(["pinned", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setPage(0); setSearchInput(""); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs transition-all capitalize",
                  tab === t ? "glass-md text-white/80" : "text-white/35 hover:text-white/55"
                )}
              >
                {t === "pinned" ? "Pinned" : "All memories"}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search memories…"
            className="w-full glass rounded-xl pl-8 pr-4 py-2 text-xs text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="px-5 py-6 text-sm text-white/30">Loading…</div>
      )}

      {!isLoading && memories.length === 0 && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-white/30">
            {search
              ? `No memories matching "${search}".`
              : tab === "pinned"
              ? "No pinned memories yet. Pin facts to ensure they're always retrieved."
              : "No memories found. Train your clone to populate this list."}
          </p>
        </div>
      )}

      {memories.length > 0 && (
        <div className="divide-y divide-white/[0.04]">
          {memories.map((chunk) => (
            <MemoryRow
              key={chunk.id}
              chunk={chunk}
              cloneId={cloneId}
              onUpdated={mutate}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-xs text-white/25">
            {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="text-xs text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="text-xs text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
