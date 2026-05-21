"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { patchMemory } from "@/lib/api";
import type { MemoryChunk } from "@/lib/types";

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
  const [hovered, setHovered] = useState(false);

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
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 18px",
        opacity: chunk.is_excluded ? 0.40 : 1,
        background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {/* Pin button */}
      <button
        onClick={() => toggle("is_pinned", !chunk.is_pinned)}
        disabled={saving}
        title={chunk.is_pinned ? "Unpin" : "Pin \u2014 always retrieved"}
        style={{
          marginTop: 2,
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          padding: 0,
          color: chunk.is_pinned ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.15)",
          opacity: saving ? 0.40 : 1,
          transition: "color 0.15s",
        }}
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.70)",
          lineHeight: 1.55,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          margin: 0,
        }}>
          {chunk.content}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 4,
            padding: "2px 6px",
          }}>
            {SOURCE_LABEL[chunk.source] ?? chunk.source}
          </span>
          {chunk.topics.slice(0, 2).map((t) => (
            <span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>
              {t}
            </span>
          ))}
          {chunk.created_at && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>
              {new Date(chunk.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Actions — visible on hover */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
        {!chunk.is_excluded ? (
          <button
            onClick={() => toggle("is_excluded", true)}
            disabled={saving}
            title="Exclude from retrieval"
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.25)",
              background: "none",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              padding: 0,
              opacity: saving ? 0.40 : 1,
            }}
          >
            hide
          </button>
        ) : (
          <button
            onClick={() => toggle("is_excluded", false)}
            disabled={saving}
            title="Restore to retrieval"
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.40)",
              background: "none",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              padding: 0,
              opacity: saving ? 0.40 : 1,
            }}
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
    <div className="glass" style={{ borderRadius: 16, overflow: "hidden" }}>
      {/* Header + tabs */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <p className="db-h3">Memory inspector</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 3 }}>
              Pin important facts &middot; Hide sensitive content from retrieval
            </p>
          </div>
          {/* Tab switcher */}
          <div className="glass" style={{ borderRadius: 12, padding: 4, display: "flex", gap: 2 }}>
            {(["pinned", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setPage(0); setSearchInput(""); }}
                className={tab === t ? "glass-md" : ""}
                style={{
                  padding: "5px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: "pointer",
                  border: "none",
                  background: tab === t ? undefined : "transparent",
                  color: tab === t ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
                  transition: "color 0.15s",
                }}
              >
                {t === "pinned" ? "Pinned" : "All memories"}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search memories\u2026"
            className="input"
            style={{ paddingLeft: 32, fontSize: 12 }}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.25)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div style={{ padding: "20px 20px", fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading&hellip;</div>
      )}

      {!isLoading && memories.length === 0 && (
        <div style={{ padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>
            {search
              ? `No memories matching \u201c${search}\u201d.`
              : tab === "pinned"
              ? "No pinned memories yet. Pin facts to ensure they're always retrieved."
              : "No memories found. Train your clone to populate this list."}
          </p>
        </div>
      )}

      {memories.length > 0 && (
        <div>
          {memories.map((chunk, idx) => (
            <div key={chunk.id} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
              <MemoryRow
                chunk={chunk}
                cloneId={cloneId}
                onUpdated={mutate}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
            {page * LIMIT + 1}&ndash;{Math.min((page + 1) * LIMIT, total)} of {total}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="btn btn--ghost btn--sm"
            >
              &larr; Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="btn btn--ghost btn--sm"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
