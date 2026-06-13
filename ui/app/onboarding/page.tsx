"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useClone } from "@/lib/hooks/useClone";
import { createClone, getGmailAuthUrl, ingestText, updateClone } from "@/lib/api";
import { ChatInterface } from "@/components/chat/ChatInterface";

// ─── Icons ──────────────────────────────────────────────────────────────────

const I = {
  arrow: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  back: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M13 8H3M7 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  gmail: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5h14v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M3 6l7 5 7-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  slack: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="8" width="9" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="8" y="3" width="3" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="9" width="9" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="11" y="8" width="3" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  notion: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4l12-1v14L4 17V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M8 7v6M8 7l4 6V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  github: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 16v-2c0-.5.2-1 .5-1.3-2 0-3.5-1.5-3.5-3.7 0-1 .3-1.7.8-2.3 0-.5-.3-1.3.1-2 0 0 .7-.2 2.3.9.7-.2 1.4-.3 2.2-.3.7 0 1.5.1 2.2.3 1.6-1.1 2.3-.9 2.3-.9.4.7.1 1.5.1 2 .5.6.8 1.3.8 2.3 0 2.2-1.5 3.7-3.5 3.7.3.3.5.8.5 1.3v2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  ),
  upload: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 13v3a1 1 0 001 1h8a1 1 0 001-1v-3M10 4v9M6 8l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  paste: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="5" y="4" width="10" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="7" y="2" width="6" height="3" rx="0.8" stroke="currentColor" strokeWidth="1.4" fill="currentColor"/>
    </svg>
  ),
};

// ─── Decision model metadata ──────────────────────────────────────────────────

