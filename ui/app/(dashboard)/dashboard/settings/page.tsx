"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import { useUser } from "@clerk/nextjs";
import type { CloneOwnerInfo } from "@/lib/types";
import { SelectMenu } from "@/components/ui/select-menu";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ---------------------------------------------------------------------------
// Channels / connected tools panel
// ---------------------------------------------------------------------------

type ConnectedTool = {
  id: string;
  name: string;
  server_url: string;
  transport: string;
  tool_names: string[];
  enabled: boolean;
  created_at: string;
};

const CHANNEL_DEFS: { id: string; label: string; desc: string; oauth?: boolean }[] = [
  { id: "gmail",  label: "Gmail",          desc: "Read and send email on your behalf.", oauth: true },
  { id: "gcal",   label: "Google Calendar", desc: "Read and create calendar events.",    oauth: true },
  { id: "gdrive", label: "Google Drive",    desc: "Search and manage files.",            oauth: true },
  { id: "slack",  label: "Slack",           desc: "Post messages and read channels.",    oauth: true },
  { id: "github", label: "GitHub",          desc: "Read issues, PRs, and repos.",        oauth: true },
  { id: "notion", label: "Notion",          desc: "Read and edit pages.",                oauth: true },
];

const TOOL_NAME_TO_ID: Record<string, string> = {
  "Gmail":          "gmail",
  "Google Calendar": "gcal",
  "Google Drive":   "gdrive",
  "Slack":          "slack",
  "GitHub Integration": "github",
  "Notion":         "notion",
};

