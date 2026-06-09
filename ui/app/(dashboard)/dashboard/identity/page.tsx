"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StyleFingerprint {
  preferred_formality?: number;
  directness?: number;
  warmth?: number;
  humor_frequency?: number;
  uses_emojis?: boolean;
  uses_contractions?: boolean;
  uses_bullet_points?: boolean;
  response_length_preference?: string;
  signature_phrases?: string[];
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

// ─── Communication tab — pick one ────────────────────────────────────────────

const STYLE_PAIRS: {
  a: string; b: string;
  field: keyof StyleFingerprint;
  aVal: number | boolean | string;
  bVal: number | boolean | string;
  context: string;
}[] = [
  { a: "I'll be direct about this",      b: "I'd push back on that respectfully",  field: "directness",                    aVal: 0.85, bVal: 0.25, context: "directness" },
  { a: "That's a fair point",            b: "That's an astute observation",         field: "preferred_formality",           aVal: 0.20, bVal: 0.85, context: "formality" },
  { a: "I'm genuinely excited about this", b: "This is a real challenge",           field: "warmth",                        aVal: 0.85, bVal: 0.25, context: "warmth" },
  { a: "My instinct: move on it",        b: "Let me think this through first",      field: "humor_frequency",               aVal: 0.65, bVal: 0.20, context: "pace" },
  { a: "Let me know your thoughts",      b: "I welcome your input",                 field: "uses_emojis",                   aVal: false, bVal: false, context: "register" },
  { a: "Short answer: yes",             b: "Here's the full picture…",             field: "response_length_preference",    aVal: "brief", bVal: "detailed", context: "response length" },
];

function PickCard({ text, onClick, picked }: { text: string; onClick: () => void; picked: boolean | null }) {
  const isPicked = picked === true;
  const isOther  = picked === false;
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "20px 18px", borderRadius: 14, cursor: "pointer", textAlign: "center",
        background: isPicked ? "rgba(255,255,255,0.08)" : isOther ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${isPicked ? "rgba(255,255,255,0.30)" : isOther ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)"}`,
        color: isPicked ? "rgba(255,255,255,0.90)" : isOther ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.65)",
        fontSize: 14, fontWeight: isPicked ? 500 : 400, fontFamily: "inherit",
        transform: isPicked ? "scale(1.02)" : isOther ? "scale(0.97)" : "scale(1)",
        transition: "all 180ms",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
      }}
    >
      {isPicked && (
        <span style={{ fontSize: 11, color: "rgba(52,211,153,0.70)", letterSpacing: "0.05em" }}>Selected</span>
      )}
      <span style={{ lineHeight: 1.5 }}>&ldquo;{text}&rdquo;</span>
    </button>
  );
}

