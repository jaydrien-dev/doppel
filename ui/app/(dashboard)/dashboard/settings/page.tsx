"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useClone } from "@/lib/hooks/useClone";
import { useOrg } from "@/lib/hooks/useOrg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Provider =
  | "anthropic" | "openai"
  | "google_client_id" | "google_client_secret"
  | "gmail_pubsub_topic" | "pubsub_verification_token"
  | "github_client_id" | "github_client_secret"
  | "notion_client_id" | "notion_client_secret"
  | "slack_client_id" | "slack_client_secret" | "slack_signing_secret"
  | "stripe_secret_key" | "stripe_webhook_secret"
  | "recall" | "elevenlabs";

interface KeyState {
  saved: string;
  draft: string;
  saving: boolean;
  clearing: boolean;
  revealed: boolean;
}

const PROVIDERS: {
  id: Provider;
  label: string;
  description: string;
  placeholder: string;
  group: string;
}[] = [
  { id: "anthropic", label: "Anthropic", description: "Brain reasoning — fast path, slow path, and style extraction.", placeholder: "sk-ant-api03-…", group: "llm" },
  { id: "openai", label: "OpenAI", description: "Text embeddings for memory ingestion.", placeholder: "sk-proj-…", group: "llm" },
  { id: "google_client_id", label: "Google Client ID", description: "Google OAuth app Client ID — enables Gmail connect.", placeholder: "123456789-abc….apps.googleusercontent.com", group: "google" },
  { id: "google_client_secret", label: "Google Client Secret", description: "Google OAuth app Client Secret.", placeholder: "GOCSPX-…", group: "google" },
  { id: "gmail_pubsub_topic", label: "Gmail Pub/Sub Topic", description: "GCP Pub/Sub topic for Gmail push notifications. Format: projects/{project}/topics/{topic}", placeholder: "projects/your-project/topics/gmail-push", group: "gmail_push" },
  { id: "pubsub_verification_token", label: "Pub/Sub Verification Token", description: "Random token appended to the push endpoint URL to verify Pub/Sub messages.", placeholder: "random-secret-token", group: "gmail_push" },
  { id: "github_client_id", label: "GitHub Client ID", description: "GitHub OAuth app Client ID — enables GitHub commit/PR ingestion.", placeholder: "Ov23li…", group: "github" },
  { id: "github_client_secret", label: "GitHub Client Secret", description: "GitHub OAuth app Client Secret.", placeholder: "a1b2c3d4…", group: "github" },
  { id: "notion_client_id", label: "Notion Client ID", description: "Notion integration Client ID — enables page ingestion.", placeholder: "a1b2c3d4-…", group: "notion" },
  { id: "notion_client_secret", label: "Notion Client Secret", description: "Notion integration Client Secret.", placeholder: "secret_…", group: "notion" },
  { id: "slack_client_id", label: "Slack Client ID", description: "Slack app Client ID — enables Slack bot installation.", placeholder: "1234567890.123…", group: "slack" },
  { id: "slack_client_secret", label: "Slack Client Secret", description: "Slack app Client Secret.", placeholder: "a1b2c3…", group: "slack" },
  { id: "slack_signing_secret", label: "Slack Signing Secret", description: "Used to verify that events come from Slack. Found under Basic Information in your Slack app.", placeholder: "a1b2c3d4e5f6…", group: "slack" },
  { id: "stripe_secret_key", label: "Stripe Secret Key", description: "Enables billing — subscription creation, customer portal, and invoice management.", placeholder: "sk_live_…", group: "stripe" },
  { id: "stripe_webhook_secret", label: "Stripe Webhook Secret", description: "Verifies webhook payloads from Stripe. Found in the Webhooks dashboard after adding an endpoint.", placeholder: "whsec_…", group: "stripe" },
  { id: "recall", label: "Recall.ai API Key", description: "Enables meeting bot — joins Zoom, Meet, and Teams calls.", placeholder: "Token …", group: "recall" },
  { id: "elevenlabs", label: "ElevenLabs API Key", description: "Voice cloning and synthesis — speak in your own voice.", placeholder: "sk_…", group: "elevenlabs" },
];

// ---------------------------------------------------------------------------
// Key card component
// ---------------------------------------------------------------------------

