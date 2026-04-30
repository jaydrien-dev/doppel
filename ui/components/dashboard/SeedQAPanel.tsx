"use client";

import { useState } from "react";
import { ingestText } from "@/lib/api";

const SEED_QUESTIONS = [
  "What are your top priorities right now?",
  "How do you make tough decisions?",
  "What does success look like to you this year?",
  "How do you prefer to communicate with your team?",
  "What's your philosophy on feedback?",
  "How do you handle conflict?",
  "What are your non-negotiables?",
  "How do you spend the first hour of your day?",
  "What's your biggest current challenge?",
  "How do you say no to things?",
  "What risks are you willing to take?",
  "What do you look for when hiring?",
  "How do you like to receive feedback?",
  "What's your approach to meetings?",
  "What's your communication style under pressure?",
  "What do you wish more people understood about your work?",
  "What's your long-term vision?",
  "How do you recharge?",
  "What's your biggest blind spot?",
  "What motivates you most?",
];

interface SeedQAPanelProps {
  cloneId: string;
}

export function SeedQAPanel({ cloneId }: SeedQAPanelProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const pairs = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `Q: ${SEED_QUESTIONS[Number(k)]}\nA: ${v.trim()}`)
      .join("\n\n");

    if (!pairs) return;

    setSaving(true);
    setError("");
    try {
      await ingestText({
        clone_id: cloneId,
        text: pairs,
        source: "seed_qa",
        is_pinned: true,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const answerCount = Object.values(answers).filter((v) => v.trim()).length;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white/60">Seed Q&A</h3>
        {answerCount > 0 && (
          <span className="text-xs text-white/30">{answerCount} answered</span>
        )}
      </div>
      <p className="text-xs text-white/35 mb-5 leading-relaxed">
        Answer these questions to give your clone a baseline understanding of how you think.
        These are pinned — they always influence responses.
      </p>

      <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-1">
        {SEED_QUESTIONS.map((q, i) => (
          <div key={i}>
            <label className="text-xs text-white/50 mb-1.5 block leading-relaxed">{q}</label>
            <textarea
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
              placeholder="Your answer…"
              rows={2}
              className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none resize-none leading-relaxed"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-white/40 mt-3">{error}</p>}

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={handleSave}
          disabled={saving || answerCount === 0}
          className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save answers"}
        </button>
        {saved && (
          <span className="text-xs text-white/30">
            Pinned to brain
          </span>
        )}
      </div>
    </div>
  );
}
