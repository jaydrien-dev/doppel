"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: "active" | "paused" | "error";
  trigger: { type: string; config: Record<string, unknown> };
  conditions: unknown[];
  actions: { type: string; config: Record<string, unknown> }[];
  poll_interval_ms: number;
  approval_mode: string;
  last_fired_at?: string;
  next_poll_at?: string;
  daily_firing_count: number;
  error_message?: string;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  schedule: "Schedule",
  poll_api: "Poll API",
  poll_webpage: "Poll webpage",
  webhook: "Webhook",
  connector_event: "Connector event",
};

const ACTION_LABELS: Record<string, string> = {
  connector_action: "Connector action",
  notify: "Notification",
  ai_decide: "Clone decides",
  workflow_trigger: "Trigger workflow",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function WorkflowRow({
  wf,
  cloneId,
  onRefresh,
}: {
  wf: Workflow;
  cloneId: string;
  onRefresh: () => void;
}) {
  const [triggering, setTriggering] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isActive = wf.status === "active";
  const isError = wf.status === "error";

  async function triggerNow() {
    setTriggering(true);
    try {
      await fetch(`/api/workflows/${wf.id}/trigger?clone_id=${cloneId}`, { method: "POST" });
      onRefresh();
    } finally {
      setTriggering(false);
    }
  }

  async function toggleStatus() {
    setToggling(true);
    try {
      await fetch(`/api/workflows/${wf.id}?clone_id=${cloneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isActive ? "paused" : "active" }),
      });
      onRefresh();
    } finally {
      setToggling(false);
    }
  }

  async function deleteWorkflow() {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/workflows/${wf.id}?clone_id=${cloneId}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }

  const triggerLabel = TRIGGER_LABELS[wf.trigger?.type] ?? wf.trigger?.type ?? "Unknown";
  const actionLabels = (wf.actions ?? []).map((a) => ACTION_LABELS[a.type] ?? a.type);

  const dotColor = isError
    ? "#F87171"
    : isActive
    ? "#34D399"
    : "rgba(255,255,255,0.2)";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${isError ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 8,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        opacity: wf.status === "paused" ? 0.65 : 1,
      }}
    >
      {/* Status dot */}
      <div style={{ marginTop: 4, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: dotColor }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>
            {wf.name}
          </span>
          <span
            style={{
              fontSize: 10,
              padding: "2px 7px",
              borderRadius: 99,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            {triggerLabel}
          </span>
          {actionLabels.slice(0, 2).map((label, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 99,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              → {label}
            </span>
          ))}
        </div>

        {wf.description && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, lineHeight: 1.5 }}>
            {wf.description.slice(0, 120)}{wf.description.length > 120 ? "…" : ""}
          </p>
        )}

        {isError && wf.error_message && (
          <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", marginTop: 4 }}>
            {wf.error_message.slice(0, 100)}
          </p>
        )}

        <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
          {wf.last_fired_at && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
              Last fired: {relativeTime(wf.last_fired_at)}
            </span>
          )}
          {wf.daily_firing_count > 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              {wf.daily_firing_count} fire{wf.daily_firing_count !== 1 ? "s" : ""} today
            </span>
          )}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
            {wf.approval_mode === "auto_execute" ? "auto-execute" : wf.approval_mode.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button
          onClick={triggerNow}
          disabled={triggering}
          title="Fire now"
          style={{
            width: 30, height: 30, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid rgba(255,255,255,0.07)",
            cursor: "pointer", color: "rgba(255,255,255,0.45)",
            opacity: triggering ? 0.4 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 4-8 4V2z" fill="currentColor" />
          </svg>
        </button>

        <button
          onClick={toggleStatus}
          disabled={toggling}
          title={isActive ? "Pause" : "Resume"}
          style={{
            width: 30, height: 30, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid rgba(255,255,255,0.07)",
            cursor: "pointer", color: "rgba(255,255,255,0.45)",
            opacity: toggling ? 0.4 : 1,
          }}
        >
          {isActive ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="3" height="8" rx="1" fill="currentColor" />
              <rect x="7" y="2" width="3" height="8" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 4-8 4V2z" fill="currentColor" opacity="0.5" />
            </svg>
          )}
        </button>

        <button
          onClick={deleteWorkflow}
          disabled={deleting}
          title="Delete"
          style={{
            width: 30, height: 30, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid rgba(248,113,113,0.1)",
            cursor: "pointer", color: "rgba(248,113,113,0.45)",
            opacity: deleting ? 0.4 : 1,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function NewWorkflowModal({
  cloneId,
  onCreated,
  onClose,
}: {
  cloneId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("schedule");
  const [schedule, setSchedule] = useState("daily:09:00");
  const [pollUrl, setPollUrl] = useState("");
  const [pollSelector, setPollSelector] = useState("");
  const [actionType, setActionType] = useState("notify");
  const [notifyMsg, setNotifyMsg] = useState("");
  const [conditionField, setConditionField] = useState("value");
  const [conditionOp, setConditionOp] = useState("changed");
  const [conditionValue, setConditionValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const trigger: Record<string, unknown> =
        triggerType === "schedule"
          ? { type: "schedule", config: { schedule } }
          : triggerType === "webhook"
          ? { type: "webhook", config: {} }
          : { type: triggerType, config: { url: pollUrl, selector: pollSelector || undefined } };

      const conditions =
        triggerType !== "schedule"
          ? [{ field: conditionField, operator: conditionOp, value: conditionValue || undefined }]
          : [];

      const actions =
        actionType === "notify"
          ? [{ type: "notify", config: { message: notifyMsg || "Workflow fired.", notifyChannel: "log" } }]
          : [{ type: actionType, config: {} }];

      await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, name: name.trim(), description: description.trim(), trigger, conditions, actions }),
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const selectStyle = { ...inputStyle };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(8px)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0f0f0f",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 20, padding: 28,
          width: 560, maxWidth: "92vw",
          maxHeight: "90vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
          New workflow
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>
          Trigger → condition → action, deterministic and bot-speed.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stock alert" style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this workflow do?" style={inputStyle} />
          </div>

          {/* Trigger */}
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Trigger</label>
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} style={selectStyle}>
              <option value="schedule">Schedule</option>
              <option value="poll_api">Poll API (JSON)</option>
              <option value="poll_webpage">Poll webpage (text)</option>
              <option value="webhook">Webhook (POST)</option>
            </select>
          </div>

          {triggerType === "schedule" && (
            <div>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Schedule</label>
              <select value={schedule} onChange={(e) => setSchedule(e.target.value)} style={selectStyle}>
                <option value="hourly">Every hour</option>
                <option value="daily:09:00">Every day at 9 AM</option>
                <option value="daily:18:00">Every day at 6 PM</option>
                <option value="weekly:mon:09:00">Every Monday at 9 AM</option>
                <option value="weekdays:09:00">Every weekday at 9 AM</option>
                <option value="monthly:1:09:00">1st of each month at 9 AM</option>
              </select>
            </div>
          )}

          {(triggerType === "poll_api" || triggerType === "poll_webpage") && (
            <>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>URL to poll</label>
                <input value={pollUrl} onChange={(e) => setPollUrl(e.target.value)} placeholder="https://api.example.com/price" style={inputStyle} />
              </div>
              {triggerType === "poll_api" && (
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>JSON field (dot notation, e.g. price.amount)</label>
                  <input value={pollSelector} onChange={(e) => setPollSelector(e.target.value)} placeholder="price" style={inputStyle} />
                </div>
              )}
              {/* Condition */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Field</label>
                  <input value={conditionField} onChange={(e) => setConditionField(e.target.value)} placeholder="value" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Operator</label>
                  <select value={conditionOp} onChange={(e) => setConditionOp(e.target.value)} style={{ ...selectStyle, width: "auto" }}>
                    <option value="changed">changed</option>
                    <option value="<">&lt;</option>
                    <option value=">">&gt;</option>
                    <option value="=">=</option>
                    <option value="!=">≠</option>
                    <option value="contains">contains</option>
                    <option value="matches">matches (regex)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Value</label>
                  <input value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} placeholder="0" style={inputStyle} disabled={conditionOp === "changed"} />
                </div>
              </div>
            </>
          )}

          {triggerType === "webhook" && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
              After creation, you&apos;ll receive a webhook URL and signing secret. POST to that URL to fire this workflow.
            </p>
          )}

          {/* Action */}
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Action</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} style={selectStyle}>
              <option value="notify">Send notification</option>
              <option value="ai_decide">Let clone decide</option>
              <option value="connector_action">Connector action (configure after creation)</option>
            </select>
          </div>

          {actionType === "notify" && (
            <div>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>
                Message{" "}
                <span style={{ color: "rgba(255,255,255,0.2)" }}>
                  — use {"{{trigger_value}}"} for the detected value
                </span>
              </label>
              <input
                value={notifyMsg}
                onChange={(e) => setNotifyMsg(e.target.value)}
                placeholder="Alert: value changed to {{trigger_value}}"
                style={inputStyle}
              />
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{
            fontSize: 13, padding: "8px 18px", borderRadius: 10,
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={submit} disabled={loading || !name.trim()} style={{
            fontSize: 13, padding: "8px 20px", borderRadius: 10,
            background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.85)", cursor: "pointer", fontFamily: "inherit",
            opacity: (!name.trim() || loading) ? 0.4 : 1,
          }}>
            {loading ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const { clone } = useClone();
  const [showModal, setShowModal] = useState(false);

  const { data, mutate, isLoading } = useSWR<{ workflows: Workflow[] }>(
    clone ? `/api/workflows?clone_id=${clone.clone_id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const workflows = data?.workflows ?? [];

  if (!clone) return <div style={{ padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>Clone</p>
          <h1 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.85)" }}>Workflows</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            Deterministic trigger → condition → action. Runs at bot-speed without an AI in the loop.
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
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New workflow
        </button>
      </div>

      {/* Tip */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 12, padding: "12px 16px",
        marginBottom: 24, fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.6,
      }}>
        Tip: you can also ask your clone in chat — "watch our Shopee listing and WhatsApp me when stock hits zero" — and it will configure a workflow for you.
      </div>

      {/* List */}
      {isLoading ? (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
      ) : workflows.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
            No workflows yet. Set your clone to watch and act automatically.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              fontSize: 13, padding: "9px 20px", borderRadius: 10,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Create first workflow
          </button>
        </div>
      ) : (
        workflows.map((wf) => (
          <WorkflowRow key={wf.id} wf={wf} cloneId={clone.clone_id} onRefresh={() => mutate()} />
        ))
      )}

      {showModal && (
        <NewWorkflowModal
          cloneId={clone.clone_id}
          onCreated={() => mutate()}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
