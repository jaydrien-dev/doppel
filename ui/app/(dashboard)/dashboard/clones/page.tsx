"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CloneRow {
  clone_id: string;
  display_name: string;
  handle: string;
  access_mode: "private" | "public" | "org_scoped" | "restricted";
  is_listed: boolean;
  subscription_tier: string;
  created_at: string | null;
  is_verified: boolean;
  listing_title: string | null;
  price_per_query: number;
  avatar_url?: string | null;
  listing_banner_url?: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Pro",
  enterprise_max: "Max",
};

const PLAN_COLORS: Record<string, string> = {
  free:           "rgba(255,255,255,0.35)",
  personal:       "#6BAEFF",
  enterprise_pro: "#C4B5FD",
  enterprise_max: "#FCD34D",
};

// ---------------------------------------------------------------------------
// Deterministic avatar color
// ---------------------------------------------------------------------------
const PALETTE = ["#6BAEFF", "#6FCF97", "#C4B5FD", "#F9AB00", "#F48FB1", "#80DEEA", "#FFCC80", "#A5D6A7"];
function deriveColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ---------------------------------------------------------------------------
// Clone status
// ---------------------------------------------------------------------------
type CloneStatus = "public" | "private" | "org" | "archived";

function getStatus(clone: CloneRow): CloneStatus {
  if (clone.access_mode === "restricted" as string) return "archived";
  if (clone.access_mode === "org_scoped") return "org";
  if (clone.is_listed) return "public";
  return "private";
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------
function DeleteModal({
  clone,
  onCancel,
  onDeleted,
}: {
  clone: CloneRow;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input and trap Escape
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clones/${clone.handle}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? d.error ?? "Failed to delete.");
        return;
      }
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const ready = confirm === clone.handle;

  return (
    // Backdrop
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420,
          background: "#111", border: "1px solid rgba(248,113,113,0.20)",
          borderRadius: 20, padding: 28,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.20)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(248,113,113,0.80)" }}>
              <path d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l.8 9.5A.5.5 0 004.3 14h7.4a.5.5 0 00.5-.5L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
              Delete {clone.display_name}?
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.5 }}>
              This permanently deletes the clone and all its memory, training data, and settings. This cannot be undone.
            </p>
          </div>
        </div>

        {/* Confirm input */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 7 }}>
            Type <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, Menlo, monospace" }}>{clone.handle}</span> to confirm
          </label>
          <input
            ref={inputRef}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && !deleting && handleDelete()}
            placeholder={clone.handle}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 10, padding: "9px 12px",
              fontSize: 13, color: "rgba(255,255,255,0.80)", fontFamily: "inherit", outline: "none",
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "rgba(248,113,113,0.75)", marginBottom: 14 }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!ready || deleting}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
              background: ready ? "rgba(248,113,113,0.85)" : "rgba(248,113,113,0.15)",
              color: ready ? "#fff" : "rgba(248,113,113,0.35)",
              fontSize: 13, fontWeight: 500, fontFamily: "inherit",
              cursor: ready && !deleting ? "pointer" : "default",
              transition: "background 180ms, color 180ms",
            }}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone card
// ---------------------------------------------------------------------------
interface Readiness {
  knowledge_ok: boolean;
  decision_making_ok: boolean;
  voice_ok: boolean;
  is_ready: boolean;
}

