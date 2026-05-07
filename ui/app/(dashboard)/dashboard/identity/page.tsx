"use client";

import { useEffect, useState } from "react";

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
  signature_phrases?: string[];
  opening_patterns?: string[];
  closing_patterns?: string[];
  preferred_greeting?: string;
  subject_line_style?: string;
  response_length_preference?: string;
  punctuation_style?: string;
  capitalization_style?: string;
  uses_contractions?: boolean;
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
  epistemic_humility?: string;
  preferred_evidence_types?: string[];
}

type RelationalAdjustments = Record<string, {
  formality: "more formal" | "same" | "more casual";
  detail_level: "high" | "medium" | "low";
  vulnerability: "more open" | "same" | "more guarded";
  notes: string;
}>;

interface IdentityData {
  clone_id: string;
  style_fingerprint: StyleFingerprint;
  value_system: ValueSystem;
  epistemic_profile: EpistemicProfile;
  relational_profile: RelationalAdjustments;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-[11px] text-white/35 font-mono">{pct}%</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-white/30 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TagList({ items, onAdd, onRemove }: { items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (v && !items.includes(v)) {
      onAdd(v);
      setDraft("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="flex items-center gap-1 text-xs text-white/60 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1">
            {item}
            <button onClick={() => onRemove(item)} className="text-white/25 hover:text-white/55 transition-colors ml-1 text-[10px]">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add… (press Enter)"
          className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-white/60 placeholder:text-white/20 outline-none focus:border-white/15 transition-colors"
        />
        <button onClick={add} className="text-xs text-white/30 hover:text-white/55 transition-colors px-2">Add</button>
      </div>
    </div>
  );
}