const MODEL_META: Record<string, {
  icon: React.ReactNode;
  description: string;
  traits: string[];
  domain_label: string;
}> = {
  aristotle: {
    domain_label: "General purpose",
    description: "Weighs evidence from all angles, seeks the middle path, and recommends action when expected value is clear. Best all-around starting point.",
    traits: ["Balanced risk", "Long-term focus", "Analytical"],
    icon: (
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        {/* Balance scales */}
        <line x1="16" y1="5" x2="16" y2="27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="10" y1="27" x2="22" y2="27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="6" y1="11" x2="26" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="6" y1="11" x2="6" y2="18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        <line x1="26" y1="11" x2="26" y2="18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        <path d="M3 18 Q6 23 9 18" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <path d="M23 18 Q26 23 29 18" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <circle cx="16" cy="5" r="1.2" fill="currentColor"/>
      </svg>
    ),
  },
  marcus: {
    domain_label: "Leadership",
    description: "Duty-first reasoning hardened against loss aversion. Thinks in decades, not quarters. Unmoved by short-term noise or sunk costs.",
    traits: ["10-year horizon", "Loss-immune", "Contrarian"],
    icon: (
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        {/* Roman arch — enduring structure */}
        <line x1="7" y1="27" x2="7" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="25" y1="27" x2="25" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M7 13 Q16 4 25 13" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <line x1="4" y1="27" x2="28" y2="27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="11" y1="27" x2="11" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="21" y1="27" x2="21" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  sun: {
    domain_label: "Strategy",
    description: "Finds asymmetric angles others miss. Decides fast on incomplete information, avoids consensus traps, and adapts as facts emerge.",
    traits: ["High-variance bets", "Acts in fog", "Strongly contrarian"],
    icon: (
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        {/* Abstract eye — strategic sight */}
        <path d="M3 16 Q16 5 29 16 Q16 27 3 16Z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
        <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        <circle cx="16" cy="16" r="1.4" fill="currentColor"/>
        <line x1="16" y1="2" x2="16" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="16" y1="27" x2="16" y2="30" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  benjamin: {
    domain_label: "Finance",
    description: "Patient, evidence-driven, compounding-focused. Requires strong data before committing. Purely forward-looking — past spend is irrelevant.",
    traits: ["Conservative risk", "Exhaustive research", "Forward-looking"],
    icon: (
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        {/* Compound growth curve */}
        <path d="M5 26 C8 26 10 25 13 22 C16 19 18 14 22 9 L27 5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="27" cy="5" r="1.8" fill="currentColor"/>
        <line x1="5" y1="28" x2="28" y2="28" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        <line x1="5" y1="28" x2="5" y2="4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        {/* tick marks */}
        <line x1="12" y1="28" x2="12" y2="26" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        <line x1="19" y1="28" x2="19" y2="26" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        <line x1="5" y1="20" x2="7" y2="20" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        <line x1="5" y1="13" x2="7" y2="13" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
  },
};

// ─── Sources data ────────────────────────────────────────────────────────────

const SOURCES = [
  { id: "gmail",  name: "Gmail",        icon: I.gmail,  color: "#EA4335", desc: "Imports your sent mail. Best signal for tone.",         count: "~4,200 emails",   badge: "Recommended", live: true },
  { id: "slack",  name: "Slack",        icon: I.slack,  color: "#9B59B6", desc: "Threads where you actually decide things.",              count: "~8,400 messages", soon: true },
  { id: "notion", name: "Notion",       icon: I.notion, color: "#A78BFA", desc: "Docs, RFCs, playbooks — your written thinking.",         count: "~620 pages",      soon: true },
  { id: "github", name: "GitHub",       icon: I.github, color: "#34D399", desc: "PR threads and reviews. Best for technical voice.",      count: "~1,300 reviews",  soon: true },
  { id: "upload", name: "Upload files", icon: I.upload, color: "#1A73E8", desc: "Drop PDFs, docs, transcripts.",                          count: "Any format",      live: true },
  { id: "paste",  name: "Paste text",   icon: I.paste,  color: "#FBBF24", desc: "Just paste a doc — fastest way to start.",               count: "Up to 50k words", live: true },
];

// ─── Step progress rail ──────────────────────────────────────────────────────

function StepRail({ current, total }: { current: number; total: number }) {
  return (
    <div className="ob-steps">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`ob-steps__dot ${i < current ? "ob-steps__dot--done" : i === current ? "ob-steps__dot--current" : ""}`}
        />
      ))}
    </div>
  );
}

// ─── Inline clone name editor ────────────────────────────────────────────────

function CloneNameEditor({
  handle,
  initialName,
}: {
  handle: string;
  initialName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) { setEditing(false); setName(initialName); return; }
    setSaving(true);
    try {
      await updateClone(handle, { display_name: trimmed });
    } catch {
      setName(initialName);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") { setEditing(false); setName(name); }
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      {editing ? (
        <>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={save}
            disabled={saving}
            style={{
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8, padding: "4px 10px",
              fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "inherit",
              outline: "none", minWidth: 180,
            }}
          />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
            {saving ? "Saving…" : "Enter to save"}
          </span>
        </>
      ) : (
        <>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Clone name:</span>
          <button
            onClick={startEdit}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 8, padding: "4px 10px",
              fontSize: 13, color: "rgba(255,255,255,0.70)", fontFamily: "inherit",
              cursor: "pointer", transition: "background 160ms, border-color 160ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget.style.background = "rgba(255,255,255,0.09)"); (e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"); }}
            onMouseLeave={(e) => { (e.currentTarget.style.background = "rgba(255,255,255,0.05)"); (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"); }}
          >
            {name}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

// ─── Handle generator ────────────────────────────────────────────────────────

function toHandle(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "my-clone";
}

// ─── Pre-step 1: Name + handle ───────────────────────────────────────────────

function NameStep({
  defaultName,
  onNext,
}: {
  defaultName: string;
  onNext: (name: string, handle: string) => void;
}) {
  const [name, setName]             = useState(defaultName);
  const [handle, setHandle]         = useState(() => toHandle(defaultName));
  const [handleEdited, setHandleEdited] = useState(false);

  function onNameChange(v: string) {
    setName(v);
    if (!handleEdited) setHandle(toHandle(v));
  }

  function onHandleChange(v: string) {
    setHandle(v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32));
    setHandleEdited(true);
  }

  const validHandle = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(handle);

  function handleContinue() {
    if (!name.trim() || !validHandle) return;
    onNext(name.trim(), handle.trim());
  }

  return (
    <>
      <div className="ob-eyebrow"><span className="ob-eyebrow__dot" /> New clone · setup</div>
      <h1 className="ob-h-title">Name your <em>clone.</em></h1>
      <p className="ob-h-sub">This is what your clone calls itself and how it&apos;s identified. You can change both later.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 440, marginTop: 36 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Display name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Elan Brightwater"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12, padding: "12px 14px",
              fontSize: 15, color: "rgba(255,255,255,0.85)", fontFamily: "inherit", outline: "none",
            }}
          />
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
            How your clone refers to itself in conversations.
          </p>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Handle
          </label>
          <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", border: `1px solid ${validHandle ? "rgba(255,255,255,0.12)" : "rgba(248,113,113,0.35)"}`, borderRadius: 12, overflow: "hidden" }}>
            <span style={{ padding: "12px 10px 12px 14px", fontSize: 15, color: "rgba(255,255,255,0.30)", userSelect: "none" }}>@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => onHandleChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
              style={{
                flex: 1, background: "transparent", border: "none",
                padding: "12px 14px 12px 0",
                fontSize: 15, color: "rgba(255,255,255,0.85)", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
            Your public URL: /c/{handle || "…"}
          </p>
        </div>

        <button
          className="ob-btn ob-btn--primary ob-btn--lg"
          onClick={handleContinue}
          disabled={!name.trim() || !validHandle}
          style={{ marginTop: 8 }}
        >
          Continue {I.arrow}
        </button>
      </div>
    </>
  );
}

// ─── Pre-step 2: Decision model ───────────────────────────────────────────────

function DecisionModelStep({
  name,
  handle,
  onCreated,
  onBack,
}: {
  name: string;
  handle: string;
  onCreated: (clone: { clone_id: string; handle: string; display_name: string }) => void;
  onBack: () => void;
}) {
  const [selected, setSelected]   = useState<string>("aristotle");
  const [templates, setTemplates] = useState<{ slug: string; name: string; tagline: string; domain: string }[]>([]);
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch("/fastapi/clone-templates")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.templates?.length) setTemplates(d.templates);
        else {
          // fallback: show all known models
          setTemplates([
            { slug: "aristotle", name: "Aristotle", tagline: "", domain: "general" },
            { slug: "marcus",    name: "Marcus",    tagline: "", domain: "leadership" },
            { slug: "sun",       name: "Sun",       tagline: "", domain: "strategy" },
            { slug: "benjamin",  name: "Benjamin",  tagline: "", domain: "finance" },
          ]);
        }
      })
      .catch(() => {
        setTemplates([
          { slug: "aristotle", name: "Aristotle", tagline: "", domain: "general" },
          { slug: "marcus",    name: "Marcus",    tagline: "", domain: "leadership" },
          { slug: "sun",       name: "Sun",       tagline: "", domain: "strategy" },
          { slug: "benjamin",  name: "Benjamin",  tagline: "", domain: "finance" },
        ]);
      });
  }, []);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createClone({ handle, display_name: name, template_slug: selected || undefined });
      onCreated({ ...result, display_name: name });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409") || msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("already")) {
        setError("That handle is already taken. Go back and choose a different one.");
      } else {
        setError("Failed to create clone. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="ob-eyebrow"><span className="ob-eyebrow__dot" /> New clone · decision model</div>
      <h1 className="ob-h-title">Pick a <em>decision model.</em></h1>
      <p className="ob-h-sub">
        Shapes how your clone reasons through trade-offs and recommends action.
        Doesn&apos;t affect voice, style, or knowledge.
      </p>

      {/* Model cards — 2×2 grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 10,
        maxWidth: 580,
        marginTop: 32,
      }}>
        <style>{`
          @media (max-width: 500px) {
            .dm-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
        {templates.map(t => {
          const meta = MODEL_META[t.slug];
          const isSelected = selected === t.slug;
          const isHovered  = hoveredSlug === t.slug && !isSelected;

          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => setSelected(t.slug)}
              onMouseEnter={() => setHoveredSlug(t.slug)}
              onMouseLeave={() => setHoveredSlug(null)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "20px 18px",
                borderRadius: 16,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                background: isSelected
                  ? "rgba(255,255,255,0.08)"
                  : isHovered
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(255,255,255,0.03)",
                border: `1px solid ${
                  isSelected
                    ? "rgba(255,255,255,0.22)"
                    : isHovered
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.07)"
                }`,
                boxShadow: isSelected ? "0 0 0 1px rgba(255,255,255,0.06) inset" : "none",
                transition: "background 160ms, border-color 160ms, box-shadow 160ms",
                position: "relative",
              }}
            >
              {/* Selection indicator dot */}
              <div style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `1.5px solid ${isSelected ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.14)"}`,
                background: isSelected ? "rgba(255,255,255,0.85)" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 160ms",
                flexShrink: 0,
              }}>
                {isSelected && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4l1.8 1.8L6.5 2.2" stroke="#080808" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              {/* Icon container */}
              <div style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: isSelected ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isSelected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isSelected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)",
                transition: "all 160ms",
                flexShrink: 0,
              }}>
                {meta?.icon}
              </div>

              {/* Name + domain */}
              <div>
                <p style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: isSelected ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.60)",
                  margin: "0 0 4px",
                  transition: "color 160ms",
                }}>
                  {t.name}
                </p>
                <p style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                  color: isSelected ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.22)",
                  margin: 0,
                  transition: "color 160ms",
                }}>
                  {meta?.domain_label || t.domain}
                </p>
              </div>

              {/* Description */}
              <p style={{
                fontSize: 12,
                color: isSelected ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.28)",
                margin: 0,
                lineHeight: 1.65,
                flexGrow: 1,
                transition: "color 160ms",
              }}>
                {meta?.description || t.tagline}
              </p>

              {/* Trait pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(meta?.traits || []).map(trait => (
                  <span
                    key={trait}
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 99,
                      background: isSelected ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isSelected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"}`,
                      color: isSelected ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.28)",
                      transition: "all 160ms",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {trait}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Description callout */}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginTop: 12, maxWidth: 580 }}>
        You can switch models later from your clone&apos;s settings.
      </p>

      {error && (
        <p style={{ fontSize: 12, color: "rgba(248,113,113,0.80)", padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", maxWidth: 580, marginTop: 8 }}>
          {error}
        </p>
      )}

      <div className="ob-foot-row" style={{ marginTop: 20 }}>
        <button
          className="ob-btn ob-btn--primary ob-btn--lg"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? "Creating…" : <>Create clone {I.arrow}</>}
        </button>
        <button className="ob-btn ob-btn--ghost" onClick={onBack}>
          {I.back} Back
        </button>
      </div>
    </>
  );
}

