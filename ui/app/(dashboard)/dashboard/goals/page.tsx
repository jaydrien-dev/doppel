"use client";

import { useState } from "react";
import { useOrg } from "@/lib/hooks/useOrg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface KeyResult {
  id: string;
  text: string;
  progress: number; // 0–100
  owner?: string;
}

interface Objective {
  id: string;
  title: string;
  description?: string;
  quarter: string;
  status: "on_track" | "at_risk" | "off_track" | "complete";
  key_results: KeyResult[];
  created_at: string;
}

// Demo data until backend is wired
const DEMO_OBJECTIVES: Objective[] = [
  {
    id: "demo-1",
    title: "Reach product-market fit with enterprise segment",
    description: "Close 3 enterprise pilots and gather sufficient signal to define ICP.",
    quarter: "Q2 2026",
    status: "on_track",
    key_results: [
      { id: "kr-1", text: "Close 3 paid enterprise pilots", progress: 67, owner: "Sales" },
      { id: "kr-2", text: "NPS ≥ 40 from pilot cohort", progress: 0, owner: "Product" },
      { id: "kr-3", text: "Publish case study from 1 pilot", progress: 30, owner: "Marketing" },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    title: "Ship knowledge handoff as standalone product",
    description: "Make knowledge handoff the breakout enterprise SKU.",
    quarter: "Q2 2026",
    status: "at_risk",
    key_results: [
      { id: "kr-4", text: "Handoff report generation < 5 min p95", progress: 80, owner: "Engineering" },
      { id: "kr-5", text: "10 handoff activations in the quarter", progress: 20, owner: "Sales" },
    ],
    created_at: new Date().toISOString(),
  },
];

const STATUS_STYLES: Record<Objective["status"], { dot: string; label: string; text: string }> = {
  on_track:  { dot: "bg-emerald-400/60", label: "On track",  text: "text-emerald-400/70" },
  at_risk:   { dot: "bg-amber-400/50",   label: "At risk",   text: "text-amber-400/60" },
  off_track: { dot: "bg-red-400/50",     label: "Off track", text: "text-red-400/60" },
  complete:  { dot: "bg-white/30",       label: "Complete",  text: "text-white/40" },
};

function ProgressBar({ value, status }: { value: number; status: Objective["status"] }) {
  const fill =
    status === "on_track" ? "bg-emerald-400/50" :
    status === "at_risk"  ? "bg-amber-400/40" :
    status === "off_track" ? "bg-red-400/40" :
    "bg-white/25";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/[0.07] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-white/30 w-7 text-right tabular-nums">{value}%</span>
    </div>
  );
}

