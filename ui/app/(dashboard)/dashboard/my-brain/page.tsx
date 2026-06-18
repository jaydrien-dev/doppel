"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = "role" | "background" | "expertise" | "goal" | "preference";

interface Memory {
  id: string;
  content: string;
  category: Category;
  source: string;
  created_at: string;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { value: Category; label: string; description: string }[] = [
  { value: "role",       label: "Role",        description: "Your title, seniority, team" },
  { value: "background", label: "Background",  description: "Experience, career history, context" },
  { value: "expertise",  label: "Expertise",   description: "Domains you know deeply" },
  { value: "goal",       label: "Goals",       description: "What you're trying to achieve" },
  { value: "preference", label: "Preferences", description: "How you like information delivered" },
];

const CAT_COLOR: Record<Category, string> = {
  role:       "rgba(96,165,250,0.70)",
  background: "rgba(167,139,250,0.70)",
  expertise:  "rgba(52,211,153,0.70)",
  goal:       "rgba(251,191,36,0.70)",
  preference: "rgba(251,146,60,0.70)",
};
const CAT_BG: Record<Category, string> = {
  role:       "rgba(96,165,250,0.08)",
  background: "rgba(167,139,250,0.08)",
  expertise:  "rgba(52,211,153,0.08)",
  goal:       "rgba(251,191,36,0.08)",
  preference: "rgba(251,146,60,0.08)",
};
const CAT_BORDER: Record<Category, string> = {
  role:       "rgba(96,165,250,0.18)",
  background: "rgba(167,139,250,0.18)",
  expertise:  "rgba(52,211,153,0.18)",
  goal:       "rgba(251,191,36,0.18)",
  preference: "rgba(251,146,60,0.18)",
};

// ─── Onboarding prompts ───────────────────────────────────────────────────────

const ONBOARDING_PROMPTS: { category: Category; question: string; placeholder: string }[] = [
  {
    category:    "role",
    question:    "What's your role?",
    placeholder: "e.g. Head of Product at a 50-person SaaS startup. Previously an engineer.",
  },
  {
    category:    "background",
    question:    "What's your background?",
    placeholder: "e.g. 8 years in B2B software, started as a consultant, moved into ops.",
  },
  {
    category:    "expertise",
    question:    "What do you know deeply?",
    placeholder: "e.g. Go-to-market strategy, SQL, hiring for early-stage teams, contract negotiation.",
  },
  {
    category:    "goal",
    question:    "What are you working toward right now?",
    placeholder: "e.g. Closing Series A, scaling my team from 5 to 15, launching in APAC.",
  },
  {
    category:    "preference",
    question:    "How do you like information delivered?",
    placeholder: "e.g. Short, direct answers. No bullet points unless I ask. Assume I know the basics.",
  },
];

// ─── Onboarding wizard ────────────────────────────────────────────────────────

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [answers, setAnswers] = useState<string[]>(ONBOARDING_PROMPTS.map(() => ""));
  const [saving, setSaving] = useState(false);
  const [step, setStep]     = useState(0);
  const textareaRef         = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [step]);

  async function finish() {
    const filled = ONBOARDING_PROMPTS
      .map((p, i) => ({ ...p, answer: answers[i].trim() }))
      .filter((x) => x.answer.length > 0);

    if (filled.length === 0) { onComplete(); return; }
    setSaving(true);
    try {
      await Promise.all(
        filled.map((x) =>
          fetch("/api/consumer/brain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: x.answer, category: x.category }),
          })
        )
      );
    } catch { /* best-effort */ }
    setSaving(false);
    onComplete();
  }

  function next() {
    if (step < ONBOARDING_PROMPTS.length - 1) setStep(step + 1);
    else finish();
  }

  const prompt  = ONBOARDING_PROMPTS[step];
  const isLast  = step === ONBOARDING_PROMPTS.length - 1;
  const answer  = answers[step];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 0" }}>
      {/* Progress rail */}
      <div style={{ display: "flex", gap: 5, marginBottom: 40 }}>
        {ONBOARDING_PROMPTS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 999,
              background: i <= step ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.09)",
              transition: "background 300ms",
            }}
          />
        ))}
      </div>

      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: CAT_COLOR[prompt.category], marginBottom: 10 }}>
        {CATEGORIES.find(c => c.value === prompt.category)?.label}
      </p>
      <h2 style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.90)", margin: "0 0 8px", letterSpacing: "-0.015em" }}>
        {prompt.question}
      </h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 24, lineHeight: 1.5 }}>
        This is what your clone uses to calibrate — a CEO gets a different answer than a grad student.
      </p>

      <textarea
        ref={textareaRef}
        value={answer}
        onChange={(e) => {
          const next = [...answers];
          next[step] = e.target.value;
          setAnswers(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) next();
        }}
        placeholder={prompt.placeholder}
        rows={4}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14, padding: "14px 16px",
          fontSize: 14, color: "rgba(255,255,255,0.82)", fontFamily: "inherit",
          outline: "none", resize: "none", lineHeight: 1.65,
          transition: "border-color 150ms",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
        <button
          onClick={next}
          disabled={saving}
          style={{
            padding: "10px 24px", borderRadius: 11, fontSize: 13, fontWeight: 500,
            background: answer.trim() ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: answer.trim() ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
            cursor: "pointer", fontFamily: "inherit", transition: "all 150ms",
          }}
          onMouseEnter={(e) => { if (answer.trim()) e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = answer.trim() ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)"; }}
        >
          {saving ? "Saving…" : isLast ? "Done →" : "Next →"}
        </button>
        <button
          onClick={next}
          style={{
            padding: "10px 16px", borderRadius: 11, fontSize: 13,
            background: "none", border: "none",
            color: "rgba(255,255,255,0.25)", cursor: "pointer", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.50)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
        >
          Skip
        </button>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              marginLeft: "auto", padding: "10px 16px", borderRadius: 11, fontSize: 12,
              background: "none", border: "none",
              color: "rgba(255,255,255,0.22)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", marginTop: 14 }}>
        Cmd+Enter to continue · All fields optional
      </p>
    </div>
  );
}