// ─── Step 0: Source picker ───────────────────────────────────────────────────

function SourceStep({
  cloneId,
  cloneHandle,
  cloneDisplayName,
  gmailConnected,
  onContinue,
  userName,
}: {
  cloneId: string;
  cloneHandle: string;
  cloneDisplayName: string;
  gmailConnected: boolean;
  onContinue: () => void;
  userName: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const first = userName.split(" ")[0] || "you";

  useEffect(() => {
    if (gmailConnected) {
      const t = setTimeout(onContinue, 900);
      return () => clearTimeout(t);
    }
  }, [gmailConnected, onContinue]);

  async function handleGmail() {
    setLoading("gmail");
    try {
      const url = await getGmailAuthUrl(cloneId, "/onboarding?gmail_connected=1");
      window.location.href = url;
    } catch {
      setLoading(null);
    }
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) { onContinue(); return; }
    setSaving(true);
    try {
      await ingestText({ clone_id: cloneId, text: pasteText, source: "paste", is_pinned: false });
    } catch {
      // best-effort
    } finally {
      setSaving(false);
      onContinue();
    }
  }

  function handleSource(src: typeof SOURCES[0]) {
    if (src.id === "gmail") { handleGmail(); return; }
    if (src.id === "paste") { setPasteMode(true); return; }
    if (src.id === "upload") { onContinue(); return; }
    onContinue();
  }

  if (gmailConnected) {
    return (
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full mb-5 flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.22)" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10l4.5 4.5L16 6" stroke="#34D399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 className="ob-h-title" style={{ fontSize: 22 }}>Gmail connected</h2>
        <p className="ob-h-sub">Your emails are being imported. Moving on…</p>
      </div>
    );
  }

  if (pasteMode) {
    return (
      <>
        <div className="ob-eyebrow"><span className="ob-eyebrow__dot" style={{ background: "#FBBF24", boxShadow: "0 0 0 4px rgba(251,191,36,0.20)" }} /> Step 1 of 4 · paste text</div>
        <h1 className="ob-h-title">Paste anything your <em>clone should know.</em></h1>
        <p className="ob-h-sub">Docs, emails, meeting notes — whatever captures how you think and write.</p>
        <div className="ob-paste-card">
          <textarea
            autoFocus
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your text here…"
          />
          <div className="ob-foot-row">
            <button
              className="ob-btn ob-btn--primary ob-btn--lg"
              onClick={handlePasteSubmit}
              disabled={saving}
            >
              {saving ? "Saving…" : <>Ingest & continue {I.arrow}</>}
            </button>
            <button className="ob-btn ob-btn--ghost" onClick={onContinue}>Skip</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ob-eyebrow"><span className="ob-eyebrow__dot" /> Step 1 of 4 · 10 seconds</div>
      <CloneNameEditor handle={cloneHandle} initialName={cloneDisplayName} />
      <h1 className="ob-h-title">Welcome, {first}. Let&apos;s <em>feed your clone.</em></h1>
      <p className="ob-h-sub">Pick a source. Your clone starts learning right now — you&apos;ll see it work in the next step.</p>

      <div className="ob-sources">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            className={`ob-source${s.soon ? " ob-source--disabled" : ""}`}
            style={{ ["--src-c" as string]: s.color }}
            onClick={() => !s.soon && handleSource(s)}
            disabled={loading === s.id}
          >
            <div className="ob-source__head">
              <span className="ob-source__icon">{s.icon}</span>
              <span className="ob-source__name">
                {loading === s.id ? "Connecting…" : s.name}
              </span>
              {s.badge && <span className="ob-source__badge">{s.badge}</span>}
              {s.soon && <span className="ob-source__badge--soon">Soon</span>}
            </div>
            <div className="ob-source__desc">{s.desc}</div>
            <div className="ob-source__count">
              <span className="ob-source__count__dot" />
              {s.count}
            </div>
          </button>
        ))}
      </div>

      <div className="ob-source-alt">
        <span className="ob-source-alt__line" />
        <button className="ob-source-alt__btn" onClick={onContinue}>Skip — explore the app instead</button>
        <span className="ob-source-alt__line" />
      </div>
    </>
  );
}

