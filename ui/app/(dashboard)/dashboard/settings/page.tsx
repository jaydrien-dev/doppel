"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  saved: string;   // masked value from server ("" = not set)
  draft: string;   // what the user is typing
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
  // LLM
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Brain reasoning — fast path, slow path, and style extraction.",
    placeholder: "sk-ant-api03-…",
    group: "llm",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Text embeddings for memory ingestion.",
    placeholder: "sk-proj-…",
    group: "llm",
  },
  // Google / Gmail OAuth
  {
    id: "google_client_id",
    label: "Google Client ID",
    description: "Google OAuth app Client ID — enables Gmail connect.",
    placeholder: "123456789-abc….apps.googleusercontent.com",
    group: "google",
  },
  {
    id: "google_client_secret",
    label: "Google Client Secret",
    description: "Google OAuth app Client Secret.",
    placeholder: "GOCSPX-…",
    group: "google",
  },
  // Gmail Push (Pub/Sub)
  {
    id: "gmail_pubsub_topic",
    label: "Gmail Pub/Sub Topic",
    description: "GCP Pub/Sub topic for Gmail push notifications. Format: projects/{project}/topics/{topic}",
    placeholder: "projects/your-project/topics/gmail-push",
    group: "gmail_push",
  },
  {
    id: "pubsub_verification_token",
    label: "Pub/Sub Verification Token",
    description: "Random token appended to the push endpoint URL to verify Pub/Sub messages.",
    placeholder: "random-secret-token",
    group: "gmail_push",
  },
  // GitHub
  {
    id: "github_client_id",
    label: "GitHub Client ID",
    description: "GitHub OAuth app Client ID — enables GitHub commit/PR ingestion.",
    placeholder: "Ov23li…",
    group: "github",
  },
  {
    id: "github_client_secret",
    label: "GitHub Client Secret",
    description: "GitHub OAuth app Client Secret.",
    placeholder: "a1b2c3d4…",
    group: "github",
  },
  // Notion
  {
    id: "notion_client_id",
    label: "Notion Client ID",
    description: "Notion integration Client ID — enables page ingestion.",
    placeholder: "a1b2c3d4-…",
    group: "notion",
  },
  {
    id: "notion_client_secret",
    label: "Notion Client Secret",
    description: "Notion integration Client Secret.",
    placeholder: "secret_…",
    group: "notion",
  },
  // Slack
  {
    id: "slack_client_id",
    label: "Slack Client ID",
    description: "Slack app Client ID — enables Slack bot installation.",
    placeholder: "1234567890.123…",
    group: "slack",
  },
  {
    id: "slack_client_secret",
    label: "Slack Client Secret",
    description: "Slack app Client Secret.",
    placeholder: "a1b2c3…",
    group: "slack",
  },
  {
    id: "slack_signing_secret",
    label: "Slack Signing Secret",
    description: "Used to verify that events come from Slack. Found under Basic Information in your Slack app.",
    placeholder: "a1b2c3d4e5f6…",
    group: "slack",
  },
  // Stripe
  {
    id: "stripe_secret_key",
    label: "Stripe Secret Key",
    description: "Enables billing — subscription creation, customer portal, and invoice management.",
    placeholder: "sk_live_…",
    group: "stripe",
  },
  {
    id: "stripe_webhook_secret",
    label: "Stripe Webhook Secret",
    description: "Verifies webhook payloads from Stripe. Found in the Webhooks dashboard after adding an endpoint.",
    placeholder: "whsec_…",
    group: "stripe",
  },
  // Recall.ai
  {
    id: "recall",
    label: "Recall.ai API Key",
    description: "Enables meeting bot — joins Zoom, Meet, and Teams calls.",
    placeholder: "Token …",
    group: "recall",
  },
  // ElevenLabs
  {
    id: "elevenlabs",
    label: "ElevenLabs API Key",
    description: "Voice cloning and synthesis — speak in your own voice.",
    placeholder: "sk_…",
    group: "elevenlabs",
  },
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
    <div className="glass rounded-2xl p-5 space-y-3">
      <div>
        <p className="text-sm font-medium text-white/80">{label}</p>
        <p className="text-xs text-white/35 mt-0.5">{description}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={keyState.revealed ? "text" : "password"}
            value={keyState.draft || (isSaved ? keyState.saved : "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isSaved ? keyState.saved : `Using platform key · ${placeholder}`}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors font-mono"
          />
          {/* Reveal toggle */}
          <button
            onClick={onReveal}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
            title={keyState.revealed ? "Hide" : "Reveal"}
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

        <button
          onClick={onSave}
          disabled={!isDirty || keyState.saving}
          className="shrink-0 px-3 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {keyState.saving ? "Saving…" : "Save"}
        </button>

        {isSaved && (
          <button
            onClick={onClear}
            disabled={keyState.clearing}
            className="shrink-0 px-3 py-2 rounded-xl text-xs text-white/35 hover:text-white/55 transition-colors disabled:opacity-30"
          >
            {keyState.clearing ? "…" : "Clear"}
          </button>
        )}
      </div>

      {isSaved && !isDirty && (
        <p className="text-[11px] text-white/30">
          Key saved · using your key
        </p>
      )}
      {!isSaved && !isDirty && (
        <p className="text-[11px] text-white/25">
          Not set · falling back to platform key
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
        policies: {
          blocked_topics: blockedTopics,
          escalation_threshold: escalationThreshold,
          require_human_review: requireHumanReview,
        },
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
    <div className="glass rounded-2xl p-5 space-y-5">
      <p className="text-xs text-white/35 leading-relaxed">
        Control what your clone will and won&apos;t respond to. These policies apply to all surfaces.
      </p>

      {/* Blocked topics */}
      <div>
        <p className="text-xs text-white/50 font-medium mb-2">Blocked topics</p>
        <p className="text-[11px] text-white/25 mb-3">
          Your clone will decline any question touching these topics.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {blockedTopics.map((t) => (
            <span key={t} className="flex items-center gap-1 text-xs text-white/55 bg-red-400/[0.07] border border-red-400/15 rounded-lg px-2.5 py-1">
              {t}
              <button onClick={() => setBlockedTopics((prev) => prev.filter((x) => x !== t))}
                className="text-white/25 hover:text-red-400/70 transition-colors ml-1 text-[10px]">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopic()}
            placeholder="e.g. salary, competitors, legal advice"
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/60 placeholder:text-white/20 outline-none focus:border-white/15 transition-colors"
          />
          <button onClick={addTopic} className="text-xs text-white/30 hover:text-white/55 transition-colors px-3">Add</button>
        </div>
      </div>

      {/* Escalation threshold */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-white/50 font-medium">Escalation threshold</p>
          <span className="text-xs text-white/35 font-mono">{escalationThreshold}%</span>
        </div>
        <p className="text-[11px] text-white/25 mb-3">
          Responses below this confidence level will be flagged for human review.
        </p>
        <input
          type="range"
          min={10}
          max={90}
          value={escalationThreshold}
          onChange={(e) => setEscalationThreshold(Number(e.target.value))}
          className="w-full accent-white/50 h-1"
        />
        <div className="flex justify-between text-[10px] text-white/20 mt-1">
          <span>10% (rarely escalate)</span>
          <span>90% (almost always)</span>
        </div>
      </div>

      {/* Human review gate */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50 font-medium">Require human review for all responses</p>
          <p className="text-[11px] text-white/25">Clone drafts but never auto-sends — you approve every response.</p>
        </div>
        <button
          onClick={() => setRequireHumanReview((v) => !v)}
          className={`relative w-9 h-5 rounded-full transition-colors ${requireHumanReview ? "bg-white/30" : "bg-white/[0.08]"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${requireHumanReview ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      <button
        onClick={save}
        disabled={saving || !cloneHandle}
        className="w-full py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
      >
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
    <div className="glass rounded-2xl p-5 space-y-5">
      <div>
        <p className="text-sm font-medium text-white/80">Data retention</p>
        <p className="text-xs text-white/35 mt-0.5">
          Set how long episodic memories and reasoning traces are kept.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-white/35 mb-1.5">Episodic memory (days)</label>
          <input
            type="number"
            min={1}
            value={episodic}
            onChange={(e) => setEpisodic(Number(e.target.value))}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 outline-none focus:border-white/20"
          />
        </div>
        <div>
          <label className="block text-[11px] text-white/35 mb-1.5">Reasoning traces (days)</label>
          <input
            type="number"
            min={1}
            value={traces}
            onChange={(e) => setTraces(Number(e.target.value))}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 outline-none focus:border-white/20"
          />
        </div>
      </div>

      {result && (
        <p className="text-xs text-white/40">{result}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || !cloneHandle}
          className="flex-1 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={runNow}
          disabled={running || !cloneHandle}
          className="py-2 px-4 rounded-xl text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-40"
        >
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
    <div className="glass rounded-2xl p-5 space-y-5">
      <div>
        <p className="text-sm font-medium text-white/80">Preservation</p>
        <p className="text-xs text-white/35 mt-0.5">
          Freeze your clone to prevent any new ingestion or data changes.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50 font-medium">Preserve clone</p>
          <p className="text-[11px] text-white/25">
            {isPreserved ? "Clone is read-only. Ingestion and deletion are blocked." : "Clone is active."}
          </p>
        </div>
        <button
          onClick={togglePreserve}
          disabled={saving || !cloneHandle}
          className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${isPreserved ? "bg-white/30" : "bg-white/[0.08]"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPreserved ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="border-t border-white/[0.06] pt-4 space-y-2">
        <p className="text-xs text-white/50 font-medium">Legal hold</p>
        {holdUntil ? (
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/40">
              Hold active until <span className="text-white/60">{holdUntil}</span>. Deletion blocked.
            </p>
            <button
              onClick={clearHold}
              disabled={saving}
              className="text-[11px] text-white/30 hover:text-red-400/70 transition-colors disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="date"
              value={holdDraft}
              onChange={(e) => setHoldDraft(e.target.value)}
              className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/60 outline-none focus:border-white/20"
            />
            <button
              onClick={setHold}
              disabled={!holdDraft || saving || !cloneHandle}
              className="px-4 py-2 rounded-xl text-xs text-white/50 glass hover:glass-md transition-all disabled:opacity-40"
            >
              Set hold
            </button>
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
    <div className="glass rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-white/80">Your data rights</p>
        <p className="text-xs text-white/35 mt-0.5">
          GDPR Articles 20 &amp; 17 — export or permanently delete all your data.
        </p>
      </div>

      <button
        onClick={downloadExport}
        disabled={!cloneHandle}
        className="w-full py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40 text-left px-4"
      >
        Export all my data →
        <span className="ml-2 text-white/25 text-[11px]">JSON download</span>
      </button>

      <button
        onClick={() => { setShowModal(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        disabled={!cloneHandle}
        className="w-full py-2 rounded-xl text-xs text-red-400/70 hover:text-red-400 border border-red-400/15 hover:border-red-400/30 transition-all disabled:opacity-40"
      >
        Delete all my data
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4">
            <p className="text-sm font-medium text-white/80">Are you absolutely sure?</p>
            <p className="text-xs text-white/40 leading-relaxed">
              This will permanently delete your clone, all memories, and all reasoning traces.
              This action cannot be undone.
            </p>
            <p className="text-[11px] text-white/35">Type <span className="text-white/60 font-mono">DELETE</span> to confirm:</p>
            <input
              ref={inputRef}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/20 outline-none focus:border-red-400/30 font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowModal(false); setConfirmText(""); }}
                className="flex-1 py-2 rounded-xl text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="flex-1 py-2 rounded-xl text-xs text-red-400/80 border border-red-400/20 hover:border-red-400/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="glass rounded-2xl p-5 space-y-3">
      <div>
        <p className="text-sm font-medium text-white/80">Knowledge handoff</p>
        <p className="text-xs text-white/35 mt-0.5">
          Capture everything you know before moving on — a structured transfer report for your successor.
        </p>
      </div>

      {status === "complete" ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
            <p className="text-xs text-white/55">
              Report ready{generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <Link
            href="/dashboard/handoff"
            className="text-xs text-white/45 hover:text-white/65 transition-colors underline underline-offset-2"
          >
            View report →
          </Link>
        </div>
      ) : status === "generating" ? (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-white/20 border-t-white/50 animate-spin" />
          <p className="text-xs text-white/40">Generating report…</p>
        </div>
      ) : (
        <Link
          href="/dashboard/handoff"
          className="block w-full py-2 px-4 rounded-xl text-xs text-white/55 hover:text-white/75 glass hover:glass-md transition-all text-center"
        >
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
    <div className="glass rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-white/80">SSO configuration</p>
        <p className="text-xs text-white/35 mt-0.5">
          Configure SAML / OIDC single sign-on for your organisation.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] text-white/35 mb-1.5">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 outline-none focus:border-white/20"
          >
            <option value="okta">Okta</option>
            <option value="azure_ad">Azure AD</option>
            <option value="google_workspace">Google Workspace</option>
            <option value="saml_generic">Generic SAML 2.0</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-white/35 mb-1.5">Metadata URL</label>
          <input
            type="url"
            value={metadataUrl}
            onChange={(e) => setMetadataUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20"
          />
        </div>
        <div>
          <label className="block text-[11px] text-white/35 mb-1.5">Entity ID</label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="https://…"
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div className="glass rounded-xl p-3">
        <p className="text-[11px] text-white/40 leading-relaxed">
          SSO activation requires support. Save your config then contact{" "}
          <a href="mailto:support@doppel.ai" className="text-white/55 underline">support@doppel.ai</a> to enable.
        </p>
      </div>

      {testResult && <p className="text-xs text-white/40">{testResult}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {configured && (
          <button
            onClick={test}
            className="px-4 py-2 rounded-xl text-xs text-white/35 hover:text-white/55 transition-colors"
          >
            Test
          </button>
        )}
      </div>
    </div>
  );
}


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

  // Load saved (masked) keys on mount
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

  const KEY_GROUPS: { label: string; group: string; hint?: React.ReactNode }[] = [
    { label: "LLM", group: "llm" },
    {
      label: "Google OAuth",
      group: "google",
      hint: (
        <p className="text-xs text-white/30 leading-relaxed mb-3">
          Create a Google Cloud project, enable the Gmail API, and add{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">
            {(process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app")}/ingestion/gmail/callback
          </code>{" "}
          as an authorized redirect URI.
        </p>
      ),
    },
    {
      label: "Gmail Push (Pub/Sub)",
      group: "gmail_push",
      hint: (
        <p className="text-xs text-white/30 leading-relaxed mb-3">
          Required for auto-receive — new emails generate drafts automatically. Create a Pub/Sub topic in GCP, grant{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">gmail-api-push@system.gserviceaccount.com</code>{" "}
          Pub/Sub Publisher role, then add a push subscription pointing to{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">
            {(process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app")}/ingestion/gmail/push-event?token=&lt;your-token&gt;
          </code>.
        </p>
      ),
    },
    {
      label: "GitHub OAuth",
      group: "github",
      hint: (
        <p className="text-xs text-white/30 leading-relaxed mb-3">
          Create a GitHub OAuth app. Set the callback to{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">
            {(process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app")}/ingestion/github/callback
          </code>.
        </p>
      ),
    },
    {
      label: "Notion Integration",
      group: "notion",
      hint: (
        <p className="text-xs text-white/30 leading-relaxed mb-3">
          Create a Notion integration at{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">notion.so/my-integrations</code>.
          Set redirect URI to{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">
            {(process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app")}/ingestion/notion/callback
          </code>.
        </p>
      ),
    },
    {
      label: "Slack Bot",
      group: "slack",
      hint: (
        <p className="text-xs text-white/30 leading-relaxed mb-3">
          Create a Slack app at{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">api.slack.com/apps</code>.
          Enable OAuth and add{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">
            {(process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app")}/slack/oauth/callback
          </code>{" "}
          as a redirect URI. The signing secret is under Basic Information.
        </p>
      ),
    },
    {
      label: "Stripe",
      group: "stripe",
      hint: (
        <p className="text-xs text-white/30 leading-relaxed mb-3">
          Get your keys from the{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">Developers → API keys</code> page in the Stripe dashboard.
          Add a webhook endpoint pointing to{" "}
          <code className="text-white/45 bg-white/[0.06] px-1 rounded">
            {(process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app")}/stripe/webhook
          </code>{" "}
          and copy the webhook signing secret.
        </p>
      ),
    },
    { label: "Recall.ai", group: "recall" },
    { label: "ElevenLabs Voice", group: "elevenlabs" },
  ];

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-white/85">Settings</h1>
        <p className="text-sm text-white/35 mt-1">
          Add your own API keys. Leave empty to use the platform&apos;s keys.
        </p>
      </div>

      {/* Account quick-links */}
      <div className="flex gap-2 mb-8">
        {[
          { label: "Usage", href: "/dashboard/usage" },
          { label: "Activity", href: "/dashboard/activity" },
          { label: "Billing", href: "/dashboard/billing" },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 py-2 rounded-xl text-xs text-white/45 hover:text-white/65 glass hover:glass-md transition-all text-center"
          >
            {label} →
          </Link>
        ))}
      </div>

      {!clone && (
        <div className="glass rounded-2xl p-5 mb-6">
          <p className="text-sm text-white/35">Create your clone first to save API keys.</p>
        </div>
      )}

      <div className="space-y-3">
        {KEY_GROUPS.map(({ label, group, hint }) => {
          const groupProviders = PROVIDERS.filter((p) => p.group === group);
          return (
            <div key={group}>
              <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-4 pb-2">{label}</p>
              {hint && <div className="glass rounded-xl p-4 mb-3">{hint}</div>}
              <div className="space-y-3">
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

        {/* Admin policies */}
        <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-6 pb-2">Admin policies</p>
        <AdminPoliciesPanel cloneHandle={clone?.handle ?? null} />

        {/* Data retention */}
        <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-6 pb-2">Data retention</p>
        <DataRetentionPanel cloneHandle={clone?.handle ?? null} />

        {/* Preservation + legal hold */}
        <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-6 pb-2">Preservation</p>
        <PreservationPanel cloneHandle={clone?.handle ?? null} />

        {/* GDPR */}
        <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-6 pb-2">Your data rights</p>
        <GdprPanel cloneHandle={clone?.handle ?? null} />

        {/* Knowledge Handoff */}
        <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-6 pb-2">Knowledge handoff</p>
        <HandoffPanel cloneHandle={clone?.handle ?? null} />

        {/* SSO — org admin only */}
        {org && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-white/25 px-1 pt-6 pb-2">SSO configuration</p>
            <SsoPanel isOrgOwner={org.is_owner ?? false} />
          </>
        )}
      </div>
    </div>
  );
}