function CloneCard({ clone, onDeleted }: { clone: CloneRow; onDeleted: () => void }) {
  const color   = deriveColor(clone.display_name);
  const status  = getStatus(clone);
  const avatar  = clone.avatar_url || null;
  const [showDelete, setShowDelete] = useState(false);
  const [readiness, setReadiness]   = useState<Readiness | null>(null);

  useEffect(() => {
    fetch(`/api/clones/${clone.handle}/readiness`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReadiness(d); })
      .catch(() => {});
  }, [clone.handle]);

  return (
    <div
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 16, cursor: "default", transition: "background 150ms" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {/* Avatar + meta */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: avatar ? "transparent" : color,
          color: "rgba(255,255,255,0.25)", fontSize: 16, fontWeight: 600,
          overflow: "hidden",
        }}>
          {avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : clone.display_name.charAt(0).toUpperCase()
          }
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {clone.display_name}
            </p>
            {clone.is_verified && (
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "#34D399" }}>
                <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15"/>
                <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 2 }}>
            @{clone.handle}
          </p>
        </div>
        {status === "public" && (
          <span className="badge badge--pos"><span className="badge__dot" />Public</span>
        )}
        {status === "org" && (
          <span className="badge" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(107,174,255,0.10)", border: "1px solid rgba(107,174,255,0.22)", color: "rgba(107,174,255,0.80)", fontWeight: 500 }}>Org</span>
        )}
        {status === "archived" && (
          <span className="badge badge--neg">Archived</span>
        )}
        {status === "private" && (
          <span className="badge badge--neutral">Private</span>
        )}
      </div>

      {/* Stats row */}
      <div>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.20)", marginBottom: 2 }}>Plan</p>
        <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: PLAN_COLORS[clone.subscription_tier] ?? "rgba(255,255,255,0.4)" }}>
          {PLAN_LABELS[clone.subscription_tier] ?? clone.subscription_tier}
        </p>
      </div>

      {/* Readiness checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.20)", margin: 0 }}>Readiness</p>
        {readiness === null ? (
          <div style={{ display: "flex", gap: 4 }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 14, width: 60, borderRadius: 4, background: "rgba(255,255,255,0.06)", animation: "pulse 2s infinite" }} />)}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {[
              { label: "Knowledge",  ok: readiness.knowledge_ok },
              { label: "Decisions",  ok: readiness.decision_making_ok },
              { label: "Voice",      ok: readiness.voice_ok },
            ].map(c => (
              <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6, background: c.ok ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${c.ok ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.08)"}`, color: c.ok ? "rgba(52,211,153,0.75)" : "rgba(255,255,255,0.28)" }}>
                {c.ok
                  ? <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/></svg>}
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href={`/c/${clone.handle}`} className="btn btn--sm" style={{ flex: 1, justifyContent: "center" }}>
          Chat
        </Link>
        <Link href={`/dashboard/clones/${clone.handle}/edit`} className="btn btn--sm" style={{ flex: 1, justifyContent: "center" }}>
          Edit
        </Link>
        {clone.is_listed && (
          <span className="btn btn--sm" style={{ flex: 1, justifyContent: "center", opacity: 0.35, pointerEvents: "none", cursor: "not-allowed" }}>
            Listing ↗
          </span>
        )}
        <button
          onClick={() => setShowDelete(true)}
          className="btn btn--sm"
          style={{ color: "rgba(248,113,113,0.55)", borderColor: "rgba(248,113,113,0.15)", flexShrink: 0 }}
          title="Delete clone"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l.8 9.5A.5.5 0 004.3 14h7.4a.5.5 0 00.5-.5L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {showDelete && (
        <DeleteModal
          clone={clone}
          onCancel={() => setShowDelete(false)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
type FilterTab = "all" | "public" | "private" | "org" | "archived";

export default function ClonesPage() {
  const router = useRouter();
  const [clones, setClones] = useState<CloneRow[]>([]);
  const [limit, setLimit] = useState(2);
  const [tier, setTier]   = useState("free");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  async function goToOnboarding(path = "/onboarding?new=1") {
    const res = await fetch("/api/user/profile").then((r) => r.json()).catch(() => ({ profile_complete: false }));
    if (!res.profile_complete) {
      router.push("/account-setup");
    } else {
      router.push(path);
    }
  }

  useEffect(() => {
    fetch("/api/clones/mine")
      .then((r) => r.json())
      .then((d) => {
        setClones(d.clones ?? []);
        setLimit(d.limit ?? 2);
        setTier(d.tier ?? "free");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = clones.filter((c) => {
    if (filter === "all") return true;
    return getStatus(c) === filter;
  });

  const atLimit = clones.length >= limit;
  const pct = Math.min((clones.length / limit) * 100, 100);

  const TABS: { id: FilterTab; label: string }[] = [
    { id: "all",      label: `All (${clones.length})` },
    { id: "public",   label: `Public (${clones.filter((c) => getStatus(c) === "public").length})` },
    { id: "private",  label: `Private (${clones.filter((c) => getStatus(c) === "private").length})` },
    { id: "org",      label: `Org (${clones.filter((c) => getStatus(c) === "org").length})` },
    { id: "archived", label: `Archived (${clones.filter((c) => getStatus(c) === "archived").length})` },
  ];

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">My Clones</h1>
        </div>
        <button
          onClick={() => goToOnboarding("/onboarding?new=1")}
          disabled={atLimit}
          className="btn btn--primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New clone
        </button>
      </div>

      {/* Plan usage bar */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: 0 }}>
            <span style={{ color: "rgba(255,255,255,0.80)", fontWeight: 500 }}>{clones.length}</span>
            {" "}of {limit} clones
          </p>
          <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 9999, background: "rgba(255,255,255,0.06)", color: PLAN_COLORS[tier] ?? "rgba(255,255,255,0.35)" }}>
            {PLAN_LABELS[tier] ?? tier}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
          <div style={{
            height: "100%", borderRadius: 3, transition: "width 300ms",
            width: `${pct}%`,
            background: atLimit ? "rgba(248,113,113,0.50)" : "rgba(255,255,255,0.25)",
          }} />
        </div>
        {atLimit && (
          <p style={{ fontSize: 12, color: "rgba(248,113,113,0.50)", marginTop: 8, marginBottom: 0 }}>
            Clone limit reached.{" "}
            <Link href="/dashboard/billing" style={{ textDecoration: "underline", textUnderlineOffset: 2, color: "inherit" }}>
              Upgrade plan
            </Link>{" "}
            to create more.
          </p>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex", gap: 4,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: 4, width: "fit-content", marginBottom: 24,
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            style={{
              padding: "8px 18px", borderRadius: 12, border: "none",
              background: filter === t.id ? "rgba(255,255,255,0.08)" : "transparent",
              color: filter === t.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
              fontFamily: "inherit", fontSize: 13, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ height: 208, animation: "pulse 2s infinite" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          {filter === "all" ? (
            <>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginBottom: 16 }}>No clones yet.</p>
              <button onClick={() => goToOnboarding("/onboarding")} className="btn btn--primary">
                Create your first clone
              </button>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>No {filter} clones.</p>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.map((c) => (
            <CloneCard
              key={c.clone_id}
              clone={c}
              onDeleted={() => setClones((prev) => prev.filter((x) => x.clone_id !== c.clone_id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