function CommunicationTab({ data, onSave }: { data: StyleFingerprint; onSave: (d: Partial<StyleFingerprint>) => Promise<void> }) {
  const [idx,    setIdx]    = useState(0);
  const [picks,  setPicks]  = useState<(0 | 1 | null)[]>(Array(STYLE_PAIRS.length).fill(null));
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const pair    = STYLE_PAIRS[idx];
  const total   = STYLE_PAIRS.length;
  const pick    = picks[idx];
  const answered = picks.filter(p => p !== null).length;

  function choose(side: 0 | 1) {
    const next = [...picks];
    next[idx] = side;
    setPicks(next);
    setTimeout(() => {
      if (idx < total - 1) setIdx(i => i + 1);
      else finishStyle(next);
    }, 280);
  }

  async function finishStyle(finalPicks: (0 | 1 | null)[]) {
    setSaving(true);
    const patch: Partial<StyleFingerprint> = {};
    finalPicks.forEach((p, i) => {
      if (p === null) return;
      const { field, aVal, bVal } = STYLE_PAIRS[i];
      (patch as any)[field] = p === 0 ? aVal : bVal;
    });
    await onSave(patch);
    setSaving(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 6 }}>Communication style saved</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginBottom: 20, lineHeight: 1.6 }}>
          Your clone will match this tone in all responses.
        </p>
        <button onClick={() => { setDone(false); setIdx(0); setPicks(Array(total).fill(null)); }} className="btn btn--sm">
          Redo
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <style>{`
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Progress */}
      <div style={{ display: "flex", gap: 5 }}>
        {STYLE_PAIRS.map((_, i) => (
          <div key={i}
            style={{ flex: 1, height: 3, borderRadius: 999, background: i < idx ? "rgba(255,255,255,0.40)" : i === idx ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)", transition: "background 300ms", cursor: i <= answered ? "pointer" : "default" }}
            onClick={() => { if (i <= answered) setIdx(i); }}
          />
        ))}
      </div>

      {/* Header */}
      <div>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
          {idx + 1} of {total} · {pair.context}
        </p>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>
          Which phrase sounds more like you?
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", gap: 12, animation: "slide-in 200ms ease both" }} key={idx}>
        <PickCard text={pair.a} onClick={() => choose(0)} picked={pick === null ? null : pick === 0} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>or</div>
        <PickCard text={pair.b} onClick={() => choose(1)} picked={pick === null ? null : pick === 1} />
      </div>

      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", background: "none", border: "none", cursor: idx > 0 ? "pointer" : "not-allowed", opacity: idx > 0 ? 1 : 0.3, padding: 0 }}>
          Back
        </button>
        <button onClick={() => { if (idx < total - 1) setIdx(i => i + 1); else finishStyle(picks); }}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {idx === total - 1 ? "Finish" : "Skip"}
        </button>
      </div>

      {saving && <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.30)" }}>Saving…</p>}
    </div>
  );
}

// ─── How you think tab ────────────────────────────────────────────────────────

const POSITIONS: {
  statement: string;
  yesField: keyof (ValueSystem & EpistemicProfile);
  yesVal:   string | string[];
  nahField: keyof (ValueSystem & EpistemicProfile);
  nahVal:   string | string[];
}[] = [
  { statement: "Better to ship something imperfect than wait for perfect",
    yesField: "risk_tolerance", yesVal: "Aggressive",
    nahField: "risk_tolerance", nahVal: "Conservative" },
  { statement: "Data should drive the decision, not confirm it",
    yesField: "decision_approach", yesVal: "Data-driven, then gut check",
    nahField: "decision_approach", nahVal: "Intuition-led, then data" },
  { statement: "I'm confident in my read, and I'll say so",
    yesField: "confidence_style", yesVal: "High confidence, decisive",
    nahField: "confidence_style", nahVal: "Calibrated uncertainty" },
  { statement: "Disagreement handled well moves things forward",
    yesField: "conflict_style", yesVal: "Collaborate for best outcome",
    nahField: "conflict_style", nahVal: "Compete to win" },
  { statement: "First principles beat industry best practices",
    yesField: "reasoning_frameworks", yesVal: ["First principles"],
    nahField: "reasoning_frameworks", nahVal: ["Historical precedent"] },
  { statement: "I'd rather ask forgiveness than permission",
    yesField: "risk_tolerance", yesVal: "Calculated risk-taker",
    nahField: "risk_tolerance", nahVal: "Conservative" },
  { statement: "The best meetings are the ones that never happened",
    yesField: "conflict_style", yesVal: "Autocratic for speed",
    nahField: "conflict_style", nahVal: "Consensus-seeking" },
  { statement: "Experience and instinct are legitimate evidence",
    yesField: "preferred_evidence_types", yesVal: ["First-hand experience"],
    nahField: "preferred_evidence_types", nahVal: ["Empirical data"] },
];

type StanceReaction = "agree" | "disagree" | "depends";

const STANCES: { id: StanceReaction; label: string }[] = [
  { id: "agree",    label: "Agree"      },
  { id: "disagree", label: "Disagree"   },
  { id: "depends",  label: "It depends" },
];

function ThinkingTab({
  styleData, valuesData, thinkingData,
  onSave,
}: {
  styleData: StyleFingerprint;
  valuesData: ValueSystem;
  thinkingData: EpistemicProfile;
  onSave: (layer: "style_fingerprint" | "value_system" | "epistemic_profile", patch: object) => Promise<void>;
}) {
  const [idx,       setIdx]       = useState(0);
  const [reactions, setReactions] = useState<(StanceReaction | null)[]>(Array(POSITIONS.length).fill(null));
  const [saving,    setSaving]    = useState(false);
  const [done,      setDone]      = useState(false);

  const position = POSITIONS[idx];
  const total    = POSITIONS.length;
  const answered = reactions.filter(r => r !== null).length;

  function react(r: StanceReaction) {
    const next = [...reactions];
    next[idx] = r;
    setReactions(next);
    setTimeout(() => {
      if (idx < total - 1) setIdx(i => i + 1);
      else finish(next);
    }, 260);
  }

  async function finish(finalReactions: (StanceReaction | null)[]) {
    setSaving(true);

    const valuesPatch:   Partial<ValueSystem>      = {};
    const thinkingPatch: Partial<EpistemicProfile> = {};

    finalReactions.forEach((r, i) => {
      if (!r || r === "depends") return;
      const pos   = POSITIONS[i];
      const field = r === "agree" ? pos.yesField : pos.nahField;
      const val   = r === "agree" ? pos.yesVal   : pos.nahVal;

      if (field === "risk_tolerance" || field === "conflict_style") {
        (valuesPatch as any)[field] = val;
      } else if (
        field === "reasoning_frameworks" ||
        field === "decision_approach"    ||
        field === "confidence_style"     ||
        field === "preferred_evidence_types"
      ) {
        if (Array.isArray(val)) {
          const cur: string[] = (thinkingPatch as any)[field] ?? [];
          (thinkingPatch as any)[field] = [...cur, ...(val as string[])];
        } else {
          (thinkingPatch as any)[field] = val;
        }
      }
    });

    if (Object.keys(valuesPatch).length)   await onSave("value_system",      valuesPatch);
    if (Object.keys(thinkingPatch).length) await onSave("epistemic_profile", thinkingPatch);
    setSaving(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 6 }}>Thinking patterns saved</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginBottom: 20, lineHeight: 1.6 }}>
          Your clone now applies your decision-making style when giving advice.
        </p>
        <button onClick={() => { setDone(false); setIdx(0); setReactions(Array(total).fill(null)); }} className="btn btn--sm">
          Redo
        </button>
      </div>
    );
  }

  const r = reactions[idx];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Progress */}
      <div style={{ display: "flex", gap: 5 }}>
        {POSITIONS.map((_, i) => {
          const ri = reactions[i];
          const color = ri === "agree"
            ? "rgba(52,211,153,0.60)"
            : ri === "disagree"
            ? "rgba(248,113,113,0.50)"
            : ri === "depends"
            ? "rgba(255,255,255,0.30)"
            : i === idx
            ? "rgba(255,255,255,0.20)"
            : "rgba(255,255,255,0.07)";
          return (
            <div key={i} onClick={() => { if (i <= answered) setIdx(i); }}
              style={{ flex: 1, height: 3, borderRadius: 999, background: color, transition: "background 250ms", cursor: i <= answered ? "pointer" : "default" }}
            />
          );
        })}
      </div>

      {/* Statement card */}
      <div key={idx} style={{
        animation: "fade-up 200ms ease both",
        padding: "32px 24px", borderRadius: 16,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.22)", marginBottom: 16 }}>
          {idx + 1} of {total}
        </p>
        <p style={{ fontSize: 17, fontWeight: 500, color: "rgba(255,255,255,0.80)", lineHeight: 1.5, maxWidth: 420, margin: "0 auto" }}>
          &ldquo;{position.statement}&rdquo;
        </p>
      </div>

      {/* Stance buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        {STANCES.map((stance) => {
          const picked = r === stance.id;
          return (
            <button key={stance.id}
              onClick={() => react(stance.id)}
              style={{
                flex: 1, padding: "14px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                background: picked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border: `1.5px solid ${picked ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.08)"}`,
                color: picked ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.45)",
                fontSize: 13, fontWeight: picked ? 500 : 400,
                transition: "all 150ms",
              }}
            >
              {stance.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", background: "none", border: "none", cursor: idx > 0 ? "pointer" : "not-allowed", opacity: idx > 0 ? 1 : 0.3, padding: 0 }}>
          Back
        </button>
        <button onClick={() => { if (idx < total - 1) setIdx(i => i + 1); else finish(reactions); }}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {idx === total - 1 ? "Finish" : "Skip"}
        </button>
      </div>

      {saving && <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.30)" }}>Saving…</p>}
    </div>
  );
}