// ─── Step 1: Seed Q&A ────────────────────────────────────────────────────────

const SEED_QUESTIONS = [
  "What do you work on and what's your role?",
  "How do you make hard decisions?",
  "What do you believe that most people don't?",
  "What are your top 3 priorities right now?",
  "How would a close colleague describe your communication style?",
];

function QAStep({
  cloneId,
  onContinue,
}: {
  cloneId: string;
  onContinue: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(SEED_QUESTIONS.map(() => ""));
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    const filled = SEED_QUESTIONS.map((q, i) => ({ q, a: answers[i] })).filter(({ a }) => a.trim().length > 0);
    if (filled.length === 0) { onContinue(); return; }
    setSaving(true);
    try {
      const text = filled.map(({ q, a }) => `Q: ${q}\nA: ${a}`).join("\n\n");
      await ingestText({ clone_id: cloneId, text, source: "qa_seed", is_pinned: true });
    } catch {
      // best-effort
    } finally {
      setSaving(false);
      onContinue();
    }
  }

  return (
    <>
      <div className="ob-eyebrow"><span className="ob-eyebrow__dot" /> Step 2 of 4 · anchor questions</div>
      <h1 className="ob-h-title">Tell your clone <em>about you.</em></h1>
      <p className="ob-h-sub">Answer a few questions to anchor your clone&apos;s identity. Skip any you&apos;d rather not answer.</p>

      <div className="flex flex-col gap-3 mt-9 max-w-xl">
        {SEED_QUESTIONS.map((q, i) => (
          <div key={i} className="glass rounded-2xl px-5 py-4">
            <p className="text-xs text-white/40 mb-2">{q}</p>
            <textarea
              value={answers[i]}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value;
                setAnswers(next);
              }}
              placeholder="Your answer…"
              rows={2}
              className="w-full bg-transparent resize-none text-sm text-white/80 placeholder:text-white/20 outline-none leading-relaxed"
            />
          </div>
        ))}
      </div>

      <div className="ob-foot-row">
        <button className="ob-btn ob-btn--primary ob-btn--lg" onClick={handleContinue} disabled={saving}>
          {saving ? "Saving…" : <>Continue {I.arrow}</>}
        </button>
        <button className="ob-btn ob-btn--ghost" onClick={onContinue}>Skip</button>
      </div>
    </>
  );
}

