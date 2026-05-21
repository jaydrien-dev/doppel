"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StyleFingerprint {
  avg_sentence_length?: number;
  preferred_formality?: number;
  directness?: number;
  warmth?: number;
  humor_frequency?: number;
  uses_bullet_points?: boolean;
  uses_emojis?: boolean;
  uses_contractions?: boolean;
  signature_phrases?: string[];
  response_length_preference?: string;
  vocabulary_richness?: number;
}

interface ValueSystem {
  core_values?: string[];
  professional_priorities?: string[];
  risk_tolerance?: string;
  conflict_style?: string;
  persona_boundaries?: string[];
}

interface EpistemicProfile {
  reasoning_frameworks?: string[];
  confidence_style?: string;
  decision_approach?: string;
  knowledge_domains?: string[];
  preferred_evidence_types?: string[];
}

interface IdentityData {
  clone_id: string;
  style_fingerprint: StyleFingerprint;
  value_system: ValueSystem;
  epistemic_profile: EpistemicProfile;
}

// ---------------------------------------------------------------------------
// Design helpers
// ---------------------------------------------------------------------------

const ACCENT = {
  voice:    { color: "#60A5FA", bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.20)"  },
  thinking: { color: "#FBBF24", bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.20)"  },
  values:   { color: "#34D399", bg: "rgba(52,211,153,0.10)",  border: "rgba(52,211,153,0.20)"  },
};