function ChannelsPanel({ cloneId, cloneHandle }: { cloneId: string; cloneHandle: string }) {
  const { user } = useUser();
  const { data, mutate } = useSWR<ConnectedTool[]>(
    `/api/tools?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const tools = data ?? [];
  const connectedIds = new Set(tools.map((t) => TOOL_NAME_TO_ID[t.name]).filter(Boolean));

  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // WhatsApp webhook URL
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname.replace("3000", "8000")}/webhook/whatsapp/${cloneId}`
    : `https://api.doppel.ai/webhook/whatsapp/${cloneId}`;

  async function disconnect(toolId: string) {
    const tool = tools.find((t) => TOOL_NAME_TO_ID[t.name] === toolId);
    if (!tool) return;
    setDisconnecting(toolId);
    await fetch(`/api/tools/${tool.id}`, { method: "DELETE" });
    mutate();
    setDisconnecting(null);
  }

  function connect(serviceId: string) {
    const uid = user?.id ?? "";
    window.location.href = `/api/oauth-start?service=${serviceId}&clone_id=${cloneId}&user_id=${uid}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* WhatsApp */}
      <div style={{
        borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)", padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>WhatsApp</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>
              Paste this URL into your Twilio number&apos;s webhook settings.
            </p>
          </div>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 999, flexShrink: 0, marginTop: 2,
            color: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            Manual setup
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{
            flex: 1, fontSize: 11, padding: "7px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.50)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {webhookUrl}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 11,
              background: "transparent", border: "1px solid rgba(255,255,255,0.10)",
              color: copied ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.40)",
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              transition: "color 150ms",
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* OAuth channels */}
      {CHANNEL_DEFS.map((ch) => {
        const isConnected = connectedIds.has(ch.id);
        const isDisconnecting = disconnecting === ch.id;

        return (
          <div key={ch.id} style={{
            borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)", padding: "14px 18px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>{ch.label}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>{ch.desc}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {isConnected && (
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  color: "rgba(52,211,153,0.70)", background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.18)",
                }}>
                  Connected
                </span>
              )}
              {isConnected ? (
                <button
                  disabled={isDisconnecting}
                  onClick={() => disconnect(ch.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11,
                    background: "transparent", border: "1px solid rgba(248,113,113,0.15)",
                    color: "rgba(248,113,113,0.60)", cursor: "pointer", fontFamily: "inherit",
                    opacity: isDisconnecting ? 0.4 : 1,
                    transition: "all 150ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.30)"; e.currentTarget.style.color = "rgba(248,113,113,0.85)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.60)"; }}
                >
                  {isDisconnecting ? "…" : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={() => connect(ch.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.55)", cursor: "pointer", fontFamily: "inherit",
                    transition: "all 150ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
                >
                  Connect →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Admin policies panel
// ---------------------------------------------------------------------------

function AdminPoliciesPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  const [escalationThreshold, setEscalationThreshold] = useState<number>(50);
  const [requireHumanReview, setRequireHumanReview] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => {
        const p = d.admin_policies ?? {};
        setBlockedTopics(p.blocked_topics ?? []);
        setEscalationThreshold(p.escalation_threshold ?? 50);
        setRequireHumanReview(p.require_human_review ?? false);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/identity/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policies: { blocked_topics: blockedTopics, escalation_threshold: escalationThreshold, require_human_review: requireHumanReview },
      }),
    });
    setSaving(false);
  }

  function addTopic() {
    const t = topicDraft.trim();
    if (t && !blockedTopics.includes(t)) {
      setBlockedTopics((prev) => [...prev, t]);
      setTopicDraft("");
    }
  }

  if (!loaded) return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, margin: 0 }}>
        Control what your clone will and won&apos;t respond to. These policies apply to all surfaces.
      </p>

      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Blocked topics</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
          Your clone will decline any question touching these topics.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {blockedTopics.map((t) => (
            <span key={t} style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
              color: "rgba(255,255,255,0.55)", background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "4px 10px",
            }}>
              {t}
              <button
                onClick={() => setBlockedTopics((prev) => prev.filter((x) => x !== t))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 0, fontSize: 12, lineHeight: 1 }}
              >×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopic()}
            placeholder="e.g. salary, competitors, legal advice"
            className="input"
            style={{ flex: 1 }}
          />
          <button onClick={addTopic} className="btn btn--sm btn--ghost">Add</button>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", margin: 0 }}>Escalation threshold</p>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "ui-monospace, Menlo, monospace" }}>{escalationThreshold}%</span>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
          Responses below this confidence level will be flagged for human review.
        </p>
        <input
          type="range"
          min={10}
          max={90}
          value={escalationThreshold}
          onChange={(e) => setEscalationThreshold(Number(e.target.value))}
          style={{ width: "100%", accentColor: "rgba(255,255,255,0.50)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.20)", marginTop: 4 }}>
          <span>10% (rarely escalate)</span>
          <span>90% (almost always)</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 3 }}>Require human review for all responses</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>Clone drafts but never auto-sends — you approve every response.</p>
        </div>
        <button
          onClick={() => setRequireHumanReview((v) => !v)}
          style={{
            position: "relative", width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: requireHumanReview ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.08)",
            border: "none", cursor: "pointer", transition: "background 180ms",
          }}
        >
          <span style={{
            position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff",
            transition: "transform 180ms", transform: requireHumanReview ? "translateX(18px)" : "translateX(2px)",
          }} />
        </button>
      </div>

      <button onClick={save} disabled={saving || !cloneHandle} className="btn" style={{ width: "100%", justifyContent: "center" }}>
        {saving ? "Saving…" : "Save policies"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Retention panel
// ---------------------------------------------------------------------------

function DataRetentionPanel({ cloneHandle, cloneId }: { cloneHandle: string | null; cloneId: string | null }) {
  const [episodic, setEpisodic] = useState(730);
  const [traces, setTraces] = useState(365);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const qs = cloneId ? `?clone_id=${cloneId}` : "";
    fetch(`/api/identity${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.retention_days_episodic) setEpisodic(d.retention_days_episodic);
        if (d.retention_days_traces) setTraces(d.retention_days_traces);
      })
      .catch(() => {});
  }, [cloneId]);

  async function save() {
    if (!cloneHandle) return;
    setSaving(true);
    try {
      await fetch(`/api/clones/${cloneHandle}/retention`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retention_days_episodic: episodic, retention_days_traces: traces }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!cloneHandle) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch(`/api/clones/${cloneHandle}/run-retention`, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setResult(`Deleted ${d.deleted_episodic} memories and ${d.deleted_traces} traces.`);
      } else {
        setResult(d.detail || "Error");
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Data retention</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Set how long episodic memories and reasoning traces are kept.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Episodic memory (days)</label>
          <input type="number" min={1} value={episodic} onChange={(e) => setEpisodic(Number(e.target.value))} className="input" />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Reasoning traces (days)</label>
          <input type="number" min={1} value={traces} onChange={(e) => setTraces(Number(e.target.value))} className="input" />
        </div>
      </div>

      {result && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0 }}>{result}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving || !cloneHandle} className="btn" style={{ flex: 1, justifyContent: "center" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={runNow} disabled={running || !cloneHandle} className="btn btn--ghost">
          {running ? "Running…" : "Run now"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone preservation + legal hold panel
// ---------------------------------------------------------------------------

function PreservationPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [isPreserved, setIsPreserved] = useState(false);
  const [holdUntil, setHoldUntil] = useState("");
  const [holdDraft, setHoldDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => {
        setIsPreserved(d.is_preserved ?? false);
        setHoldUntil(d.legal_hold_until ?? "");
      })
      .catch(() => {});
  }, []);

  async function togglePreserve() {
    if (!cloneHandle) return;
    setSaving(true);
    try {
      const endpoint = isPreserved
        ? `/api/clones/${cloneHandle}/unpreserve`
        : `/api/clones/${cloneHandle}/preserve`;
      await fetch(endpoint, { method: "POST" });
      setIsPreserved((v) => !v);
    } finally {
      setSaving(false);
    }
  }

  async function setHold() {
    if (!cloneHandle || !holdDraft) return;
    setSaving(true);
    try {
      await fetch(`/api/clones/${cloneHandle}/legal-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: holdDraft }),
      });
      setHoldUntil(holdDraft);
      setHoldDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function clearHold() {
    if (!cloneHandle) return;
    setSaving(true);
    try {
      await fetch(`/api/clones/${cloneHandle}/legal-hold`, { method: "DELETE" });
      setHoldUntil("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Preservation</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Freeze your clone to prevent any new ingestion or data changes.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 3 }}>Preserve clone</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>
            {isPreserved ? "Clone is read-only. Ingestion and deletion are blocked." : "Clone is active."}
          </p>
        </div>
        <button
          onClick={togglePreserve}
          disabled={saving || !cloneHandle}
          style={{
            position: "relative", width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: isPreserved ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.08)",
            border: "none", cursor: "pointer", transition: "background 180ms",
            opacity: (saving || !cloneHandle) ? 0.4 : 1,
          }}
        >
          <span style={{
            position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff",
            transition: "transform 180ms", transform: isPreserved ? "translateX(18px)" : "translateX(2px)",
          }} />
        </button>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", margin: 0 }}>Legal hold</p>
        {holdUntil ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0 }}>
              Hold active until <span style={{ color: "rgba(255,255,255,0.60)" }}>{holdUntil}</span>. Deletion blocked.
            </p>
            <button onClick={clearHold} disabled={saving} className="btn btn--sm btn--ghost" style={{ color: "rgba(255,255,255,0.30)" }}>
              Clear
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={holdDraft} onChange={(e) => setHoldDraft(e.target.value)} className="input" style={{ flex: 1 }} />
            <button onClick={setHold} disabled={!holdDraft || saving || !cloneHandle} className="btn btn--sm">Set hold</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GDPR export + delete panel
// ---------------------------------------------------------------------------

function GdprPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadExport() {
    window.open("/api/clones/me/export", "_blank");
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await fetch("/api/clones/me", {
        method: "DELETE",
        headers: { "X-Confirm-Delete": "I_UNDERSTAND_THIS_IS_PERMANENT" },
      });
      window.location.href = "/";
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Your data rights</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          GDPR Articles 20 &amp; 17 — export or permanently delete all your data.
        </p>
      </div>

      <button onClick={downloadExport} disabled={!cloneHandle} className="btn" style={{ width: "100%", justifyContent: "flex-start" }}>
        Export all my data →
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>JSON download</span>
      </button>

      <button
        onClick={() => { setShowModal(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        disabled={!cloneHandle}
        className="btn"
        style={{ width: "100%", justifyContent: "center", color: "rgba(248,113,113,0.70)", borderColor: "rgba(248,113,113,0.15)", background: "transparent" }}
      >
        Delete all my data
      </button>

      {showModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.70)", backdropFilter: "blur(8px)",
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 400, margin: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>Are you absolutely sure?</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.6, margin: 0 }}>
              This will permanently delete your clone, all memories, and all reasoning traces. This action cannot be undone.
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              Type <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, Menlo, monospace" }}>DELETE</span> to confirm:
            </p>
            <input
              ref={inputRef}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="input"
              style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowModal(false); setConfirmText(""); }} className="btn btn--ghost" style={{ flex: 1, justifyContent: "center" }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="btn"
                style={{ flex: 1, justifyContent: "center", color: "rgba(248,113,113,0.80)", borderColor: "rgba(248,113,113,0.20)", background: "rgba(248,113,113,0.08)" }}
              >
                {deleting ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Cross-clone import panel
// ---------------------------------------------------------------------------

function CrossCloneImportPanel({ clones, targetClone }: { clones: CloneOwnerInfo[]; targetClone: CloneOwnerInfo }) {
  const sources = clones.filter(c => c.clone_id !== targetClone.clone_id);
  const [sourceHandle, setSourceHandle] = useState(sources[0]?.handle ?? "");
  const [types, setTypes] = useState<{ decision: boolean; voice: boolean }>({ decision: true, voice: true });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ decision?: number; voice?: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runImport() {
    if (!sourceHandle || (!types.decision && !types.voice)) return;
    setLoading(true); setErr(null); setResult(null);
    const selectedTypes = Object.entries(types).filter(([, v]) => v).map(([k]) => k);
    try {
      const res = await fetch(`/api/clones/${targetClone.handle}/import-from/${sourceHandle}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: selectedTypes }),
      });
      if (!res.ok) { setErr("Import failed."); return; }
      const data = await res.json();
      setResult(data.imported ?? {});
    } catch { setErr("Network error."); } finally { setLoading(false); }
  }

  if (sources.length === 0) return null;

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px" }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.55, margin: "0 0 14px" }}>
        Copy decision-making style or communication voice from one of your other clones into <strong style={{ color: "rgba(255,255,255,0.60)" }}>{targetClone.display_name}</strong>.
        Useful when you create a new focused clone and want it to share your reasoning patterns.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Import from</label>
          <SelectMenu
            value={sourceHandle}
            onChange={setSourceHandle}
            options={sources.map(c => ({ value: c.handle, label: c.display_name }))}
            className="w-full"
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 7 }}>What to import</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["decision", "voice"] as const).map(t => (
              <button key={t} onClick={() => setTypes(prev => ({ ...prev, [t]: !prev[t] }))}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: `1px solid ${types[t] ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`, background: types[t] ? "rgba(255,255,255,0.08)" : "transparent", color: types[t] ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.30)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 140ms" }}>
                {types[t] && <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                {t === "decision" ? "Decision style" : "Communication voice"}
              </button>
            ))}
          </div>
        </div>
        {err && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", margin: 0 }}>{err}</p>}
        {result && (
          <p style={{ fontSize: 11, color: "rgba(52,211,153,0.70)", margin: 0 }}>
            Imported: {Object.entries(result).map(([k, v]) => `${v} ${k} pattern${v !== 1 ? "s" : ""}`).join(", ")}
          </p>
        )}
        <button onClick={runImport} disabled={loading || (!types.decision && !types.voice)}
          style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 500, padding: "6px 16px", borderRadius: 9, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }}>
          {loading ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main settings page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { clones } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Account</p>
          <h1 className="db-h1">Settings</h1>
        </div>
        {clones.length > 1 && (
          <ClonePicker clones={clones} selected={clone ?? clones[0]} onSelect={c => setSelectedId(c.clone_id)} />
        )}
      </div>

      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Account shortcuts */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderRadius: 14, marginBottom: 16,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)", margin: 0 }}>Profile</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: "2px 0 0" }}>
              Name, bio, location.
            </p>
          </div>
          <Link href="/dashboard/profile" className="btn" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            Edit profile →
          </Link>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
          {[
            { label: "Activity", href: "/dashboard/activity" },
            { label: "Billing", href: "/dashboard/billing" },
          ].map(({ label, href }) => (
            <Link key={href} href={href} className="btn" style={{ flex: 1, justifyContent: "center" }}>
              {label} →
            </Link>
          ))}
        </div>

        {/* Clone-level settings */}
        {clone && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Cross-clone import */}
            {clones.length > 1 && (
              <>
                <p className="db-eyebrow" style={{ padding: "0 4px 8px", marginBottom: 0 }}>Import from another clone</p>
                <CrossCloneImportPanel clones={clones} targetClone={clone} />
              </>
            )}

            <p className="db-eyebrow" style={{ padding: clones.length > 1 ? "24px 4px 8px" : "0 4px 8px", marginBottom: 0 }}>Delegate policies</p>
            <AdminPoliciesPanel cloneHandle={clone.handle} />

            <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Data retention</p>
            <DataRetentionPanel cloneHandle={clone.handle} cloneId={clone.clone_id} />

            <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Preservation</p>
            <PreservationPanel cloneHandle={clone.handle} />

            <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Your data rights</p>
            <GdprPanel cloneHandle={clone.handle} />
          </div>
        )}
      </div>
    </div>
  );
}