// ─── Step 2: Test your clone ─────────────────────────────────────────────────

function TestStep({
  cloneId,
  cloneName,
  onContinue,
}: {
  cloneId: string;
  cloneName: string;
  onContinue: () => void;
}) {
  const [hasMessaged, setHasMessaged] = useState(false);

  return (
    <>
      <div className="ob-eyebrow"><span className="ob-eyebrow__dot" /> Step 3 of 4 · the moment</div>
      <h1 className="ob-h-title">Say hello to <em>yourself.</em></h1>
      <p className="ob-h-sub">Ask your clone anything — see how it responds.</p>

      <div className="glass rounded-2xl overflow-hidden mt-8" style={{ height: 360, maxWidth: 520 }}>
        <ChatInterface
          cloneId={cloneId}
          cloneName={cloneName}
          contextType="chat"
          ownerMode={false}
          onFirstMessage={() => setHasMessaged(true)}
        />
      </div>

      <div className="ob-foot-row">
        <button className="ob-btn ob-btn--primary ob-btn--lg" onClick={onContinue}>
          {hasMessaged ? <>Continue {I.arrow}</> : "Continue →"}
        </button>
        <button className="ob-btn ob-btn--ghost" onClick={onContinue}>Skip</button>
        {hasMessaged && (
          <span className="ob-foot-row__hint" style={{ color: "#34D399" }}>Nice. Your clone works.</span>
        )}
      </div>
    </>
  );
}