function SectionIcon({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: bg, color }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spectrum slider
// ---------------------------------------------------------------------------

function SpectrumSlider({
  value, label, leftLabel, rightLabel, color, onChange,
}: {
  value: number | undefined;
  label: string;
  leftLabel: string;
  rightLabel: string;
  color: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.round((value ?? 0.5) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", fontVariantNumeric: "tabular-nums" }}>
          {pct < 30 ? leftLabel : pct > 70 ? rightLabel : "Balanced"}
        </span>
      </div>
      <div style={{ position: "relative", height: 6 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: color, opacity: 0.7, transition: "width 120ms" }} />
        <input
          type="range" min={0} max={100} value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%", margin: 0 }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>{leftLabel}</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>{rightLabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle tile
// ---------------------------------------------------------------------------

function ToggleTile({
  checked, label, icon, onChange,
}: {
  checked: boolean;
  label: string;
  icon: React.ReactNode;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderRadius: 14,
        border: `1px solid ${checked ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.07)"}`,
        background: checked ? "rgba(96,165,250,0.08)" : "rgba(255,255,255,0.03)",
        cursor: "pointer", textAlign: "left", width: "100%",
        transition: "all 180ms",
      }}
    >
      <span style={{ color: checked ? "rgba(96,165,250,0.80)" : "rgba(255,255,255,0.25)", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: checked ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.40)" }}>{label}</span>
      <span style={{
        width: 32, height: 18, borderRadius: 999, flexShrink: 0,
        background: checked ? "rgba(96,165,250,0.60)" : "rgba(255,255,255,0.10)",
        position: "relative", transition: "background 180ms",
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 14 : 2, width: 14, height: 14,
          borderRadius: "50%", background: "#fff", opacity: checked ? 1 : 0.5,
          transition: "left 180ms",
        }} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chip group (click to toggle)
// ---------------------------------------------------------------------------

function ChipGroup({
  all, selected, accentColor, onToggle,
}: {
  all: string[];
  selected: string[];
  accentColor: string;
  onToggle: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {all.map((item) => {
        const on = selected.includes(item);
        return (
          <button
            key={item}
            onClick={() => onToggle(item)}
            style={{
              padding: "6px 14px", borderRadius: 999, fontSize: 12, cursor: "pointer",
              border: `1px solid ${on ? `color-mix(in srgb, ${accentColor} 40%, transparent)` : "rgba(255,255,255,0.08)"}`,
              background: on ? `color-mix(in srgb, ${accentColor} 12%, transparent)` : "rgba(255,255,255,0.03)",
              color: on ? accentColor : "rgba(255,255,255,0.40)",
              transition: "all 180ms",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            {on && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {item}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free-tag input
// ---------------------------------------------------------------------------

function TagInput({
  items, placeholder, accentColor, onAdd, onRemove,
}: {
  items: string[];
  placeholder: string;
  accentColor: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (v && !items.includes(v)) { onAdd(v); setDraft(""); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <span key={item} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, padding: "5px 10px", borderRadius: 999,
            border: `1px solid color-mix(in srgb, ${accentColor} 25%, transparent)`,
            background: `color-mix(in srgb, ${accentColor} 8%, transparent)`,
            color: accentColor,
          }}>
            {item}
            <button onClick={() => onRemove(item)} style={{ background: "none", border: "none", color: "currentColor", opacity: 0.5, cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 11 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          className="input"
          style={{ flex: 1, fontSize: 12 }}
        />
        <button onClick={commit} disabled={!draft.trim()} className="btn btn--sm">Add</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual radio cards (confidence / decision style)
// ---------------------------------------------------------------------------

function RadioCards({
  options, value, accentColor, onChange,
}: {
  options: { value: string; label: string; desc: string }[];
  value: string;
  accentColor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <div
            key={o.value}
            onClick={() => onChange(on ? "" : o.value)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${on ? `color-mix(in srgb, ${accentColor} 35%, transparent)` : "rgba(255,255,255,0.06)"}`,
              background: on ? `color-mix(in srgb, ${accentColor} 09%, transparent)` : "rgba(255,255,255,0.02)",
              transition: "all 180ms",
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
              border: `1.5px solid ${on ? accentColor : "rgba(255,255,255,0.20)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {on && <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor }} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: on ? 500 : 400, color: on ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.45)" }}>{o.label}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{o.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk scale
// ---------------------------------------------------------------------------

const RISK_LEVELS = [
  { value: "Very conservative", label: "Safe",     desc: "Stick to what's proven" },
  { value: "Conservative",      label: "Careful",  desc: "Low risk preferred" },
  { value: "Moderate",          label: "Balanced", desc: "Calculated bets" },
  { value: "Calculated risk-taker", label: "Bold", desc: "Upside-focused" },
  { value: "Aggressive",        label: "High-risk", desc: "Go big or nothing" },
];

function RiskScale({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const idx = RISK_LEVELS.findIndex((r) => r.value === value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {RISK_LEVELS.map((r, i) => {
          const on = value === r.value;
          const past = idx >= 0 && i <= idx;
          return (
            <div
              key={r.value}
              onClick={() => onChange(on ? "" : r.value)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                cursor: "pointer",
              }}
            >
              <div style={{
                width: "100%", height: 6, borderRadius: 999,
                background: past ? `rgba(52,211,153,${0.30 + i * 0.14})` : "rgba(255,255,255,0.06)",
                transition: "background 200ms",
                outline: on ? "2px solid rgba(52,211,153,0.50)" : "none",
                outlineOffset: 2,
              }} />
              <span style={{ fontSize: 10, color: on ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.25)", textAlign: "center", fontWeight: on ? 500 : 400 }}>{r.label}</span>
            </div>
          );
        })}
      </div>
      {idx >= 0 && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{RISK_LEVELS[idx].desc}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save bar (floating, appears when dirty)
// ---------------------------------------------------------------------------

function SaveBar({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  if (!dirty) return null;
  return (
    <div style={{
      position: "sticky", bottom: 24, zIndex: 20,
      display: "flex", justifyContent: "flex-end",
      pointerEvents: "none",
    }}>
      <button
        onClick={onSave}
        disabled={saving}
        className="btn btn--primary"
        style={{ pointerEvents: "all", boxShadow: "0 8px 24px rgba(0,0,0,0.40)" }}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice tab
// ---------------------------------------------------------------------------

function VoiceTab({ data, onSave }: { data: StyleFingerprint; onSave: (d: Partial<StyleFingerprint>) => Promise<void> }) {
  const [local, setLocal] = useState<StyleFingerprint>(data);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const c = ACCENT.voice;

  function set(patch: Partial<StyleFingerprint>) {
    setLocal((p) => ({ ...p, ...patch }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setDirty(false);
  }

  const isEmpty = !Object.values(data).some((v) => v !== undefined && v !== null);

  if (isEmpty) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: c.color }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 3a8 8 0 100 16A8 8 0 0011 3z" stroke="currentColor" strokeWidth="1.4"/><path d="M8 10s.5 2 3 2 3-2 3-2M8.5 8h.01M13.5 8h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </div>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Voice not computed yet</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginBottom: 20, lineHeight: 1.6 }}>
          Connect Gmail and ingest emails, then run Extract Style from the Train page.
        </p>
        <Link href="/dashboard/train" className="btn btn--sm">Go to Train →</Link>
      </div>
    );
  }

  const sliders: { key: keyof StyleFingerprint; label: string; left: string; right: string }[] = [
    { key: "preferred_formality", label: "Formality",   left: "Casual",   right: "Formal"   },
    { key: "directness",          label: "Directness",  left: "Diplomatic", right: "Blunt"  },
    { key: "warmth",              label: "Warmth",      left: "Cool",     right: "Warm"     },
    { key: "humor_frequency",     label: "Humor",       left: "Serious",  right: "Playful"  },
    { key: "vocabulary_richness", label: "Vocabulary",  left: "Simple",   right: "Rich"     },
  ];

  const LENGTH_OPTIONS = [
    { value: "brief",    label: "Brief",    desc: "Short, punchy answers" },
    { value: "medium",   label: "Medium",   desc: "Enough context, no fluff" },
    { value: "detailed", label: "Detailed", desc: "Comprehensive, thorough" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Tone sliders + toggles row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* Sliders */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9h12M3 5h8M3 13h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Tone</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>How your clone sounds by default</p>
            </div>
          </div>
          {sliders.map(({ key, label, left, right }) =>
            typeof local[key] === "number" ? (
              <SpectrumSlider
                key={key}
                value={local[key] as number}
                label={label}
                leftLabel={left}
                rightLabel={right}
                color={c.color}
                onChange={(v) => set({ [key]: v })}
              />
            ) : null
          )}
        </div>

        {/* Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <SectionIcon color={c.color} bg={c.bg}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </SectionIcon>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Style traits</p>
            </div>
            <ToggleTile
              checked={!!local.uses_bullet_points}
              label="Uses bullet points"
              icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="5" r="1.5" fill="currentColor"/><path d="M7 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="3" cy="9" r="1.5" fill="currentColor"/><path d="M7 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="3" cy="13" r="1.5" fill="currentColor"/><path d="M7 13h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
              onChange={(v) => set({ uses_bullet_points: v })}
            />
            <ToggleTile
              checked={!!local.uses_contractions}
              label="Uses contractions (I'm, it's…)"
              icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8h4M9 8h4M8 3v4M8 9v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
              onChange={(v) => set({ uses_contractions: v })}
            />
            <ToggleTile
              checked={!!local.uses_emojis}
              label="Uses emojis"
              icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 10s.7 1.5 2.5 1.5 2.5-1.5 2.5-1.5M6 6.5h.01M10 6.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
              onChange={(v) => set({ uses_emojis: v })}
            />
          </div>

          {/* Response length */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <SectionIcon color={c.color} bg={c.bg}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 9h8M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              </SectionIcon>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Response length</p>
            </div>
            <RadioCards
              options={LENGTH_OPTIONS}
              value={local.response_length_preference ?? ""}
              accentColor={c.color}
              onChange={(v) => set({ response_length_preference: v })}
            />
          </div>
        </div>
      </div>

      {/* Signature phrases */}
      {(local.signature_phrases?.length || true) && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 5h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 2V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Signature phrases</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Phrases your clone uses naturally</p>
            </div>
          </div>
          <TagInput
            items={local.signature_phrases ?? []}
            placeholder="Add a phrase you often say…"
            accentColor={c.color}
            onAdd={(v) => set({ signature_phrases: [...(local.signature_phrases ?? []), v] })}
            onRemove={(v) => set({ signature_phrases: (local.signature_phrases ?? []).filter((x) => x !== v) })}
          />
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thinking tab
// ---------------------------------------------------------------------------

const FRAMEWORK_OPTIONS = [
  "First principles", "Systems thinking", "Inductive reasoning", "Deductive reasoning",
  "Thinking by analogy", "Pre-mortem analysis", "Impact/Effort scoring",
  "Jobs-to-be-done", "Reversibility thinking", "Probabilistic reasoning",
];

const CONFIDENCE_OPTIONS = [
  { value: "High confidence, decisive",      label: "Decisive",         desc: "I state positions clearly and own them" },
  { value: "Calibrated uncertainty",          label: "Calibrated",       desc: "I quantify uncertainty when I have it" },
  { value: "Conservative, hedge often",       label: "Hedged",           desc: "I prefer caveats over false confidence" },
  { value: "Context-dependent",               label: "Context-dependent", desc: "Depends on how much I know" },
  { value: "Collaborative, verify with others", label: "Collaborative",  desc: "I check with others before committing" },
];

const DECISION_OPTIONS = [
  { value: "Data-driven, then gut check",  label: "Data-first",    desc: "Numbers lead, instinct validates" },
  { value: "Intuition-led, then data",     label: "Intuition-first", desc: "Gut feeling, then I verify" },
  { value: "Consensus-seeking",            label: "Consensus",     desc: "Bring everyone along" },
  { value: "Autocratic for speed",         label: "Fast & solo",   desc: "Move fast, decide alone" },
  { value: "Outcome-based",               label: "Outcome-based", desc: "What matters is the result" },
];

const EVIDENCE_OPTIONS = [
  "Empirical data", "Case studies", "First-hand experience",
  "Expert consensus", "Historical precedent", "Mathematical proof",
];

function ThinkingTab({ data, onSave }: { data: EpistemicProfile; onSave: (d: Partial<EpistemicProfile>) => Promise<void> }) {
  const [local, setLocal] = useState<EpistemicProfile>(data);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const c = ACCENT.thinking;

  function set(patch: Partial<EpistemicProfile>) {
    setLocal((p) => ({ ...p, ...patch }));
    setDirty(true);
  }

  function toggleFramework(f: string) {
    const cur = local.reasoning_frameworks ?? [];
    set({ reasoning_frameworks: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] });
  }

  function toggleEvidence(e: string) {
    const cur = local.preferred_evidence_types ?? [];
    set({ preferred_evidence_types: cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e] });
  }

  async function save() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setDirty(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Thinking style frameworks */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <SectionIcon color={c.color} bg={c.bg}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3a6 6 0 100 12A6 6 0 009 3z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 9l1.5 1.5L12 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </SectionIcon>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>How you think through problems</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Select all that apply</p>
          </div>
        </div>
        <ChipGroup
          all={FRAMEWORK_OPTIONS}
          selected={local.reasoning_frameworks ?? []}
          accentColor={c.color}
          onToggle={toggleFramework}
        />
      </div>

      {/* Confidence + Decision 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v6l4 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>How you express certainty</p>
            </div>
          </div>
          <RadioCards
            options={CONFIDENCE_OPTIONS}
            value={local.confidence_style ?? ""}
            accentColor={c.color}
            onChange={(v) => { set({ confidence_style: v }); }}
          />
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9h12M9 3l6 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>How you make decisions</p>
            </div>
          </div>
          <RadioCards
            options={DECISION_OPTIONS}
            value={local.decision_approach ?? ""}
            accentColor={c.color}
            onChange={(v) => { set({ decision_approach: v }); }}
          />
        </div>
      </div>

      {/* Expertise + Evidence 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="3" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="3" y="10" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="10" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Areas of expertise</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Where your clone claims authority</p>
            </div>
          </div>
          <TagInput
            items={local.knowledge_domains ?? []}
            placeholder="e.g. B2B SaaS, hiring, growth…"
            accentColor={c.color}
            onAdd={(v) => set({ knowledge_domains: [...(local.knowledge_domains ?? []), v] })}
            onRemove={(v) => set({ knowledge_domains: (local.knowledge_domains ?? []).filter((x) => x !== v) })}
          />
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3L3 15h12L9 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M9 10V8M9 12.5v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>What counts as evidence</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Select all that apply</p>
            </div>
          </div>
          <ChipGroup
            all={EVIDENCE_OPTIONS}
            selected={local.preferred_evidence_types ?? []}
            accentColor={c.color}
            onToggle={toggleEvidence}
          />
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Values tab
// ---------------------------------------------------------------------------

const CONFLICT_OPTIONS = [
  { value: "Avoid conflict",              label: "Avoid",      desc: "Sidestep tension when possible" },
  { value: "Accommodate",                 label: "Accommodate", desc: "Give in to keep the peace" },
  { value: "Compromise",                  label: "Compromise", desc: "Meet in the middle" },
  { value: "Compete to win",              label: "Compete",    desc: "Push for your position" },
  { value: "Collaborate for best outcome", label: "Collaborate", desc: "Work toward the best answer together" },
];

function ValuesTab({ data, onSave }: { data: ValueSystem; onSave: (d: Partial<ValueSystem>) => Promise<void> }) {
  const [local, setLocal] = useState<ValueSystem>(data);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const c = ACCENT.values;

  function set(patch: Partial<ValueSystem>) {
    setLocal((p) => ({ ...p, ...patch }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setDirty(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Core values + priorities 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3l1.8 3.6 4 .6-2.9 2.8.7 4L9 12l-3.6 1.9.7-4L3.1 7.2l4-.6L9 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Core values</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>What your clone always optimises for</p>
            </div>
          </div>
          <TagInput
            items={local.core_values ?? []}
            placeholder="e.g. Transparency, Speed, Craft…"
            accentColor={c.color}
            onAdd={(v) => set({ core_values: [...(local.core_values ?? []), v] })}
            onRemove={(v) => set({ core_values: (local.core_values ?? []).filter((x) => x !== v) })}
          />
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 5h10M4 9h7M4 13h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="14" cy="5" r="1.5" fill={c.color} opacity="0.7"/><circle cx="12" cy="9" r="1.5" fill={c.color} opacity="0.5"/><circle cx="13.5" cy="13" r="1.5" fill={c.color} opacity="0.35"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Work priorities</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>What matters most, in order</p>
            </div>
          </div>
          <TagInput
            items={local.professional_priorities ?? []}
            placeholder="e.g. Shipping fast, team health…"
            accentColor={c.color}
            onAdd={(v) => set({ professional_priorities: [...(local.professional_priorities ?? []), v] })}
            onRemove={(v) => set({ professional_priorities: (local.professional_priorities ?? []).filter((x) => x !== v) })}
          />
        </div>
      </div>

      {/* Risk + Conflict 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 14l4-8 4 5 2-3 2 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Risk appetite</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>How your clone weighs uncertainty</p>
            </div>
          </div>
          <RiskScale
            value={local.risk_tolerance ?? ""}
            onChange={(v) => set({ risk_tolerance: v })}
          />
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <SectionIcon color={c.color} bg={c.bg}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6 6l6 6M12 6l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/></svg>
            </SectionIcon>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>Handling disagreement</p>
            </div>
          </div>
          <RadioCards
            options={CONFLICT_OPTIONS}
            value={local.conflict_style ?? ""}
            accentColor={c.color}
            onChange={(v) => set({ conflict_style: v })}
          />
        </div>
      </div>

      {/* Boundaries */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <SectionIcon color="rgba(248,113,113,0.75)" bg="rgba(248,113,113,0.10)">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M9 6v4M9 12.5v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </SectionIcon>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>What your clone won&apos;t do</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Hard limits — always declined, no exceptions</p>
          </div>
        </div>
        <TagInput
          items={local.persona_boundaries ?? []}
          placeholder="e.g. Financial commitments, legal advice…"
          accentColor="rgba(248,113,113,0.80)"
          onAdd={(v) => set({ persona_boundaries: [...(local.persona_boundaries ?? []), v] })}
          onRemove={(v) => set({ persona_boundaries: (local.persona_boundaries ?? []).filter((x) => x !== v) })}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {["Financial commitments", "Legal advice", "Medical advice", "Confidential info", "Impersonating others"].filter(
            (o) => !(local.persona_boundaries ?? []).includes(o)
          ).map((o) => (
            <button
              key={o}
              onClick={() => set({ persona_boundaries: [...(local.persona_boundaries ?? []), o] })}
              style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                border: "1px solid rgba(248,113,113,0.15)", background: "rgba(248,113,113,0.05)",
                color: "rgba(248,113,113,0.50)", transition: "all 180ms",
              }}
            >
              + {o}
            </button>
          ))}
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type IdentityTab = "voice" | "thinking" | "values";

const TABS: { id: IdentityTab; label: string; desc: string; icon: React.ReactNode; accent: typeof ACCENT.voice }[] = [
  {
    id: "voice", label: "Voice", desc: "Tone & writing style",
    accent: ACCENT.voice,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M3 5h7M3 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    id: "thinking", label: "Thinking", desc: "Reasoning & decisions",
    accent: ACCENT.thinking,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="currentColor" strokeWidth="1.4"/><path d="M6 8l1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    id: "values", label: "Values", desc: "Priorities & limits",
    accent: ACCENT.values,
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2l1.6 3.2L13 5.8l-2.5 2.4.6 3.4L8 10l-3.1 1.6.6-3.4L3 5.8l3.4-.6L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  },
];

export default function IdentityPage() {
  const [tab, setTab] = useState<IdentityTab>("voice");
  const [data, setData] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => { if (d.clone_id) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveLayer(layer: "style_fingerprint" | "value_system" | "epistemic_profile", patch: object) {
    await fetch("/api/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layer, data: patch }),
    });
    setData((prev) => prev ? { ...prev, [layer]: { ...(prev[layer] as object), ...patch } } : prev);
  }

  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="db-page" style={{ "--page-accent": activeTab.accent.color } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone settings</p>
          <h1 className="db-h1">Identity</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 18px", borderRadius: 14, cursor: "pointer",
                background: on ? t.accent.bg : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? t.accent.border : "rgba(255,255,255,0.07)"}`,
                color: on ? t.accent.color : "rgba(255,255,255,0.40)",
                fontFamily: "inherit", transition: "all 180ms",
              }}
            >
              {t.icon}
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: on ? t.accent.color : "rgba(255,255,255,0.60)", textAlign: "left" }}>{t.label}</span>
                <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "left" }}>{t.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "32px 0" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.20)" }} />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</span>
        </div>
      )}

      {!loading && !data && (
        <div className="card">
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            Create your clone first.{" "}
            <Link href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>Get started →</Link>
          </p>
        </div>
      )}

      {!loading && data && (
        <>
          {tab === "voice"    && <VoiceTab    data={data.style_fingerprint} onSave={(p) => saveLayer("style_fingerprint", p)} />}
          {tab === "thinking" && <ThinkingTab data={data.epistemic_profile} onSave={(p) => saveLayer("epistemic_profile", p)} />}
          {tab === "values"   && <ValuesTab   data={data.value_system}      onSave={(p) => saveLayer("value_system", p)} />}
        </>
      )}
    </div>
  );
}
