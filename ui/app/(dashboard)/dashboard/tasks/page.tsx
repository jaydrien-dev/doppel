"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TaskStep {
  step: number;
  description: string;
  requires_approval: boolean;
  status: "pending" | "running" | "completed" | "failed" | "waiting_approval" | "approved";
  result?: string;
}

interface Task {
  id: string;
  title: string;
  instruction: string;
  status: "pending" | "planning" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
  plan_steps: TaskStep[];
  current_step: number;
  result?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending:          "rgba(255,255,255,0.3)",
  planning:         "rgba(255,255,255,0.5)",
  running:          "#6BAEFF",
  waiting_approval: "#FCD34D",
  completed:        "#34D399",
  failed:           "#F87171",
  cancelled:        "rgba(255,255,255,0.2)",
};

const STATUS_LABEL: Record<string, string> = {
  pending:          "Queued",
  planning:         "Planning",
  running:          "Running",
  waiting_approval: "Needs approval",
  completed:        "Done",
  failed:           "Failed",
  cancelled:        "Cancelled",
};

function StepIcon({ status }: { status: string }) {
  if (status === "completed") return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.4)"/>
      <path d="M4 7l2 2 4-4" stroke="#34D399" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (status === "running") return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" fill="rgba(107,174,255,0.15)" stroke="rgba(107,174,255,0.4)"/>
      <circle cx="7" cy="7" r="2.5" fill="#6BAEFF" opacity="0.8"/>
    </svg>
  );
  if (status === "waiting_approval") return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" fill="rgba(252,211,77,0.12)" stroke="rgba(252,211,77,0.35)"/>
      <path d="M7 4v3M7 9.5v.5" stroke="#FCD34D" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (status === "failed") return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" fill="rgba(248,113,113,0.12)" stroke="rgba(248,113,113,0.3)"/>
      <path d="M5 5l4 4M9 5l-4 4" stroke="#F87171" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="rgba(255,255,255,0.12)"/>
    </svg>
  );
}

