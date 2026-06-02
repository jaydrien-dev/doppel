"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { patchMemory } from "@/lib/api";
import type { MemoryChunk } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = "pinned" | "all" | "semantic" | "files";

const SOURCE_LABEL: Record<string, string> = {
  gmail: "Gmail",
  upload: "Upload",
  seed_qa: "Q&A",
  chat: "Chat",
  slack: "Slack",
};

// ---------------------------------------------------------------------------
// Episodic memory row — pin, hide, delete, edit content
// ---------------------------------------------------------------------------
function MemoryRow({
  chunk,
  cloneId,
  onUpdated,
  isSelected,
  onSelect,
}: {
  chunk: MemoryChunk;
  cloneId: string;
  onUpdated: () => void;
  isSelected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(chunk.content);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggle(field: "is_pinned" | "is_excluded", value: boolean) {
    setSaving(true);
    try {
      await patchMemory(chunk.id, { clone_id: cloneId, [field]: value });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editValue.trim() || editValue === chunk.content) { setEditing(false); return; }
    setSaving(true);
    try {
      await patchMemory(chunk.id, { clone_id: cloneId, content: editValue.trim() });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await fetch(`/api/brain/memories/${chunk.id}?clone_id=${cloneId}`, { method: "DELETE" });
      onUpdated();
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!editing && !confirmDelete) setConfirmDelete(false); }}
      style={{
        padding: "12px 18px",
        opacity: chunk.is_excluded ? 0.40 : 1,
        background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {editing ? (
        /* Inline editor */
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            autoFocus
            className="input"
            style={{ fontSize: 13, lineHeight: 1.55, resize: "vertical", width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editValue.trim()}
              className="btn btn--primary btn--sm"
            >{saving ? "Saving…" : "Save"}</button>
            <button
              onClick={() => { setEditing(false); setEditValue(chunk.content); }}
              className="btn btn--ghost btn--sm"
            >Cancel</button>
          </div>
        </div>
      ) : confirmDelete ? (
        /* Delete confirm */
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p style={{ fontSize: 12, color: "rgba(248,113,113,0.75)", margin: 0, flex: 1 }}>
            Permanently delete this memory?
          </p>
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              fontSize: 11, padding: "4px 12px", borderRadius: 7, cursor: "pointer",
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)",
              color: "rgba(248,113,113,0.85)", fontFamily: "inherit",
            }}
          >{saving ? "…" : "Delete"}</button>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{
              fontSize: 11, padding: "4px 12px", borderRadius: 7, cursor: "pointer",
              background: "none", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.40)", fontFamily: "inherit",
            }}
          >Cancel</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {/* Checkbox (bulk select) */}
          {onSelect && (
            <input
              type="checkbox"
              checked={isSelected ?? false}
              onChange={(e) => onSelect(chunk.id, e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0, cursor: "pointer", width: 13, height: 13, accentColor: "rgba(255,255,255,0.55)" }}
            />
          )}
          {/* Pin button */}
          <button
            onClick={() => toggle("is_pinned", !chunk.is_pinned)}
            disabled={saving}
            title={chunk.is_pinned ? "Unpin" : "Pin — always retrieved"}
            style={{
              marginTop: 2, flexShrink: 0, background: "none", border: "none",
              cursor: saving ? "not-allowed" : "pointer", padding: 0,
              color: chunk.is_pinned ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.15)",
              opacity: saving ? 0.40 : 1, transition: "color 0.15s",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M5 1h2l.5 3.5L9 5v1H7.5L7 11H5l-.5-5H3V5l1.5-.5L5 1z"
                fill={chunk.is_pinned ? "currentColor" : "none"}
                stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.55,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden", margin: 0,
            }}>
              {chunk.content}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "2px 6px" }}>
                {SOURCE_LABEL[chunk.source] ?? chunk.source}
              </span>
              {chunk.topics.slice(0, 2).map((t) => (
                <span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>{t}</span>
              ))}
              {chunk.created_at && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>
                  {new Date(chunk.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          </div>

          {/* Hover actions */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
            {/* Edit */}
            <button
              onClick={() => { setEditing(true); setEditValue(chunk.content); }}
              disabled={saving}
              title="Edit content"
              style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >edit</button>
            {/* Hide / Restore */}
            {!chunk.is_excluded ? (
              <button onClick={() => toggle("is_excluded", true)} disabled={saving} title="Exclude from retrieval"
                style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                hide
              </button>
            ) : (
              <button onClick={() => toggle("is_excluded", false)} disabled={saving} title="Restore"
                style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                restore
              </button>
            )}
            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              title="Delete permanently"
              style={{ fontSize: 10, color: "rgba(248,113,113,0.45)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semantic fact row — edit content, delete
// ---------------------------------------------------------------------------
interface SemanticFact {
  id: string;
  fact: string;
  domain: string | null;
  confidence: number;
  created_at: string | null;
}

function SemanticRow({
  fact,
  cloneId,
  onUpdated,
}: {
  fact: SemanticFact;
  cloneId: string;
  onUpdated: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(fact.fact);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSaveEdit() {
    if (!editValue.trim() || editValue === fact.fact) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/brain/semantic/${fact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, fact: editValue.trim() }),
      });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await fetch(`/api/brain/semantic/${fact.id}?clone_id=${cloneId}`, { method: "DELETE" });
      onUpdated();
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  const confColor = fact.confidence >= 0.8
    ? "rgba(52,211,153,0.65)"
    : fact.confidence >= 0.5
    ? "rgba(255,255,255,0.40)"
    : "rgba(251,191,36,0.60)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "11px 18px",
        background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={2}
            autoFocus
            className="input"
            style={{ fontSize: 13, lineHeight: 1.55, resize: "vertical", width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleSaveEdit} disabled={saving || !editValue.trim()} className="btn btn--primary btn--sm">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setEditValue(fact.fact); }} className="btn btn--ghost btn--sm">Cancel</button>
          </div>
        </div>
      ) : confirmDelete ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p style={{ fontSize: 12, color: "rgba(248,113,113,0.75)", margin: 0, flex: 1 }}>Delete this fact?</p>
          <button onClick={handleDelete} disabled={saving}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 7, cursor: "pointer", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)", color: "rgba(248,113,113,0.85)", fontFamily: "inherit" }}>
            {saving ? "…" : "Delete"}
          </button>
          <button onClick={() => setConfirmDelete(false)}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 7, cursor: "pointer", background: "none", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.40)", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, margin: 0 }}>{fact.fact}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 5, alignItems: "center" }}>
              {fact.domain && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "2px 6px" }}>
                  {fact.domain}
                </span>
              )}
              <span style={{ fontSize: 10, color: confColor }}>{Math.round(fact.confidence * 100)}% conf</span>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: "flex", gap: 6, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
            <button onClick={() => { setEditing(true); setEditValue(fact.fact); }} disabled={saving}
              style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>edit</button>
            <button onClick={() => setConfirmDelete(true)} disabled={saving}
              style={{ fontSize: 10, color: "rgba(248,113,113,0.45)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semantic memory list
// ---------------------------------------------------------------------------
function SemanticList({ cloneId }: { cloneId: string }) {
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 30;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const params = new URLSearchParams({ clone_id: cloneId, limit: String(LIMIT), offset: String(page * LIMIT) });
  if (search) params.set("search", search);

  const { data, isLoading, mutate } = useSWR<{ facts: SemanticFact[]; total: number }>(
    `/api/brain/semantic?${params}`, fetcher, { revalidateOnFocus: false }
  );

  const facts = data?.facts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      {/* Search */}
      <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}
            width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search facts…" className="input" style={{ paddingLeft: 32, fontSize: 12 }} />
        </div>
      </div>

      {isLoading && <div style={{ padding: "20px", fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</div>}
      {!isLoading && facts.length === 0 && (
        <div style={{ padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>
            {search ? `No facts matching "${search}".` : "No semantic facts yet. Train your clone to generate them."}
          </p>
        </div>
      )}
      {facts.length > 0 && (
        <div>
          {facts.map((f, idx) => (
            <div key={f.id} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
              <SemanticRow fact={f} cloneId={cloneId} onUpdated={mutate} />
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
            {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="btn btn--ghost btn--sm">← Prev</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="btn btn--ghost btn--sm">Next →</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Uploaded files list — replace by source_ref
// ---------------------------------------------------------------------------
type UploadEntry = { source_ref: string; chunk_count: number; last_ingested_at: string | null };

function FilesList({ cloneId }: { cloneId: string }) {
  const { data, isLoading, mutate } = useSWR<{ uploads: UploadEntry[] }>(
    `/api/brain/uploads?clone_id=${cloneId}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<string | null>(null); // source_ref being replaced
  const [status, setStatus] = useState<Record<string, string>>({}); // source_ref → message

  function rel(iso: string): string {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function triggerReplace(sourceRef: string) {
    setReplacing(sourceRef);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !replacing) return;
    const sourceRef = replacing;
    e.target.value = "";
    setReplacing(null);
    setStatus((s) => ({ ...s, [sourceRef]: "Replacing…" }));

    await fetch(`/api/brain/memories?clone_id=${cloneId}&source_ref=${encodeURIComponent(sourceRef)}`, { method: "DELETE" });

    const fd = new FormData();
    fd.append("clone_id", cloneId);
    fd.append("file", file);
    const res = await fetch("/fastapi/ingestion/file", { method: "POST", body: fd });
    let d: Record<string, unknown> = {};
    try { d = await res.json(); } catch { d = {}; }

    if (res.ok) {
      setStatus((s) => ({ ...s, [sourceRef]: `Replaced — ${d.chunks_stored} chunks` }));
      mutate();
    } else {
      setStatus((s) => ({ ...s, [sourceRef]: String(d.detail ?? d.error ?? "Failed") }));
    }
  }

  async function handleDelete(sourceRef: string) {
    setStatus((s) => ({ ...s, [sourceRef]: "Deleting…" }));
    await fetch(`/api/brain/memories?clone_id=${cloneId}&source_ref=${encodeURIComponent(sourceRef)}`, { method: "DELETE" });
    mutate();
  }

  if (isLoading) return <div style={{ padding: "20px", fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</div>;

  const uploads = data?.uploads ?? [];

  if (uploads.length === 0) {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>No uploaded files yet.</p>
      </div>
    );
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.html" style={{ display: "none" }} onChange={handleFileSelected} />
      {uploads.map((entry, idx) => {
        const msg = status[entry.source_ref];
        const isReplacing = msg === "Replacing…" || msg === "Deleting…";
        return (
          <div key={entry.source_ref} style={{
            borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
            padding: "11px 20px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
              {entry.source_ref.split(".").pop()?.toUpperCase()}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.source_ref}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
              {entry.chunk_count} chunk{entry.chunk_count !== 1 ? "s" : ""}
            </span>
            {entry.last_ingested_at && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
                {rel(entry.last_ingested_at)}
              </span>
            )}
            {msg && msg !== "Replacing…" && msg !== "Deleting…" && (
              <span style={{ fontSize: 11, color: msg.startsWith("Replaced") ? "rgba(52,211,153,0.60)" : "rgba(248,113,113,0.60)", flexShrink: 0 }}>
                {msg}
              </span>
            )}
            {isReplacing && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>{msg}</span>}
            {!isReplacing && (
              <>
                <button onClick={() => triggerReplace(entry.source_ref)}
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                  Replace
                </button>
                <button onClick={() => handleDelete(entry.source_ref)}
                  style={{ fontSize: 11, color: "rgba(248,113,113,0.40)", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                  Delete
                </button>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function MemoryInspector({ cloneId }: { cloneId: string }) {
  const [tab, setTab] = useState<Tab>("pinned");
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 20;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const params = new URLSearchParams({ clone_id: cloneId, limit: String(LIMIT), offset: String(page * LIMIT) });
  if (tab === "pinned") params.set("pinned_only", "true");
  if (tab === "all") params.set("include_excluded", "true");
  if (search && tab !== "semantic") params.set("search", search);

  const url = (tab === "semantic" || tab === "files") ? null : `/api/brain/memories?${params}`;

  const { data, isLoading, mutate } = useSWR<{ memories: MemoryChunk[]; total: number }>(
    url, fetcher, { revalidateOnFocus: false }
  );

  const memories = data?.memories ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const allPageSelected = memories.length > 0 && memories.every((c) => selected.has(c.id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((s) => { const n = new Set(s); memories.forEach((c) => n.delete(c.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); memories.forEach((c) => n.add(c.id)); return n; });
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selected).map((id) =>
        fetch(`/api/brain/memories/${id}?clone_id=${cloneId}`, { method: "DELETE" })
      ));
      setSelected(new Set());
      mutate();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="glass" style={{ borderRadius: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tab === "semantic" ? 0 : 12 }}>
          <div>
            <p className="db-h3">Memory inspector</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 3 }}>
              {tab === "semantic"
                ? "Structured facts — edit or delete individual entries"
                : tab === "files"
                ? "Uploaded files — replace all chunks from a file at once"
                : "Pin important facts · Hide sensitive content · Edit or delete chunks"}
            </p>
          </div>
          {/* Tab switcher */}
          <div className="glass" style={{ borderRadius: 12, padding: 4, display: "flex", gap: 2 }}>
            {(["pinned", "all", "semantic", "files"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setPage(0); setSearchInput(""); setSelected(new Set()); }}
                className={tab === t ? "glass-md" : ""}
                style={{
                  padding: "5px 12px", borderRadius: 10, fontSize: 12, cursor: "pointer", border: "none",
                  background: tab === t ? undefined : "transparent",
                  color: tab === t ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
                  transition: "color 0.15s",
                }}>
                {t === "pinned" ? "Pinned" : t === "all" ? "All" : t === "semantic" ? "Facts" : "Files"}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk actions — only for episodic tabs */}
        {tab !== "semantic" && tab !== "files" && memories.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleSelectAll}
                style={{ cursor: "pointer", width: 13, height: 13, accentColor: "rgba(255,255,255,0.55)" }}
              />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                {selected.size > 0 ? `${selected.size} selected` : "Select all"}
              </span>
            </label>
            {selected.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{
                  marginLeft: "auto", fontSize: 11, padding: "4px 12px", borderRadius: 7,
                  cursor: bulkDeleting ? "not-allowed" : "pointer",
                  background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.22)",
                  color: "rgba(248,113,113,0.75)", fontFamily: "inherit", opacity: bulkDeleting ? 0.5 : 1,
                }}
              >
                {bulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
              </button>
            )}
          </div>
        )}

        {/* Search — only for episodic tabs */}
        {tab !== "semantic" && tab !== "files" && (
          <div style={{ position: "relative" }}>
            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}
              width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search memories…" className="input" style={{ paddingLeft: 32, fontSize: 12 }} />
            {searchInput && (
              <button onClick={() => setSearchInput("")}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>
                &times;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Semantic tab */}
      {tab === "semantic" && <SemanticList cloneId={cloneId} />}

      {/* Files tab */}
      {tab === "files" && <FilesList cloneId={cloneId} />}

      {/* Episodic tabs */}
      {tab !== "semantic" && tab !== "files" && (
        <>
          {isLoading && <div style={{ padding: "20px", fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</div>}
          {!isLoading && memories.length === 0 && (
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>
                {search ? `No memories matching "${search}".`
                  : tab === "pinned" ? "No pinned memories yet. Pin facts to ensure they're always retrieved."
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
                    isSelected={selected.has(chunk.id)}
                    onSelect={(id, checked) => setSelected((s) => {
                      const n = new Set(s);
                      checked ? n.add(id) : n.delete(id);
                      return n;
                    })}
                  />
                </div>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
                {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="btn btn--ghost btn--sm">← Prev</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="btn btn--ghost btn--sm">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
