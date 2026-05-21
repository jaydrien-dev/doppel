"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Memory {
  id: string;
  content: string;
  category: string;
  source: string;
  created_at: string;
}

type Category = "background" | "goal" | "preference" | "experience" | "expertise";

const CATEGORIES: {
  value: Category;
  label: string;
  color: string;       // text / icon color
  bg: string;          // pill / badge background
  border: string;      // pill / badge border
  glow: string;        // card left-border accent
}[] = [
  {
    value: "background",
    label: "Background",
    color:  "rgba(96,165,250,0.85)",   // blue-400
    bg:     "rgba(96,165,250,0.08)",
    border: "rgba(96,165,250,0.20)",
    glow:   "rgba(96,165,250,0.35)",
  },
  {
    value: "goal",
    label: "Goal",
    color:  "rgba(52,211,153,0.85)",   // emerald-400
    bg:     "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.20)",
    glow:   "rgba(52,211,153,0.35)",
  },
  {
    value: "preference",
    label: "Preference",
    color:  "rgba(167,139,250,0.85)",  // violet-400
    bg:     "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.20)",
    glow:   "rgba(167,139,250,0.35)",
  },
  {
    value: "experience",
    label: "Experience",
    color:  "rgba(251,191,36,0.85)",   // amber-400
    bg:     "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.20)",
    glow:   "rgba(251,191,36,0.35)",
  },
  {
    value: "expertise",
    label: "Expertise",
    color:  "rgba(34,211,238,0.85)",   // cyan-400
    bg:     "rgba(34,211,238,0.08)",
    border: "rgba(34,211,238,0.20)",
    glow:   "rgba(34,211,238,0.35)",
  },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c])) as Record<Category, typeof CATEGORIES[0]>;

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Category pill selector
// ---------------------------------------------------------------------------
function CategoryPills({
  selected,
  onChange,
}: {
  selected: Category;
  onChange: (c: Category) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {CATEGORIES.map((cat) => {
        const active = selected === cat.value;
        return (
          <button
            key={cat.value}
            onClick={() => onChange(cat.value)}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              border: `1px solid ${active ? cat.border : "rgba(255,255,255,0.08)"}`,
              background: active ? cat.bg : "rgba(255,255,255,0.03)",
              color: active ? cat.color : "rgba(255,255,255,0.35)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 150ms",
              fontFamily: "inherit",
            }}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory card
// ---------------------------------------------------------------------------
function MemoryCard({
  memory,
  onDelete,
  index,
}: {
  memory: Memory;
  onDelete: (id: string) => void;
  index: number;
}) {
  const [deleting, setDeleting] = useState(false);
  const cat = CATEGORY_MAP[memory.category as Category] ?? CATEGORIES[0];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/consumer/brain/${memory.id}`, { method: "DELETE" });
      if (res.ok) onDelete(memory.id);
    } finally {
      setDeleting(false);
    }
  };

  const isDoc = memory.source?.startsWith("document:");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderLeft: `3px solid ${cat.glow}`,
        borderRadius: 14,
        padding: "13px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      {/* Category pill */}
      <span style={{
        flexShrink: 0,
        marginTop: 1,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${cat.border}`,
        background: cat.bg,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.02em",
        color: cat.color,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}>
        {cat.label}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 14,
          color: "rgba(255,255,255,0.75)",
          lineHeight: 1.55,
          wordBreak: "break-word",
        }}>
          {memory.content}
        </p>
        <p style={{ margin: "5px 0 0", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
          {timeAgo(memory.created_at)}
          {isDoc && (
            <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.18)" }}>
              · {memory.source.replace("document:", "")}
            </span>
          )}
          {memory.source === "inferred" && (
            <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.18)" }}>· inferred</span>
          )}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Remove memory"
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "transparent",
          color: "rgba(255,255,255,0.22)",
          cursor: deleting ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(248,113,113,0.70)";
          e.currentTarget.style.borderColor = "rgba(248,113,113,0.20)";
          e.currentTarget.style.background = "rgba(248,113,113,0.06)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.22)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Upload zone
// ---------------------------------------------------------------------------
function UploadZone({
  category,
  onUploaded,
}: {
  category: Category;
  onUploaded: (count: number, filename: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const cat = CATEGORY_MAP[category];

  const accepted = ".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.rtf";

  async function processFile(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      const res = await fetch("/api/consumer/brain/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.detail ?? "Upload failed");
      const msg = `${data.chunks_stored} chunks from ${data.filename}`;
      setToast(msg);
      onUploaded(data.chunks_stored, data.filename);
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Upload failed");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          border: `1px dashed ${drag ? cat.border : "rgba(255,255,255,0.09)"}`,
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: uploading ? "wait" : "pointer",
          background: drag ? cat.bg : "rgba(255,255,255,0.02)",
          transition: "all 150ms",
        }}
      >
        {uploading ? (
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${cat.color}`, borderTopColor: "transparent", display: "inline-block", flexShrink: 0, animation: "spin 0.7s linear infinite" }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: cat.color }}>
            <path d="M8 2v8M4 6l4-4 4 4M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        <span style={{ fontSize: 12, color: uploading ? cat.color : "rgba(255,255,255,0.35)" }}>
          {uploading ? "Uploading…" : "Upload a document — PDF, DOCX, PPTX, TXT, CSV"}
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accepted}
        style={{ display: "none" }}
        onChange={onFileChange}
      />
      <AnimatePresence>
        {toast && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: toast.includes("failed") || toast.includes("Failed")
                ? "rgba(248,113,113,0.70)"
                : cat.color,
            }}
          >
            {toast.includes("failed") || toast.includes("Failed") ? toast : `Saved: ${toast}`}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category breakdown dots
// ---------------------------------------------------------------------------
function CategoryBreakdown({ memories }: { memories: Memory[] }) {
  if (memories.length === 0) return null;
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.value, 0])) as Record<Category, number>;
  memories.forEach((m) => {
    const k = m.category as Category;
    if (k in counts) counts[k]++;
  });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
      {CATEGORIES.filter((c) => counts[c.value] > 0).map((cat) => (
        <span key={cat.value} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 999,
          border: `1px solid ${cat.border}`,
          background: cat.bg,
          fontSize: 11, color: cat.color, fontWeight: 500,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: cat.color, display: "inline-block" }} />
          {cat.label} · {counts[cat.value]}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ConsumerBrainPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("background");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Fetch on mount
  useEffect(() => {
    fetch("/api/consumer/brain")
      .then((r) => r.json())
      .then((data) => {
        if (data.memories) setMemories(data.memories);
        else setError(data.error ?? "Failed to load memories");
      })
      .catch(() => setError("Failed to load memories"))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/consumer/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? data.detail ?? "Failed to save");
        return;
      }
      setMemories((prev) => [{
        id: data.id, content: trimmed, category,
        source: "manual", created_at: data.created_at,
      }, ...prev]);
      setContent("");
    } catch {
      setAddError("Failed to save memory");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  // After document upload, reload memories
  const handleUploaded = (_count: number, _filename: string) => {
    fetch("/api/consumer/brain")
      .then((r) => r.json())
      .then((data) => { if (data.memories) setMemories(data.memories); });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    }
  };

  const cat = CATEGORY_MAP[category];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", fontFamily: "var(--font-sans, sans-serif)" }}>
      {/* Nav */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 24px", height: 52,
        display: "flex", alignItems: "center", gap: 16,
        position: "sticky", top: 0,
        background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)", zIndex: 10,
      }}>
        <Link href="/home" style={{
          display: "flex", alignItems: "center", gap: 6,
          textDecoration: "none", color: "rgba(255,255,255,0.38)",
          fontSize: 12, transition: "color 150ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.38)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Home
        </Link>
        <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>Your Brain</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: 28 }}
        >
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 10px" }}>
            Consumer
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            Your Brain
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.6 }}>
            Everything you&apos;ve shared about yourself. Every clone you talk to has access to this.
          </p>
        </motion.div>

        {/* Category breakdown */}
        {!loading && <CategoryBreakdown memories={memories} />}

        {/* Add form */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid rgba(255,255,255,0.07)`,
            borderTop: `2px solid ${cat.glow}`,
            borderRadius: 16,
            padding: "16px",
            marginBottom: 24,
            transition: "border-top-color 200ms",
          }}
        >
          {/* Category selector */}
          <div style={{ marginBottom: 12 }}>
            <CategoryPills selected={category} onChange={setCategory} />
          </div>

          {/* Textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share something about yourself — your goals, background, preferences, or expertise…"
            rows={3}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, padding: "10px 14px",
              fontSize: 14, color: "rgba(255,255,255,0.70)",
              outline: "none", resize: "none",
              fontFamily: "inherit", lineHeight: 1.55,
              boxSizing: "border-box", transition: "border-color 150ms",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = cat.border; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          />

          {addError && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(248,113,113,0.70)" }}>
              {addError}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.20)" }}>
              ⌘ Enter to save
            </p>
            <button
              onClick={handleAdd}
              disabled={adding || !content.trim()}
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                border: `1px solid ${adding || !content.trim() ? "rgba(255,255,255,0.08)" : cat.border}`,
                background: adding || !content.trim() ? "rgba(255,255,255,0.03)" : cat.bg,
                color: adding || !content.trim() ? "rgba(255,255,255,0.25)" : cat.color,
                fontSize: 13, fontWeight: 500,
                cursor: adding || !content.trim() ? "not-allowed" : "pointer",
                transition: "all 150ms", fontFamily: "inherit",
              }}
            >
              {adding ? "Saving…" : "Add memory"}
            </button>
          </div>

          {/* Upload zone */}
          <UploadZone category={category} onUploaded={handleUploaded} />
        </motion.div>

        {/* Memory list */}
        {loading && (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
          </div>
        )}

        {error && (
          <div style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(248,113,113,0.15)", background: "rgba(248,113,113,0.05)" }}>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(248,113,113,0.70)" }}>{error}</p>
          </div>
        )}

        {!loading && !error && memories.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            style={{ padding: "40px 0", textAlign: "center" }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 3a6 6 0 1 1 0 12A6 6 0 0 1 9 3zm0 4v2.5m0 2.5v.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.30)", margin: "0 0 6px" }}>
              Nothing here yet
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", margin: 0 }}>
              Add something above — type it or upload a document.
            </p>
          </motion.div>
        )}

        {!loading && !error && memories.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AnimatePresence mode="popLayout">
              {memories.map((m, i) => (
                <MemoryCard key={m.id} memory={m} onDelete={handleDelete} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
