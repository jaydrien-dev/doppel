"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import { SchedulePicker } from "@/components/ui/SchedulePicker";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Automation {
  id: string;
  name: string;
  description?: string;
  instruction: string;
  schedule: string;
  status: "active" | "paused" | "disabled";
  run_count: number;
  last_run_at?: string;
  next_run_at?: string;
  last_task_id?: string;
  created_at: string;
}

function scheduleLabel(value: string): string {
  if (value === "hourly") return "Every hour";
  const p = value.split(":");
  const pad = (v: string) => v.padStart(2, "0");
  const fmtTime = (h: string, m: string) => {
    const hh = parseInt(h, 10);
    const suffix = hh >= 12 ? "PM" : "AM";
    const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `${display}:${pad(m)} ${suffix}`;
  };
  const DAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  if (p[0] === "daily")    return `Every day at ${fmtTime(p[1], p[2])}`;
  if (p[0] === "weekdays") return `Every weekday at ${fmtTime(p[1], p[2])}`;
  if (p[0] === "weekly")   return `Every ${DAY[p[1]] ?? p[1]} at ${fmtTime(p[2], p[3])}`;
  if (p[0] === "monthly") {
    const d = parseInt(p[1], 10);
    const sfx = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
    return `${d}${sfx} of each month at ${fmtTime(p[2], p[3])}`;
  }
  return value;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AutomationRow({
  auto, cloneId, onRefresh,
}: { auto: Automation; cloneId: string; onRefresh: () => void }) {
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isActive = auto.status === "active";

  async function toggleStatus() {
    setToggling(true);
    try {
      await fetch(`/api/automations/${auto.id}?clone_id=${cloneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isActive ? "paused" : "active" }),
      });
      onRefresh();
    } finally {
      setToggling(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await fetch(`/api/automations/${auto.id}?clone_id=${cloneId}`, { method: "POST" });
      onRefresh();
    } finally {
      setRunning(false);
    }
  }

  async function deleteAuto() {
    if (!confirm(`Delete "${auto.name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/automations/${auto.id}?clone_id=${cloneId}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${isActive ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)"}`,
      borderRadius: 14, padding: "14px 16px", marginBottom: 8,
      display: "flex", alignItems: "flex-start", gap: 14,
      opacity: auto.status === "paused" ? 0.65 : 1,
    }}>
      {/* Status dot */}
      <div style={{ marginTop: 3, flexShrink: 0 }}>
        <div style={{
          width: 8, height: 8, borderRadius: 999,
          background: isActive ? "#34D399" : "rgba(255,255,255,0.2)",
        }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>{auto.name}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{scheduleLabel(auto.schedule)}</span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, lineHeight: 1.5 }}>
          {auto.instruction.slice(0, 120)}{auto.instruction.length > 120 ? "…" : ""}
        </p>
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          {auto.last_run_at && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
              Last run: {relativeTime(auto.last_run_at)}
            </span>
          )}
          {auto.next_run_at && isActive && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
              Next: {new Date(auto.next_run_at).toLocaleDateString()} {new Date(auto.next_run_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            {auto.run_count} run{auto.run_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button
          onClick={runNow}
          disabled={running}
          title="Run now"
          style={{
            width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid rgba(255,255,255,0.07)",
            cursor: "pointer", color: "rgba(255,255,255,0.45)",
            opacity: running ? 0.4 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 4-8 4V2z" fill="currentColor"/>
          </svg>
        </button>

        <button
          onClick={toggleStatus}
          disabled={toggling}
          title={isActive ? "Pause" : "Resume"}
          style={{
            width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid rgba(255,255,255,0.07)",
            cursor: "pointer", color: "rgba(255,255,255,0.45)",
            opacity: toggling ? 0.4 : 1,
          }}
        >
          {isActive ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="3" height="8" rx="1" fill="currentColor"/>
              <rect x="7" y="2" width="3" height="8" rx="1" fill="currentColor"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 4-8 4V2z" fill="currentColor" opacity="0.5"/>
            </svg>
          )}
        </button>

        <button
          onClick={deleteAuto}
          disabled={deleting}
          title="Delete"
          style={{
            width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid rgba(248,113,113,0.1)",
            cursor: "pointer", color: "rgba(248,113,113,0.45)",
            opacity: deleting ? 0.4 : 1,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function NewAutomationModal({ cloneId, onCreated, onClose }: { cloneId: string; onCreated: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [schedule, setSchedule] = useState("daily:09:00");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim() || !instruction.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, name: name.trim(), instruction: instruction.trim(), schedule }),
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "rgba(255,255,255,0.8)",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20,
        padding: 28, width: 520, maxWidth: "90vw",
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>New automation</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>
          Schedule a recurring task your clone runs automatically.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly digest"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Instruction</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Summarise emails received this week and identify any action items."
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" as const, lineHeight: 1.6 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 8 }}>Schedule</label>
            <SchedulePicker value={schedule} onChange={setSchedule} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{
            fontSize: 13, padding: "8px 18px", borderRadius: 10,
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={submit} disabled={loading || !name.trim() || !instruction.trim()} style={{
            fontSize: 13, padding: "8px 20px", borderRadius: 10,
            background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.85)", cursor: "pointer", fontFamily: "inherit",
            opacity: (!name.trim() || !instruction.trim() || loading) ? 0.4 : 1,
          }}>
            {loading ? "Saving…" : "Create automation"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AutomationsPage() {
  const { clone } = useClone();
  const [showModal, setShowModal] = useState(false);

  const { data, mutate, isLoading } = useSWR<{ automations: Automation[] }>(
    clone ? `/api/automations?clone_id=${clone.clone_id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const automations = data?.automations ?? [];

  if (!clone) return (
    <div style={{ padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading…</div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>
            Clone
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.85)" }}>Automations</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            Recurring tasks your clone runs on a schedule.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            fontSize: 13, padding: "10px 20px", borderRadius: 12,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.8)", cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 7,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          New automation
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
      ) : automations.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
            No automations yet. Set your clone to work on a schedule.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              fontSize: 13, padding: "9px 20px", borderRadius: 10,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Create first automation
          </button>
        </div>
      ) : (
        automations.map((auto) => (
          <AutomationRow key={auto.id} auto={auto} cloneId={clone.clone_id} onRefresh={() => mutate()} />
        ))
      )}

      {showModal && (
        <NewAutomationModal
          cloneId={clone.clone_id}
          onCreated={() => mutate()}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