// ─── Your voice tab ───────────────────────────────────────────────────────────

const VOICE_PROMPTS = [
  {
    id: "opinion",
    prefix: "When someone asks for my honest opinion, I usually say…",
    field: "signature_phrases" as const,
    placeholder: "e.g. Here's what I actually think — not what you want to hear.",
  },
  {
    id: "wontdo",
    prefix: "The one thing I would never agree to professionally is…",
    field: "persona_boundaries" as const,
    placeholder: "e.g. Commit to a deadline I don't believe in.",
  },
  {
    id: "describes",
    prefix: "People who work closely with me would describe my style as…",
    field: "core_values" as const,
    placeholder: "e.g. Direct, rigorous, and good at cutting through ambiguity.",
  },
];

function VoiceTab({
  valuesData,
  onSaveValues,
  onSaveStyle,
  cloneId,
}: {
  valuesData: ValueSystem;
  onSaveValues: (patch: Partial<ValueSystem>) => Promise<void>;
  onSaveStyle:  (patch: Partial<StyleFingerprint>) => Promise<void>;
  cloneId: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({ opinion: "", wontdo: "", describes: "" });
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const allFilled = VOICE_PROMPTS.every(p => answers[p.id].trim().length > 0);

  async function save() {
    setSaving(true);
    try {
      for (const p of VOICE_PROMPTS) {
        const text = answers[p.id].trim();
        if (!text) continue;
        await fetch("/api/ingestion/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clone_id: cloneId, text: `${p.prefix} ${text}`, source: "words" }),
        });
      }

      const opinionText = answers["opinion"].trim();
      const wontdoText  = answers["wontdo"].trim();

      const valuesPatch: Partial<ValueSystem> = {};
      if (opinionText) valuesPatch.professional_priorities = [...(valuesData.professional_priorities ?? []), opinionText.slice(0, 80)];
      if (wontdoText)  valuesPatch.persona_boundaries      = [...(valuesData.persona_boundaries ?? []).filter(x => x !== wontdoText), wontdoText.slice(0, 80)];
      if (Object.keys(valuesPatch).length) await onSaveValues(valuesPatch);

      const descText = answers["describes"].trim();
      if (descText) await onSaveStyle({ signature_phrases: [descText.slice(0, 120)] });

      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 6 }}>Voice captured</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginBottom: 20, lineHeight: 1.6 }}>
          Your clone has learned how you communicate and what you stand for.
        </p>
        <button onClick={() => { setDone(false); setAnswers({ opinion: "", wontdo: "", describes: "" }); }} className="btn btn--sm">
          Update
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .voice-textarea { scrollbar-width: none; }
        .voice-textarea::-webkit-scrollbar { display: none; }
      `}</style>

      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.6, margin: 0 }}>
        Complete each sentence in your own words. Write how you&apos;d speak to a colleague — not a job interview answer.
      </p>

      {VOICE_PROMPTS.map((p) => {
        const isFocused = focused === p.id;
        const hasVal    = answers[p.id].trim().length > 0;
        return (
          <div key={p.id} style={{
            display: "flex", flexDirection: "column", gap: 8, padding: "18px 20px", borderRadius: 14,
            background: isFocused ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
            border: `1.5px solid ${isFocused ? "rgba(255,255,255,0.16)" : hasVal ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.07)"}`,
            transition: "all 180ms",
          }}>
            <p style={{ fontSize: 13, color: isFocused ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.38)", lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
              {p.prefix}
            </p>
            <textarea
              className="voice-textarea"
              value={answers[p.id]}
              onChange={e => setAnswers(prev => ({ ...prev, [p.id]: e.target.value }))}
              placeholder={p.placeholder}
              rows={2}
              onFocus={() => setFocused(p.id)}
              onBlur={() => setFocused(null)}
              onInput={e => { const ta = e.currentTarget; ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; }}
              style={{ background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, fontFamily: "inherit", width: "100%", padding: 0 }}
            />
            {hasVal && (
              <span style={{ fontSize: 10, color: "rgba(52,211,153,0.55)", alignSelf: "flex-end" }}>Saved</span>
            )}
          </div>
        );
      })}

      <button
        onClick={save}
        disabled={!allFilled || saving}
        className="btn btn--primary"
        style={{ opacity: allFilled ? 1 : 0.4, cursor: allFilled ? "pointer" : "not-allowed" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type IdentityTab = "communication" | "thinking" | "voice";

const TABS: { id: IdentityTab; label: string; desc: string }[] = [
  { id: "communication", label: "Communication", desc: "How you come across"     },
  { id: "thinking",      label: "How you think",  desc: "Decision-making style"  },
  { id: "voice",         label: "Your voice",     desc: "In your own words"      },
];

export default function IdentityPage() {
  const { clones } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedClone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  const [tab,     setTab]     = useState<IdentityTab>("communication");
  const [data,    setData]    = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedClone) return;
    setLoading(true);
    setData(null);
    fetch(`/api/identity?clone_id=${selectedClone.clone_id}`)
      .then((r) => r.json())
      .then((d) => { if (d.clone_id) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedClone?.clone_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveLayer(layer: "style_fingerprint" | "value_system" | "epistemic_profile", patch: object) {
    await fetch("/api/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layer, data: patch, clone_id: selectedClone?.clone_id }),
    });
    setData((prev) => prev ? { ...prev, [layer]: { ...(prev[layer] as object), ...patch } } : prev);
  }

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone settings</p>
          <h1 className="db-h1">Calibrate</h1>
        </div>
        <ClonePicker clones={clones} selected={selectedClone ?? clones[0]} onSelect={c => setSelectedId(c.clone_id)} />
      </div>

      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, maxWidth: 520, marginBottom: 24 }}>
        Three short steps to teach your clone how you communicate, how you make decisions, and what you stand for. Takes about 2 minutes.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "flex-start", flexDirection: "column", gap: 2, padding: "10px 16px", borderRadius: 12, cursor: "pointer",
              background: on ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${on ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)"}`,
              color: on ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.38)",
              fontFamily: "inherit", transition: "all 180ms",
            }}>
              <span style={{ fontSize: 13, fontWeight: on ? 500 : 400, color: on ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.50)" }}>{t.label}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{t.desc}</span>
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
            <Link href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>Get started</Link>
          </p>
        </div>
      )}

      {!loading && data && (
        <>
          {tab === "communication" && (
            <CommunicationTab
              data={data.style_fingerprint}
              onSave={(p) => saveLayer("style_fingerprint", p)}
            />
          )}
          {tab === "thinking" && (
            <ThinkingTab
              styleData={data.style_fingerprint}
              valuesData={data.value_system}
              thinkingData={data.epistemic_profile}
              onSave={(layer, patch) => saveLayer(layer, patch)}
            />
          )}
          {tab === "voice" && (
            <VoiceTab
              valuesData={data.value_system}
              onSaveValues={(p) => saveLayer("value_system", p)}
              onSaveStyle={(p)  => saveLayer("style_fingerprint", p)}
              cloneId={data.clone_id}
            />
          )}
        </>
      )}
    </div>
  );
}
