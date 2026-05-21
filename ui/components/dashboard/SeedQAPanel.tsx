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
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p className="card-title" style={{ margin: 0 }}>Seed Q&amp;A</p>
        {answerCount > 0 && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>{answerCount} answered</span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 18, lineHeight: 1.6 }}>
        Answer these questions to give your clone a baseline understanding of how you think.
        These are pinned &mdash; they always influence responses.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: 500, overflowY: "auto", paddingRight: 4 }}>
        {SEED_QUESTIONS.map((q, i) => (
          <div key={i}>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 6, lineHeight: 1.5 }}>
              {q}
            </label>
            <textarea
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
              placeholder="Your answer\u2026"
              rows={2}
              className="input"
              style={{ resize: "none", lineHeight: 1.6 }}
            />
          </div>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", marginTop: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
        <button
          onClick={handleSave}
          disabled={saving || answerCount === 0}
          className="btn btn--primary btn--sm"
        >
          {saving ? "Saving\u2026" : saved ? "Saved" : "Save answers"}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
            Pinned to brain
          </span>
        )}
      </div>
    </div>
  );
}