function ObjectiveCard({ obj, onDelete }: { obj: Objective; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const st = STATUS_STYLES[obj.status];
  const avgProgress = Math.round(
    obj.key_results.reduce((s, kr) => s + kr.progress, 0) / (obj.key_results.length || 1)
  );

  return (
    <div className="glass rounded-2xl p-5">
      {/* Header */}
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white/75">{obj.title}</p>
              {obj.description && (
                <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{obj.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-white/25 bg-white/[0.05] border border-white/[0.07] rounded-full px-2 py-px">{obj.quarter}</span>
              <span className={`text-[10px] ${st.text}`}>{st.label}</span>
              <button
                onClick={onDelete}
                className="text-[11px] text-white/15 hover:text-red-400/60 transition-colors px-1"
              >
                ×
              </button>
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                className={`text-white/20 transition-transform ${expanded ? "rotate-180" : ""}`}
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Progress overview */}
      <div className="mt-3 ml-5">
        <ProgressBar value={avgProgress} status={obj.status} />
      </div>

      {/* Key results */}
      {expanded && (
        <div className="mt-4 ml-5 flex flex-col gap-2.5 border-t border-white/[0.06] pt-4">
          {obj.key_results.map((kr) => (
            <div key={kr.id}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="text-xs text-white/55 leading-relaxed">{kr.text}</p>
                {kr.owner && (
                  <span className="text-[10px] text-white/25 shrink-0">{kr.owner}</span>
                )}
              </div>
              <ProgressBar value={kr.progress} status={obj.status} />
            </div>
          ))}

          <button className="self-start mt-1 text-[11px] text-white/25 hover:text-white/50 transition-colors">
            Ask Company Brain about this →
          </button>
        </div>
      )}
    </div>
  );
}

function AddObjectiveForm({ onAdd }: { onAdd: (obj: Objective) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [quarter, setQuarter] = useState("Q2 2026");
  const [krs, setKrs] = useState([{ text: "", progress: 0 }]);

  function addKR() {
    setKrs((p) => [...p, { text: "", progress: 0 }]);
  }

  function submit() {
    if (!title.trim()) return;
    onAdd({
      id: `obj-${Date.now()}`,
      title: title.trim(),
      description: desc.trim() || undefined,
      quarter,
      status: "on_track",
      key_results: krs
        .filter((kr) => kr.text.trim())
        .map((kr, i) => ({ id: `kr-${Date.now()}-${i}`, ...kr })),
      created_at: new Date().toISOString(),
    });
    setTitle(""); setDesc(""); setKrs([{ text: "", progress: 0 }]); setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="glass hover:glass-md rounded-2xl px-5 py-3.5 text-sm text-white/35 hover:text-white/60 transition-all text-left"
      >
        + Add objective
      </button>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <p className="text-xs font-medium text-white/50">New objective</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to achieve?"
        className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
        autoFocus
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
        className="glass rounded-xl px-4 py-2.5 text-sm text-white/60 placeholder:text-white/20 outline-none"
      />
      <select
        value={quarter}
        onChange={(e) => setQuarter(e.target.value)}
        className="glass rounded-xl px-4 py-2.5 text-sm text-white/60 outline-none bg-transparent"
      >
        {["Q1 2026","Q2 2026","Q3 2026","Q4 2026"].map((q) => (
          <option key={q} value={q} className="bg-[#111]">{q}</option>
        ))}
      </select>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-white/30">Key results</p>
        {krs.map((kr, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={kr.text}
              onChange={(e) => setKrs((p) => p.map((r, j) => j === i ? { ...r, text: e.target.value } : r))}
              placeholder={`Key result ${i + 1}`}
              className="flex-1 glass rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/20 outline-none"
            />
            <input
              type="number"
              min={0} max={100}
              value={kr.progress}
              onChange={(e) => setKrs((p) => p.map((r, j) => j === i ? { ...r, progress: Number(e.target.value) } : r))}
              className="w-16 glass rounded-xl px-3 py-2 text-sm text-white/50 outline-none bg-transparent text-right"
              placeholder="%"
            />
          </div>
        ))}
        <button onClick={addKR} className="text-[11px] text-white/25 hover:text-white/50 transition-colors self-start">
          + Add key result
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/65 hover:text-white/85 transition-all disabled:opacity-40"
        >
          Add objective
        </button>
        <button
          onClick={() => setOpen(false)}
          className="glass rounded-xl px-4 py-2 text-sm text-white/35 hover:text-white/55 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function StrategicContextCard() {
  const [context, setContext] = useState(
    "We are building Doppel — an AI knowledge preservation platform for individuals and enterprises. Our current priority is enterprise GTM: closing 3 pilots in Q2, with a focus on knowledge handoff as the breakout SKU. We are pre-Series A, targeting YC W27."
  );
  const [saved, setSaved] = useState(true);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-white/50">Strategic context</p>
          <p className="text-[11px] text-white/25 mt-0.5">
            Injected into every Company Brain query as background context.
          </p>
        </div>
        {saved && (
          <span className="text-[10px] text-emerald-400/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />
            Saved
          </span>
        )}
      </div>
      <textarea
        value={context}
        onChange={(e) => { setContext(e.target.value); setSaved(false); }}
        rows={4}
        className="w-full glass rounded-xl px-4 py-3 text-sm text-white/60 placeholder:text-white/20 outline-none resize-none leading-relaxed"
        placeholder="Describe your company mission, current priorities, and constraints…"
      />
      {!saved && (
        <button
          onClick={() => setSaved(true)}
          className="mt-2 glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/60 hover:text-white/80 transition-all"
        >
          Save context
        </button>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const { org, isLoading } = useOrg();
  const [objectives, setObjectives] = useState<Objective[]>(DEMO_OBJECTIVES);

  if (isLoading) return <LoadingSpinner />;

  if (!org) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create an org workspace first from{" "}
          <a href="/dashboard/org" className="text-white/60 underline underline-offset-2">Team</a>.
        </p>
      </div>
    );
  }

  const totalKRs = objectives.reduce((s, o) => s + o.key_results.length, 0);
  const avgProgress = objectives.length
    ? Math.round(
        objectives.reduce(
          (s, o) =>
            s + o.key_results.reduce((ks, kr) => ks + kr.progress, 0) / (o.key_results.length || 1),
          0
        ) / objectives.length
      )
    : 0;
  const onTrack = objectives.filter((o) => o.status === "on_track").length;

  return (
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">Goals & Strategy</h1>
          <p className="text-sm text-white/35 mt-1">
            Set your OKRs. Team clones use these as context for every answer.
          </p>
        </div>
        <span className="text-[10px] text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/[0.12] rounded-full px-2.5 py-1">
          Enterprise
        </span>
      </div>

      {/* Stats */}
      {objectives.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Objectives", value: objectives.length },
            { label: "Key results", value: totalKRs },
            { label: "On track", value: onTrack },
            { label: "Avg progress", value: `${avgProgress}%` },
          ].map(({ label, value }) => (
            <div key={label} className="glass rounded-2xl px-5 py-4">
              <p className="text-2xl font-light text-white/80 tabular-nums">{value}</p>
              <p className="text-xs text-white/35 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Two-column: objectives + strategic context */}
      <div className="grid grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Objectives */}
        <div className="flex flex-col gap-3">
          {objectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              onDelete={() => setObjectives((p) => p.filter((o) => o.id !== obj.id))}
            />
          ))}
          <AddObjectiveForm
            onAdd={(obj) => setObjectives((p) => [...p, obj])}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <StrategicContextCard />

          {/* Legend */}
          <div className="glass rounded-2xl p-5">
            <p className="text-xs font-medium text-white/40 mb-3">Status</p>
            <div className="flex flex-col gap-2">
              {Object.entries(STATUS_STYLES).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${val.dot}`} />
                  <span className={`text-xs ${val.text}`}>{val.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/20 mt-4 leading-relaxed">
              Status is inferred automatically from key result progress as the quarter closes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