function SelectField({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/60 outline-none focus:border-white/15 transition-colors appearance-none"
    >
      <option value="">Not set</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Layer 1: Surface Style
// ---------------------------------------------------------------------------

function StyleLayer({ data, onSave }: { data: StyleFingerprint; onSave: (d: Partial<StyleFingerprint>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  const scores: { key: keyof StyleFingerprint; label: string }[] = [
    { key: "preferred_formality", label: "Formality" },
    { key: "directness", label: "Directness" },
    { key: "warmth", label: "Warmth" },
    { key: "humor_frequency", label: "Humor frequency" },
    { key: "vocabulary_richness", label: "Vocabulary richness" },
  ];

  const booleans: { key: keyof StyleFingerprint; label: string }[] = [
    { key: "uses_bullet_points", label: "Uses bullet points" },
    { key: "uses_emojis", label: "Uses emojis" },
    { key: "uses_contractions", label: "Uses contractions" },
  ];

  const hasScores = scores.some((s) => typeof data[s.key] === "number" && (data[s.key] as number) > 0);
  const isEmpty = Object.keys(data).length === 0;

  if (isEmpty) {
    return (
      <div className="glass rounded-2xl p-5">
        <p className="text-sm text-white/35">Style fingerprint not computed yet.</p>
        <p className="text-xs text-white/25 mt-1">
          Connect Gmail and ingest emails, then run Extract Style from the Train page.
        </p>
      </div>
    );
  }

  async function toggleBool(key: keyof StyleFingerprint) {
    setSaving(true);
    await onSave({ [key]: !data[key] });
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* Score bars */}
      {hasScores && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-xs text-white/40 font-medium">Writing dimensions</p>
          {scores.map(({ key, label }) =>
            typeof data[key] === "number" && (data[key] as number) > 0 ? (
              <ScoreBar key={key} value={data[key] as number} label={label} />
            ) : null
          )}
        </div>
      )}

      {/* Booleans */}
      <div className="glass rounded-2xl p-5">
        <p className="text-xs text-white/40 font-medium mb-3">Style traits</p>
        <div className="space-y-2.5">
          {booleans.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-white/55">{label}</span>
              <button
                onClick={() => toggleBool(key)}
                disabled={saving}
                className={`relative w-9 h-5 rounded-full transition-colors ${data[key] ? "bg-white/30" : "bg-white/[0.08]"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${data[key] ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Patterns */}
      {(data.signature_phrases?.length || data.opening_patterns?.length || data.preferred_greeting) && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <p className="text-xs text-white/40 font-medium">Language patterns</p>
          {data.preferred_greeting && (
            <div>
              <p className="text-[10px] text-white/25 mb-1">Preferred greeting</p>
              <code className="text-xs text-white/50 bg-white/[0.04] px-2 py-1 rounded">{data.preferred_greeting}</code>
            </div>
          )}
          {data.signature_phrases && data.signature_phrases.length > 0 && (
            <div>
              <p className="text-[10px] text-white/25 mb-1.5">Signature phrases</p>
              <div className="flex flex-wrap gap-1.5">
                {data.signature_phrases.map((p) => (
                  <code key={p} className="text-[11px] text-white/45 bg-white/[0.04] px-2 py-0.5 rounded">&ldquo;{p}&rdquo;</code>
                ))}
              </div>
            </div>
          )}
          {data.response_length_preference && (
            <div>
              <p className="text-[10px] text-white/25 mb-1">Response length preference</p>
              <span className="text-xs text-white/50 capitalize">{data.response_length_preference}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 2: Epistemic Style
// ---------------------------------------------------------------------------

const REASONING_FRAMEWORK_OPTIONS = [
  "First principles", "Inductive", "Deductive", "Analogical",
  "Systems thinking", "RICE prioritization", "Bayesian updating",
  "MECE", "Jobs-to-be-done", "Pre-mortem analysis",
];

const CONFIDENCE_STYLE_OPTIONS = [
  "High confidence, decisive", "Calibrated uncertainty", "Conservative, hedge often",
  "Context-dependent", "Collaborative, verify with others",
];

const DECISION_APPROACH_OPTIONS = [
  "Data-driven, then gut check", "Intuition-led, then data", "Consensus-seeking",
  "Autocratic for speed", "Reversibility-focused", "Outcome-based",
];

function EpistemicLayer({ data, onSave }: { data: EpistemicProfile; onSave: (d: Partial<EpistemicProfile>) => Promise<void> }) {
  const [local, setLocal] = useState<EpistemicProfile>(data);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function update(patch: Partial<EpistemicProfile>) {
    setLocal((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setDirty(false);
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5 space-y-4">
        <p className="text-xs text-white/40 font-medium">Reasoning frameworks</p>
        <p className="text-[11px] text-white/25 leading-relaxed">
          How do you think through hard problems? These shape how your clone reasons and structures responses.
        </p>
        <TagList
          items={local.reasoning_frameworks ?? []}
          onAdd={(v) => update({ reasoning_frameworks: [...(local.reasoning_frameworks ?? []), v] })}
          onRemove={(v) => update({ reasoning_frameworks: (local.reasoning_frameworks ?? []).filter((x) => x !== v) })}
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {REASONING_FRAMEWORK_OPTIONS.filter((o) => !(local.reasoning_frameworks ?? []).includes(o)).map((o) => (
            <button
              key={o}
              onClick={() => update({ reasoning_frameworks: [...(local.reasoning_frameworks ?? []), o] })}
              className="text-[11px] text-white/30 border border-white/[0.06] rounded-lg px-2 py-0.5 hover:text-white/55 hover:border-white/15 transition-all"
            >
              + {o}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-4">
        <p className="text-xs text-white/40 font-medium">Confidence & decision style</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-white/25 mb-2">How you express confidence</p>
            <SelectField
              value={local.confidence_style ?? ""}
              options={CONFIDENCE_STYLE_OPTIONS}
              onChange={(v) => update({ confidence_style: v })}
            />
          </div>
          <div>
            <p className="text-[10px] text-white/25 mb-2">Decision-making approach</p>
            <SelectField
              value={local.decision_approach ?? ""}
              options={DECISION_APPROACH_OPTIONS}
              onChange={(v) => update({ decision_approach: v })}
            />
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium">Knowledge domains</p>
        <p className="text-[11px] text-white/25">Areas where your clone should claim strong expertise.</p>
        <TagList
          items={local.knowledge_domains ?? []}
          onAdd={(v) => update({ knowledge_domains: [...(local.knowledge_domains ?? []), v] })}
          onRemove={(v) => update({ knowledge_domains: (local.knowledge_domains ?? []).filter((x) => x !== v) })}
        />
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium">Evidence preferences</p>
        <p className="text-[11px] text-white/25">What kinds of evidence do you find most compelling?</p>
        <TagList
          items={local.preferred_evidence_types ?? []}
          onAdd={(v) => update({ preferred_evidence_types: [...(local.preferred_evidence_types ?? []), v] })}
          onRemove={(v) => update({ preferred_evidence_types: (local.preferred_evidence_types ?? []).filter((x) => x !== v) })}
        />
        <div className="flex flex-wrap gap-1.5">
          {["Empirical data", "Case studies", "First-hand experience", "Expert consensus", "Historical precedent", "Mathematical proof"].filter(
            (o) => !(local.preferred_evidence_types ?? []).includes(o)
          ).map((o) => (
            <button key={o} onClick={() => update({ preferred_evidence_types: [...(local.preferred_evidence_types ?? []), o] })}
              className="text-[11px] text-white/30 border border-white/[0.06] rounded-lg px-2 py-0.5 hover:text-white/55 hover:border-white/15 transition-all">
              + {o}
            </button>
          ))}
        </div>
      </div>

      {dirty && (
        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm text-white/60 glass hover:glass-md transition-all disabled:opacity-40">
          {saving ? "Saving…" : "Save epistemic profile"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 3: Values & Priors
// ---------------------------------------------------------------------------

function ValuesLayer({ data, onSave }: { data: ValueSystem; onSave: (d: Partial<ValueSystem>) => Promise<void> }) {
  const [local, setLocal] = useState<ValueSystem>(data);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function update(patch: Partial<ValueSystem>) {
    setLocal((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setDirty(false);
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium">Core values</p>
        <p className="text-[11px] text-white/25">What your clone will always optimise for in its reasoning.</p>
        <TagList
          items={local.core_values ?? []}
          onAdd={(v) => update({ core_values: [...(local.core_values ?? []), v] })}
          onRemove={(v) => update({ core_values: (local.core_values ?? []).filter((x) => x !== v) })}
        />
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium">Professional priorities</p>
        <p className="text-[11px] text-white/25">What matters most in your work, in order.</p>
        <TagList
          items={local.professional_priorities ?? []}
          onAdd={(v) => update({ professional_priorities: [...(local.professional_priorities ?? []), v] })}
          onRemove={(v) => update({ professional_priorities: (local.professional_priorities ?? []).filter((x) => x !== v) })}
        />
      </div>

      <div className="glass rounded-2xl p-5 space-y-4">
        <p className="text-xs text-white/40 font-medium">Risk & conflict</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-white/25 mb-2">Risk tolerance</p>
            <SelectField
              value={local.risk_tolerance ?? ""}
              options={["Very conservative", "Conservative", "Moderate", "Calculated risk-taker", "Aggressive"]}
              onChange={(v) => update({ risk_tolerance: v })}
            />
          </div>
          <div>
            <p className="text-[10px] text-white/25 mb-2">Conflict resolution style</p>
            <SelectField
              value={local.conflict_style ?? ""}
              options={["Avoid conflict", "Accommodate", "Compromise", "Compete to win", "Collaborate for best outcome"]}
              onChange={(v) => update({ conflict_style: v })}
            />
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium">Persona boundaries</p>
        <p className="text-[11px] text-white/25">Topics or requests your clone will always decline.</p>
        <TagList
          items={local.persona_boundaries ?? []}
          onAdd={(v) => update({ persona_boundaries: [...(local.persona_boundaries ?? []), v] })}
          onRemove={(v) => update({ persona_boundaries: (local.persona_boundaries ?? []).filter((x) => x !== v) })}
        />
        <div className="flex flex-wrap gap-1.5">
          {["Financial commitments", "Legal advice", "Medical advice", "Sharing confidential info", "Impersonating non-clone identity"].filter(
            (o) => !(local.persona_boundaries ?? []).includes(o)
          ).map((o) => (
            <button key={o} onClick={() => update({ persona_boundaries: [...(local.persona_boundaries ?? []), o] })}
              className="text-[11px] text-white/30 border border-white/[0.06] rounded-lg px-2 py-0.5 hover:text-white/55 hover:border-white/15 transition-all">
              + {o}
            </button>
          ))}
        </div>
      </div>

      {dirty && (
        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm text-white/60 glass hover:glass-md transition-all disabled:opacity-40">
          {saving ? "Saving…" : "Save values"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 4: Relational context
// ---------------------------------------------------------------------------

const RELATIONSHIP_TYPES = [
  { id: "investor", label: "Investors" },
  { id: "teammate", label: "Teammates" },
  { id: "client", label: "Clients / Customers" },
  { id: "mentor", label: "Mentors / Advisors" },
  { id: "report", label: "Direct reports" },
  { id: "friend", label: "Friends" },
  { id: "stranger", label: "Strangers / Public" },
];

type RelationalAdjustment = RelationalAdjustments[string];

function RelationalLayer({
  data,
  onSave,
}: {
  data: RelationalAdjustments;
  onSave: (patch: RelationalAdjustments) => Promise<void>;
}) {
  const [adjustments, setAdjustments] = useState<RelationalAdjustments>(data ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function update(id: string, patch: Partial<RelationalAdjustment>) {
    setAdjustments((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } as RelationalAdjustment }));
  }

  async function save(id: string) {
    setSaving(id);
    try {
      const updated = { ...adjustments };
      await onSave(updated);
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  const FORMALITY_OPTS: RelationalAdjustment["formality"][] = ["more formal", "same", "more casual"];
  const DETAIL_OPTS: RelationalAdjustment["detail_level"][] = ["high", "medium", "low"];
  const VUL_OPTS: RelationalAdjustment["vulnerability"][] = ["more open", "same", "more guarded"];

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/35 leading-relaxed">
        Your clone can adjust its tone, detail level, and openness based on who it&apos;s speaking with.
        These adjustments layer on top of your base style.
      </p>
      {RELATIONSHIP_TYPES.map(({ id, label }) => {
        const adj = adjustments[id] ?? { formality: "same", detail_level: "medium", vulnerability: "same", notes: "" };
        return (
          <div key={id} className="glass rounded-2xl p-4 space-y-3">
            <p className="text-sm font-medium text-white/70">{label}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-white/25 mb-1.5">Formality</p>
                <div className="flex gap-1">
                  {FORMALITY_OPTS.map((o) => (
                    <button key={o} onClick={() => update(id, { formality: o })}
                      className={`flex-1 text-[10px] py-1 rounded-lg border transition-all capitalize ${adj.formality === o ? "border-white/20 text-white/65 bg-white/[0.06]" : "border-white/[0.06] text-white/25 hover:border-white/12"}`}>
                      {o === "same" ? "same" : o === "more formal" ? "formal↑" : "casual↑"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-white/25 mb-1.5">Detail level</p>
                <div className="flex gap-1">
                  {DETAIL_OPTS.map((o) => (
                    <button key={o} onClick={() => update(id, { detail_level: o })}
                      className={`flex-1 text-[10px] py-1 rounded-lg border transition-all capitalize ${adj.detail_level === o ? "border-white/20 text-white/65 bg-white/[0.06]" : "border-white/[0.06] text-white/25 hover:border-white/12"}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-white/25 mb-1.5">Openness</p>
                <div className="flex gap-1">
                  {VUL_OPTS.map((o) => (
                    <button key={o} onClick={() => update(id, { vulnerability: o })}
                      className={`flex-1 text-[10px] py-1 rounded-lg border transition-all ${adj.vulnerability === o ? "border-white/20 text-white/65 bg-white/[0.06]" : "border-white/[0.06] text-white/25 hover:border-white/12"}`}>
                      {o === "same" ? "same" : o === "more open" ? "open↑" : "guarded↑"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => save(id)} disabled={saving === id}
              className={`text-[11px] transition-colors disabled:opacity-40 ${saved === id ? "text-emerald-400/60" : "text-white/30 hover:text-white/55"}`}>
              {saving === id ? "Saving…" : saved === id ? "Saved" : "Save adjustments"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type IdentityTab = "style" | "epistemic" | "values" | "relational";

export default function IdentityPage() {
  const [tab, setTab] = useState<IdentityTab>("style");
  const [data, setData] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => { if (d.clone_id) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveLayer(layer: "style_fingerprint" | "value_system" | "epistemic_profile" | "relational_profile", patch: object) {
    await fetch("/api/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layer, data: patch }),
    });
    setData((prev) => prev ? { ...prev, [layer]: { ...(prev[layer as keyof IdentityData] as object), ...patch } } : prev);
  }

  const TABS: { id: IdentityTab; label: string; sublabel: string }[] = [
    { id: "style", label: "Style", sublabel: "Layer 1" },
    { id: "epistemic", label: "Epistemic", sublabel: "Layer 2" },
    { id: "values", label: "Values", sublabel: "Layer 3" },
    { id: "relational", label: "Relational", sublabel: "Layer 4" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-white/85">Identity</h1>
        <p className="text-sm text-white/35 mt-1">
          The four layers that define how your clone thinks, speaks, and reasons.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs transition-all flex flex-col items-center ${
              tab === t.id ? "glass-md text-white/75" : "text-white/35 hover:text-white/55"
            }`}
          >
            <span>{t.label}</span>
            <span className={`text-[9px] mt-0.5 ${tab === t.id ? "text-white/35" : "text-white/20"}`}>{t.sublabel}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8">
          <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
          <span className="text-sm text-white/30">Loading identity…</span>
        </div>
      )}

      {!loading && !data && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-white/35">Create your clone first to configure identity layers.</p>
        </div>
      )}

      {!loading && data && (
        <>
          {tab === "style" && (
            <StyleLayer
              data={data.style_fingerprint}
              onSave={(patch) => saveLayer("style_fingerprint", patch)}
            />
          )}
          {tab === "epistemic" && (
            <EpistemicLayer
              data={data.epistemic_profile}
              onSave={(patch) => saveLayer("epistemic_profile", patch)}
            />
          )}
          {tab === "values" && (
            <ValuesLayer
              data={data.value_system}
              onSave={(patch) => saveLayer("value_system", patch)}
            />
          )}
          {tab === "relational" && (
            <RelationalLayer
              data={data.relational_profile ?? {}}
              onSave={(patch) => saveLayer("relational_profile", patch)}
            />
          )}
        </>
      )}
    </div>
  );
}