function KeyCard({
  provider,
  label,
  description,
  placeholder,
  keyState,
  onChange,
  onSave,
  onClear,
  onReveal,
}: {
  provider: Provider;
  label: string;
  description: string;
  placeholder: string;
  keyState: KeyState;
  onChange: (val: string) => void;
  onSave: () => void;
  onClear: () => void;
  onReveal: () => void;
}) {
  const isSaved = !!keyState.saved;
  const isDirty = keyState.draft !== "";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 3, marginBottom: 0 }}>{description}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type={keyState.revealed ? "text" : "password"}
            value={keyState.draft || (isSaved ? keyState.saved : "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isSaved ? keyState.saved : `Using platform key · ${placeholder}`}
            className="input"
            style={{ fontFamily: "ui-monospace, Menlo, monospace", paddingRight: 36 }}
          />
          <button
            onClick={onReveal}
            title={keyState.revealed ? "Hide" : "Reveal"}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.25)", padding: 0, display: "flex", alignItems: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              {keyState.revealed ? (
                <path d="M1 6.5C1 6.5 3 2.5 6.5 2.5S12 6.5 12 6.5 10 10.5 6.5 10.5 1 6.5 1 6.5z M6.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M1 1l11 11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              ) : (
                <path d="M1 6.5C1 6.5 3 2.5 6.5 2.5S12 6.5 12 6.5 10 10.5 6.5 10.5 1 6.5 1 6.5z M6.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              )}
            </svg>
          </button>
        </div>

        <button onClick={onSave} disabled={!isDirty || keyState.saving} className="btn btn--sm">
          {keyState.saving ? "Saving…" : "Save"}
        </button>

        {isSaved && (
          <button onClick={onClear} disabled={keyState.clearing} className="btn btn--sm btn--ghost">
            {keyState.clearing ? "…" : "Clear"}
          </button>
        )}
      </div>

      {isSaved && !isDirty && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>Key saved · using your key</p>
      )}
      {!isSaved && !isDirty && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>Not set · falling back to platform key</p>
      )}
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

function DataRetentionPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [episodic, setEpisodic] = useState(730);
  const [traces, setTraces] = useState(365);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => {
        if (d.retention_days_episodic) setEpisodic(d.retention_days_episodic);
        if (d.retention_days_traces) setTraces(d.retention_days_traces);
      })
      .catch(() => {});
  }, []);

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
// Knowledge Handoff panel
// ---------------------------------------------------------------------------

function HandoffPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [status, setStatus] = useState<"not_started" | "generating" | "complete" | "failed" | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!cloneHandle) return;
    fetch(`/api/handoff/report?handle=${cloneHandle}`)
      .then((r) => r.json())
      .then((d) => {
        setStatus(d.status ?? "not_started");
        setGeneratedAt(d.generated_at ?? null);
      })
      .catch(() => setStatus("not_started"));
  }, [cloneHandle]);

  if (!cloneHandle || status === null) return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Knowledge handoff</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Capture everything you know before moving on — a structured transfer report for your successor.
        </p>
      </div>

      {status === "complete" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="badge badge--pos">
            <span className="badge__dot" />
            Report ready{generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString()}` : ""}
          </span>
          <Link href="/dashboard/handoff" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            View report →
          </Link>
        </div>
      ) : status === "generating" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.20)", borderTopColor: "rgba(255,255,255,0.50)",
            animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0 }}>Generating report…</p>
        </div>
      ) : (
        <Link href="/dashboard/handoff" className="btn" style={{ width: "100%", justifyContent: "center" }}>
          Generate transfer report →
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSO Config panel (org admin only)
// ---------------------------------------------------------------------------

function SsoPanel({ isOrgOwner }: { isOrgOwner: boolean }) {
  const [provider, setProvider] = useState("okta");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [entityId, setEntityId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    if (!isOrgOwner) return;
    fetch("/api/org/sso-config")
      .then((r) => r.json())
      .then((d) => {
        if (d.configured) {
          setConfigured(true);
          setProvider(d.provider ?? "okta");
          setMetadataUrl(d.metadata_url ?? "");
          setEntityId(d.entity_id ?? "");
        }
      })
      .catch(() => {});
  }, [isOrgOwner]);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/org/sso-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, metadata_url: metadataUrl, entity_id: entityId }),
      });
      setConfigured(true);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    const r = await fetch("/api/org/sso-config/test", { method: "POST" });
    const d = await r.json();
    setTestResult(d.message ?? d.status);
  }

  if (!isOrgOwner) return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>SSO configuration</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Configure SAML / OIDC single sign-on for your organisation.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input">
            <option value="okta">Okta</option>
            <option value="azure_ad">Azure AD</option>
            <option value="google_workspace">Google Workspace</option>
            <option value="saml_generic">Generic SAML 2.0</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Metadata URL</label>
          <input type="url" value={metadataUrl} onChange={(e) => setMetadataUrl(e.target.value)} placeholder="https://…" className="input" />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Entity ID</label>
          <input type="text" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="https://…" className="input" />
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 12 }}>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", lineHeight: 1.6, margin: 0 }}>
          SSO activation requires support. Save your config then contact{" "}
          <a href="mailto:support@doppel.ai" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "underline" }}>support@doppel.ai</a> to enable.
        </p>
      </div>

      {testResult && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0 }}>{testResult}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} className="btn" style={{ flex: 1, justifyContent: "center" }}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {configured && (
          <button onClick={test} className="btn btn--ghost">Test</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile settings panel
// ---------------------------------------------------------------------------
function ProfilePanel() {
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    const meta = user.unsafeMetadata as { dob?: string; phone?: string } | undefined;
    setDob(meta?.dob ?? "");
    setPhone(meta?.phone ?? "");
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        unsafeMetadata: { dob: dob.trim(), phone: phone.trim() },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user || deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      await user.delete();
    } catch {
      setDeleting(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
        <p className="db-eyebrow" style={{ margin: 0 }}>Profile</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="input" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className="input" />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Email address</label>
          <input
            value={user?.primaryEmailAddress?.emailAddress ?? ""}
            readOnly
            className="input"
            style={{ color: "rgba(255,255,255,0.35)", cursor: "not-allowed" }}
          />
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 4, marginBottom: 0 }}>
            Email changes are managed through account security settings.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="input" style={{ colorScheme: "dark" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="input" />
          </div>
        </div>

        <div>
          <button onClick={handleSave} disabled={saving} className="btn btn--primary">
            {saving ? "Saving…" : saved ? "Saved" : "Save profile"}
          </button>
        </div>
      </div>

      <div style={{ borderRadius: 16, padding: 24, marginBottom: 32, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.12)" }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(248,113,113,0.50)", marginBottom: 4 }}>
          Danger zone
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginBottom: 16 }}>
          Permanently delete your account, all clones, and associated data. This cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          style={{
            borderRadius: 12, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)", color: "rgba(248,113,113,0.70)",
          }}
        >
          Delete account
        </button>
      </div>

      {showDeleteModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div style={{ borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, background: "#111", border: "1px solid rgba(248,113,113,0.20)", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0 }}>Delete account</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", lineHeight: 1.6, margin: 0 }}>
              This permanently deletes your account, all clones, training data, and earnings history. There is no recovery.
            </p>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", display: "block" }}>
              Type <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "rgba(255,255,255,0.60)" }}>DELETE</span> to confirm
            </label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="input"
              style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== "DELETE" || deleting}
                style={{
                  flex: 1, borderRadius: 12, padding: "10px 0", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                  background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "rgba(248,113,113,0.80)",
                  opacity: (deleteConfirm !== "DELETE" || deleting) ? 0.4 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }} className="btn btn--ghost" style={{ padding: "10px 20px" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main settings page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { clone } = useClone();
  const { org } = useOrg();

  const [keys, setKeys] = useState<Record<Provider, KeyState>>(
    () =>
      Object.fromEntries(
        PROVIDERS.map(({ id }) => [
          id,
          { saved: "", draft: "", saving: false, clearing: false, revealed: false },
        ])
      ) as Record<Provider, KeyState>
  );

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((data: Record<Provider, string>) => {
        setKeys((prev) => {
          const next = { ...prev };
          for (const id of PROVIDERS.map((p) => p.id)) {
            next[id] = { ...next[id], saved: data[id] ?? "" };
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);

  function updateKey(id: Provider, partial: Partial<KeyState>) {
    setKeys((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }));
  }

  async function handleSave(id: Provider) {
    const draft = keys[id].draft.trim();
    if (!draft) return;
    updateKey(id, { saving: true });
    try {
      await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id, key: draft }),
      });
      updateKey(id, { saved: draft.slice(0, 8) + "****", draft: "", saving: false });
    } catch {
      updateKey(id, { saving: false });
    }
  }

  async function handleClear(id: Provider) {
    updateKey(id, { clearing: true });
    try {
      await fetch(`/api/keys/${id}`, { method: "DELETE" });
      updateKey(id, { saved: "", draft: "", clearing: false });
    } catch {
      updateKey(id, { clearing: false });
    }
  }

  const FASTAPI = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app";

  const KEY_GROUPS: { label: string; group: string; hint?: React.ReactNode }[] = [
    { label: "LLM", group: "llm" },
    {
      label: "Google OAuth", group: "google",
      hint: <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, margin: 0 }}>
        Create a Google Cloud project, enable the Gmail API, and add{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>{FASTAPI}/ingestion/gmail/callback</code>{" "}
        as an authorized redirect URI.
      </p>,
    },
    {
      label: "Gmail Push (Pub/Sub)", group: "gmail_push",
      hint: <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, margin: 0 }}>
        Required for auto-receive — new emails generate drafts automatically. Create a Pub/Sub topic in GCP, grant{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>gmail-api-push@system.gserviceaccount.com</code>{" "}
        Pub/Sub Publisher role, then add a push subscription pointing to{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>{FASTAPI}/ingestion/gmail/push-event?token=&lt;your-token&gt;</code>.
      </p>,
    },
    {
      label: "GitHub OAuth", group: "github",
      hint: <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, margin: 0 }}>
        Create a GitHub OAuth app. Set the callback to{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>{FASTAPI}/ingestion/github/callback</code>.
      </p>,
    },
    {
      label: "Notion Integration", group: "notion",
      hint: <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, margin: 0 }}>
        Create a Notion integration at{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>notion.so/my-integrations</code>.
        Set redirect URI to{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>{FASTAPI}/ingestion/notion/callback</code>.
      </p>,
    },
    {
      label: "Slack Bot", group: "slack",
      hint: <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, margin: 0 }}>
        Create a Slack app at{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>api.slack.com/apps</code>.
        Enable OAuth and add{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>{FASTAPI}/slack/oauth/callback</code>{" "}
        as a redirect URI. The signing secret is under Basic Information.
      </p>,
    },
    {
      label: "Stripe", group: "stripe",
      hint: <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, margin: 0 }}>
        Get your keys from the{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>Developers → API keys</code> page in the Stripe dashboard.
        Add a webhook endpoint pointing to{" "}
        <code style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 4 }}>{FASTAPI}/stripe/webhook</code>{" "}
        and copy the webhook signing secret.
      </p>,
    },
    { label: "Recall.ai", group: "recall" },
    { label: "ElevenLabs Voice", group: "elevenlabs" },
  ];

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Account</p>
          <h1 className="db-h1">Settings</h1>
        </div>
      </div>

      <div style={{ maxWidth: 640 }}>

        <ProfilePanel />

        <p className="db-eyebrow" style={{ marginBottom: 8 }}>API keys</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginBottom: 24 }}>
          Add your own API keys. Leave empty to use the platform&apos;s keys.
        </p>

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

        {!clone && (
          <div className="card" style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>Create your clone first to save API keys.</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {KEY_GROUPS.map(({ label, group, hint }) => {
            const groupProviders = PROVIDERS.filter((p) => p.group === group);
            return (
              <div key={group}>
                <p className="db-eyebrow" style={{ padding: "16px 4px 8px", marginBottom: 0 }}>{label}</p>
                {hint && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    {hint}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {groupProviders.map((p) => (
                    <KeyCard
                      key={p.id}
                      provider={p.id}
                      label={p.label}
                      description={p.description}
                      placeholder={p.placeholder}
                      keyState={keys[p.id]}
                      onChange={(val) => updateKey(p.id, { draft: val })}
                      onSave={() => handleSave(p.id)}
                      onClear={() => handleClear(p.id)}
                      onReveal={() => updateKey(p.id, { revealed: !keys[p.id].revealed })}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Admin policies</p>
          <AdminPoliciesPanel cloneHandle={clone?.handle ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Data retention</p>
          <DataRetentionPanel cloneHandle={clone?.handle ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Preservation</p>
          <PreservationPanel cloneHandle={clone?.handle ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Your data rights</p>
          <GdprPanel cloneHandle={clone?.handle ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Knowledge handoff</p>
          <HandoffPanel cloneHandle={clone?.handle ?? null} />

          {org && (
            <>
              <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>SSO configuration</p>
              <SsoPanel isOrgOwner={org.is_owner ?? false} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