// ─── Step 3: Share ───────────────────────────────────────────────────────────

function ShareStep({
  clone,
  onComplete,
}: {
  clone: { clone_id: string; handle: string; display_name: string };
  onComplete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = `${appUrl}/c/${clone.handle}`;
  const first = clone.display_name.split(" ")[0] || clone.handle;

  const dots = [
    { color: "#1A73E8", delay: 0,   dur: 6 },
    { color: "#A78BFA", delay: 0.4, dur: 7 },
    { color: "#E91E63", delay: 0.8, dur: 8 },
    { color: "#34D399", delay: 1.2, dur: 6 },
    { color: "#FBBF24", delay: 1.6, dur: 7 },
    { color: "#00838F", delay: 2.0, dur: 9 },
  ];

  async function handlePublish() {
    setPublishing(true);
    try {
      await updateClone(clone.handle, { access_mode: "public" });
      setPublished(true);
    } catch {
      setPublished(true);
    } finally {
      setPublishing(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="ob-eyebrow"><span className="ob-eyebrow__dot" /> Step 4 of 4 · share</div>
      <h1 className="ob-h-title">Your clone is <em>live.</em></h1>
      <p className="ob-h-sub">Share the link with anyone — they can ask it questions without an account.</p>

      <div className="mt-8" style={{ display: "grid", gap: 22, gridTemplateColumns: "1fr", maxWidth: 760 }}>
        <style>{`
          @media (min-width: 700px) {
            .ob-share-grid { grid-template-columns: 1.05fr 1fr !important; align-items: center !important; }
          }
        `}</style>
        <div className="ob-share-grid" style={{ display: "grid", gap: 22 }}>
          {/* Preview card */}
          <div style={{ position: "relative", perspective: "1200px", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 320 }}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {dots.map((d, i) => (
                <span key={i} style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: 8, height: 8, borderRadius: "999px",
                  background: d.color,
                  boxShadow: `0 0 14px ${d.color}`,
                  marginLeft: -4, marginTop: -4,
                  animation: `orbit ${d.dur}s linear infinite`,
                  animationDelay: `${d.delay}s`,
                  transform: `rotate(${i * 60}deg) translateX(${140 + (i % 3) * 24}px)`,
                }} />
              ))}
            </div>
            <div style={{
              width: "100%", maxWidth: 320,
              background: "linear-gradient(135deg, #1A73E8 0%, #0a0a2a 100%)",
              borderRadius: 22, padding: 24,
              boxShadow: "0 30px 80px rgba(26,115,232,0.30), 0 0 0 1px rgba(255,255,255,0.08) inset",
              overflow: "hidden", position: "relative",
              transform: "rotateY(-6deg) rotateX(3deg)",
              transition: "transform 420ms cubic-bezier(0.25,0.46,0.45,0.94)",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 85% 10%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(circle at 10% 90%, rgba(0,0,0,0.18) 0%, transparent 50%)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: 20, right: 20, display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", fontSize: 10, color: "#fff", fontWeight: 500, zIndex: 1 }}>
                <span style={{ width: 5, height: 5, borderRadius: "999px", background: "#34D399", animation: "pulse-glow 1.6s ease-in-out infinite" }} />
                Live
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.70)", marginBottom: 20, position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.20)", position: "relative", flexShrink: 0 }} />
                doppel
              </div>
              <div style={{ width: 60, height: 60, borderRadius: 16, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 500, color: "rgba(255,255,255,0.90)", marginBottom: 16, position: "relative", zIndex: 1 }}>
                {first[0].toUpperCase()}
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.15, letterSpacing: "-0.02em", color: "#fff", margin: "0 0 4px", position: "relative", zIndex: 1 }}>
                {first}&apos;s clone
              </h3>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", marginBottom: 16, position: "relative", zIndex: 1 }}>
                @{clone.handle}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", fontSize: 11, color: "rgba(255,255,255,0.70)", position: "relative", zIndex: 1 }}>
                <span><strong style={{ color: "#fff", fontWeight: 500 }}>Active</strong> · now</span>
                <span style={{ marginLeft: "auto" }}>Ask anything →</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginRight: 4 }}>URL</span>
              <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{publicUrl}</span>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? "#34D399" : "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, padding: "5px 12px",
                  fontSize: 11, fontWeight: 500,
                  color: copied ? "#08120D" : "rgba(255,255,255,0.80)",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "background 180ms, color 180ms",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={tcAccepted}
                  onChange={(e) => setTcAccepted(e.target.checked)}
                  style={{ marginTop: 2, accentColor: "#1A73E8", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.80)" }}>I agree to the terms</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, lineHeight: 1.45 }}>
                    Standard{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "underline", textUnderlineOffset: 2 }}>ToS</a>
                    {" "}and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy</a>
                    . Your data stays yours.
                  </div>
                </div>
              </label>
            </div>

            <div className="ob-foot-row" style={{ marginTop: 8 }}>
              {published ? (
                <button
                  className="ob-btn ob-btn--primary ob-btn--lg"
                  onClick={onComplete}
                  disabled={!tcAccepted}
                >
                  Go to Dashboard {I.arrow}
                </button>
              ) : (
                <button
                  className="ob-btn ob-btn--primary ob-btn--lg"
                  onClick={handlePublish}
                  disabled={publishing || !tcAccepted}
                >
                  {publishing ? "Publishing…" : <>Make public & finish {I.arrow}</>}
                </button>
              )}
              <button className="ob-btn ob-btn--ghost" onClick={onComplete}>Skip to dashboard</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