// ─── Memory card ──────────────────────────────────────────────────────────────

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/consumer/brain/${memory.id}`, { method: "DELETE" });
      onDelete(memory.id);
    } catch {
      setDeleting(false);
    }
  }

  const cat    = memory.category as Category;
  const color  = CAT_COLOR[cat] ?? "rgba(255,255,255,0.50)";
  const bg     = CAT_BG[cat] ?? "rgba(255,255,255,0.04)";
  const border = CAT_BORDER[cat] ?? "rgba(255,255,255,0.09)";

  return (
    <div
      style={{
        display: "flex", gap: 12, alignItems: "flex-start",
        padding: "14px 16px", borderRadius: 13,
        background: bg, border: `1px solid ${border}`,
        transition: "opacity 300ms",
        opacity: deleting ? 0.4 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 999,
            background: bg, border: `1px solid ${border}`,
            color, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {CATEGORIES.find(c => c.value === cat)?.label ?? cat}
          </span>
          {memory.source !== "manual" && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{memory.source}</span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
          {memory.content}
        </p>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        style={{
          flexShrink: 0, background: "none", border: "none",
          color: "rgba(255,255,255,0.20)", cursor: "pointer",
          fontSize: 16, lineHeight: 1, padding: "2px 4px",
          transition: "color 120ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(248,113,113,0.60)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.20)"; }}
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

// ─── Add memory form ──────────────────────────────────────────────────────────

function AddMemoryForm({ onAdded }: { onAdded: (m: Memory) => void }) {
  const [content,  setContent]  = useState("");
  const [category, setCategory] = useState<Category>("background");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/consumer/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, category }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
      const m = await res.json();
      onAdded({ id: m.id, content: trimmed, category, source: "manual", created_at: m.created_at });
      setContent("");
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 14,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.28)", marginBottom: 12 }}>
        Add entry
      </p>

      {/* Category selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {CATEGORIES.map((c) => {
          const active = category === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                background: active ? CAT_BG[c.value] : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? CAT_BORDER[c.value] : "rgba(255,255,255,0.08)"}`,
                color: active ? CAT_COLOR[c.value] : "rgba(255,255,255,0.38)",
                cursor: "pointer", fontFamily: "inherit", transition: "all 130ms",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(); }}
        placeholder={CATEGORIES.find(c => c.value === category)?.description + "…"}
        rows={3}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 11, padding: "11px 13px",
          fontSize: 13, color: "rgba(255,255,255,0.82)", fontFamily: "inherit",
          outline: "none", resize: "none", lineHeight: 1.6,
          transition: "border-color 150ms", marginBottom: 10,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleAdd}
          disabled={!content.trim() || saving}
          style={{
            padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: content.trim() ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: content.trim() ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.25)",
            cursor: content.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Add →"}
        </button>
        {error && <span style={{ fontSize: 12, color: "rgba(248,113,113,0.70)" }}>{error}</span>}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", marginLeft: "auto" }}>Cmd+Enter</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyBrainPage() {
  const { user } = useUser();
  const [memories,  setMemories]  = useState<Memory[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [filter,    setFilter]    = useState<Category | "all">("all");

  useEffect(() => {
    fetch("/api/consumer/brain")
      .then((r) => r.json())
      .then((d) => {
        const list: Memory[] = d.memories ?? [];
        setMemories(list);
        // Show onboarding wizard if they have nothing yet
        if (list.length === 0) setShowOnboarding(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleAdded(m: Memory) {
    setMemories((prev) => [m, ...prev]);
  }

  function handleDeleted(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    setLoading(true);
    fetch("/api/consumer/brain")
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const filtered = filter === "all" ? memories : memories.filter((m) => m.category === filter);

  const grouped = CATEGORIES.reduce<Record<Category, Memory[]>>((acc, c) => {
    acc[c.value] = memories.filter((m) => m.category === c.value);
    return acc;
  }, {} as Record<Category, Memory[]>);

  if (loading) {
    return (
      <div className="db-page">
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.40)", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="db-page">
        <div className="db-page-head">
          <div>
            <p className="db-eyebrow">You</p>
            <h1 className="db-h1">My Brain</h1>
          </div>
        </div>

        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 8 }}>
            Tell your clones who they&apos;re talking to. A CEO gets a different response than a grad intern — this is what makes that work.
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 0 }}>
            This takes 2 minutes. You can edit or delete anything after.
          </p>
        </div>

        <div className="card" style={{ padding: "28px 32px", marginTop: 4 }}>
          <OnboardingWizard onComplete={handleOnboardingComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">You</p>
          <h1 className="db-h1">My Brain</h1>
        </div>
        {memories.length > 0 && (
          <button
            onClick={() => setShowOnboarding(true)}
            style={{
              padding: "8px 18px", borderRadius: 10, fontSize: 13,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.55)", cursor: "pointer", fontFamily: "inherit",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
          >
            Re-run setup
          </button>
        )}
      </div>

      {/* What this does */}
      <div style={{
        padding: "14px 18px", borderRadius: 13,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2, color: "rgba(255,255,255,0.30)" }}>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8 7v5M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <div>
          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>
            Your profile shapes how every clone responds to you
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.55 }}>
            When you chat with any clone, they see your role, background and expertise — so a CEO gets a boardroom-ready answer and a junior dev gets an explanation with code examples.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[{ label: "all", count: memories.length }, ...CATEGORIES.map(c => ({ label: c.label, count: grouped[c.value].length, value: c.value }))].map((s) => {
          const active = filter === (s.label === "all" ? "all" : (s as { value?: Category }).value ?? "all");
          return (
            <button
              key={s.label}
              onClick={() => setFilter(s.label === "all" ? "all" : (s as { value?: Category }).value ?? "all")}
              style={{
                padding: "5px 14px", borderRadius: 999, fontSize: 12,
                background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`,
                color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)",
                cursor: "pointer", fontFamily: "inherit", transition: "all 130ms",
              }}
            >
              {s.label.charAt(0).toUpperCase() + s.label.slice(1)} · {s.count}
            </button>
          );
        })}
      </div>

      {/* Memory list */}
      {filtered.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((m) => (
            <MemoryCard key={m.id} memory={m} onDelete={handleDeleted} />
          ))}
        </div>
      ) : (
        <div style={{
          padding: "32px 20px", textAlign: "center",
          border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 14,
          color: "rgba(255,255,255,0.25)", fontSize: 13,
        }}>
          No {filter === "all" ? "" : filter} entries yet — add one below.
        </div>
      )}

      {/* Add form */}
      <AddMemoryForm onAdded={handleAdded} />
    </div>
  );
}