function TaskCard({ task, cloneId, onRefresh }: { task: Task; cloneId: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(task.status === "waiting_approval");
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const completedSteps = task.plan_steps.filter((s) => s.status === "completed").length;
  const totalSteps = task.plan_steps.length;
  const progress = totalSteps > 0 ? completedSteps / totalSteps : 0;

  async function approveStep() {
    setResuming(true);
    try {
      await fetch(`/api/tasks/${task.id}?clone_id=${cloneId}&action=resume`, { method: "POST" });
      onRefresh();
    } finally {
      setResuming(false);
    }
  }

  async function cancelTask() {
    setCancelling(true);
    try {
      await fetch(`/api/tasks/${task.id}?clone_id=${cloneId}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setCancelling(false);
    }
  }

  const statusColor = STATUS_COLOR[task.status] || "rgba(255,255,255,0.3)";
  const isActive = ["pending", "planning", "running", "waiting_approval"].includes(task.status);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${task.status === "waiting_approval" ? "rgba(252,211,77,0.2)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 16, padding: "16px 18px", marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => setExpanded((e) => !e)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
            {task.title || task.instruction.slice(0, 80)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 999,
              background: `${statusColor}18`,
              border: `1px solid ${statusColor}35`,
              color: statusColor,
            }}>
              {STATUS_LABEL[task.status] || task.status}
            </span>
            {totalSteps > 0 && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                {completedSteps}/{totalSteps} steps
              </span>
            )}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
              {new Date(task.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {totalSteps > 0 && (
          <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 999, flexShrink: 0 }}>
            <div style={{
              width: `${progress * 100}%`, height: "100%",
              background: task.status === "completed" ? "#34D399" : "#6BAEFF",
              borderRadius: 999, transition: "width 0.4s ease",
            }} />
          </div>
        )}

        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0, opacity: 0.4 }}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 14 }}>
          {/* Plan steps */}
          {task.plan_steps.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {task.plan_steps.map((step, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "8px 10px",
                  background: step.status === "running" ? "rgba(107,174,255,0.04)" :
                              step.status === "waiting_approval" ? "rgba(252,211,77,0.04)" : "transparent",
                  border: `1px solid ${step.status === "running" ? "rgba(107,174,255,0.12)" :
                                       step.status === "waiting_approval" ? "rgba(252,211,77,0.12)" : "transparent"}`,
                  borderRadius: 10,
                }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}>
                    <StepIcon status={step.status} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{step.description}</div>
                    {step.result && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, lineHeight: 1.5 }}>
                        {step.result.slice(0, 200)}{step.result.length > 200 ? "…" : ""}
                      </div>
                    )}
                    {step.requires_approval && step.status === "pending" && (
                      <div style={{ fontSize: 10, color: "rgba(252,211,77,0.6)", marginTop: 3 }}>
                        Requires your approval
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
              {task.status === "planning" ? "Planning steps…" : task.instruction}
            </p>
          )}

          {/* Final result */}
          {task.result && (
            <div style={{
              background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)",
              borderRadius: 10, padding: "12px 14px", marginBottom: 10,
            }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Result</p>
              <MarkdownRenderer content={task.result} />
            </div>
          )}

          {/* Error */}
          {task.error && (
            <div style={{
              background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
              borderRadius: 10, padding: "10px 12px", marginBottom: 10,
            }}>
              <p style={{ fontSize: 12, color: "#F87171" }}>{task.error}</p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            {task.status === "waiting_approval" && (
              <button
                onClick={approveStep}
                disabled={resuming}
                style={{
                  fontSize: 12, padding: "7px 16px", borderRadius: 10,
                  background: "rgba(252,211,77,0.12)", border: "1px solid rgba(252,211,77,0.25)",
                  color: "#FCD34D", cursor: "pointer", fontFamily: "inherit",
                  opacity: resuming ? 0.5 : 1,
                }}
              >
                {resuming ? "Approving…" : "Approve & continue"}
              </button>
            )}
            {isActive && (
              <button
                onClick={cancelTask}
                disabled={cancelling}
                style={{
                  fontSize: 12, padding: "7px 14px", borderRadius: 10,
                  background: "transparent", border: "1px solid rgba(248,113,113,0.15)",
                  color: "rgba(248,113,113,0.6)", cursor: "pointer", fontFamily: "inherit",
                  opacity: cancelling ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewTaskModal({ cloneId, onCreated, onClose }: { cloneId: string; onCreated: () => void; onClose: () => void }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!instruction.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, instruction: instruction.trim() }),
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20,
        padding: 28, width: 520, maxWidth: "90vw",
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>New task</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>
          Describe what your clone should do. It will plan and execute step-by-step.
        </p>
        <textarea
          autoFocus
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Search my Gmail for any emails from investors this week and summarise the key asks."
          style={{
            width: "100%", minHeight: 100,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, padding: "12px 14px",
            fontSize: 13, color: "rgba(255,255,255,0.8)", resize: "vertical",
            fontFamily: "inherit", lineHeight: 1.6, outline: "none", boxSizing: "border-box",
          }}
          onFocus={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.22)"; }}
          onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{
            fontSize: 13, padding: "8px 18px", borderRadius: 10,
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={submit} disabled={loading || !instruction.trim()} style={{
            fontSize: 13, padding: "8px 20px", borderRadius: 10,
            background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.85)", cursor: "pointer", fontFamily: "inherit",
            opacity: (!instruction.trim() || loading) ? 0.4 : 1,
          }}>
            {loading ? "Starting…" : "Start task"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { clone } = useClone();
  const [showModal, setShowModal] = useState(false);

  const { data, mutate, isLoading } = useSWR<{ tasks: Task[] }>(
    clone ? `/api/tasks?clone_id=${clone.clone_id}` : null,
    fetcher,
    { refreshInterval: 5000 }   // poll every 5s while tasks are running
  );

  const tasks = data?.tasks ?? [];
  const activeTasks = tasks.filter((t) => ["pending", "planning", "running", "waiting_approval"].includes(t.status));

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
          <h1 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.85)" }}>Tasks</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            Long-running work your clone handles end-to-end.
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
          New task
        </button>
      </div>

      {/* Active indicator */}
      {activeTasks.length > 0 && (
        <div style={{
          background: "rgba(107,174,255,0.06)", border: "1px solid rgba(107,174,255,0.15)",
          borderRadius: 12, padding: "10px 14px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: 999, background: "#6BAEFF",
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontSize: 12, color: "rgba(107,174,255,0.8)" }}>
            {activeTasks.length} task{activeTasks.length !== 1 ? "s" : ""} running
          </span>
        </div>
      )}

      {/* Tasks */}
      {isLoading ? (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
      ) : tasks.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
            No tasks yet. Give your clone something to do.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              fontSize: 13, padding: "9px 20px", borderRadius: 10,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Start first task
          </button>
        </div>
      ) : (
        tasks.map((task) => (
          <TaskCard key={task.id} task={task} cloneId={clone.clone_id} onRefresh={() => mutate()} />
        ))
      )}

      {showModal && (
        <NewTaskModal
          cloneId={clone.clone_id}
          onCreated={() => mutate()}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