type ActiveClone = { clone_id: string; handle: string; display_name: string };
type PreStage = "name" | "model";

function OnboardingWizard() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useUser();
  const { clone: primaryClone, isLoading } = useClone();

  const isNewClone    = searchParams.get("new") === "1";
  const gmailConnected = searchParams.get("gmail_connected") === "1";

  const [activeClone, setActiveClone] = useState<ActiveClone | null | false>(null);
  const [preStage, setPreStage]       = useState<PreStage>("name");
  const [draft, setDraft]             = useState<{ name: string; handle: string } | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (isNewClone) {
      setActiveClone(false);
    } else if (primaryClone) {
      setActiveClone({
        clone_id:     primaryClone.clone_id,
        handle:       primaryClone.handle,
        display_name: primaryClone.display_name,
      });
    } else {
      setActiveClone(false);
    }
  }, [isLoading, primaryClone, isNewClone]);

  const [step, setStep] = useState(gmailConnected ? 1 : 0);

  function markComplete() {
    if (user?.id) {
      localStorage.setItem(`doppel_onboarded_${user.id}`, "1");
    }
    router.push("/dashboard/clones");
  }

  if (isLoading || activeClone === null) {
    return (
      <div className="flex items-center justify-center h-full flex-1">
        <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  const userName   = user?.fullName ?? user?.firstName ?? (activeClone ? activeClone.display_name : "you");
  const defaultName = user?.fullName ?? user?.firstName ?? "";

  return (
    <>
      <div className="ob-bg" />
      <div className="ob-bg__dots" />

      <header style={{ position: "relative", zIndex: 10, padding: "18px 24px", display: "flex", alignItems: "center", gap: 16, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.025em", color: "rgba(255,255,255,0.85)" }}>doppel</span>
        {activeClone !== false && <StepRail current={step} total={4} />}
        <button
          onClick={markComplete}
          style={{ marginLeft: "auto", background: "transparent", border: "none", fontSize: 12, color: "rgba(255,255,255,0.30)", cursor: "pointer", padding: "6px 12px", borderRadius: 8, fontFamily: "inherit", transition: "background 180ms, color 180ms" }}
          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.target as HTMLButtonElement).style.color = "rgba(255,255,255,0.70)"; }}
          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = "transparent"; (e.target as HTMLButtonElement).style.color = "rgba(255,255,255,0.30)"; }}
        >
          Skip setup
        </button>
      </header>

      <main style={{ flex: 1, position: "relative", zIndex: 1 }}>
        <div className="ob-stage">

          {/* Pre-clone: name */}
          {activeClone === false && preStage === "name" && (
            <NameStep
              defaultName={defaultName}
              onNext={(name, handle) => {
                setDraft({ name, handle });
                setPreStage("model");
              }}
            />
          )}

          {/* Pre-clone: decision model + creation */}
          {activeClone === false && preStage === "model" && draft && (
            <DecisionModelStep
              name={draft.name}
              handle={draft.handle}
              onCreated={(clone) => {
                setActiveClone(clone);
                setStep(0);
              }}
              onBack={() => setPreStage("name")}
            />
          )}

          {activeClone !== false && step === 0 && (
            <SourceStep
              cloneId={activeClone.clone_id}
              cloneHandle={activeClone.handle}
              cloneDisplayName={activeClone.display_name}
              gmailConnected={gmailConnected}
              onContinue={() => setStep(1)}
              userName={userName}
            />
          )}
          {activeClone !== false && step === 1 && (
            <QAStep cloneId={activeClone.clone_id} onContinue={() => setStep(2)} />
          )}
          {activeClone !== false && step === 2 && (
            <TestStep
              cloneId={activeClone.clone_id}
              cloneName={activeClone.display_name}
              onContinue={() => setStep(3)}
            />
          )}
          {activeClone !== false && step === 3 && (
            <ShareStep clone={activeClone} onComplete={markComplete} />
          )}
        </div>
      </main>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}
