"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import type { EmailDraft } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filter = "pending" | "approved" | "edited" | "rejected" | "sent" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Needs review" },
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "edited", label: "Edited" },
  { value: "sent", label: "Sent" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusBadge(status: string) {
  if (status === "sent") return <span className="badge badge--pos"><span className="badge__dot" />sent</span>;
  if (status === "pending") return <span className="badge badge--warn"><span className="badge__dot" />needs review</span>;
  if (status === "edited") return <span className="badge badge--neutral">edited</span>;
  if (status === "rejected") return <span className="badge badge--neg">rejected</span>;
  return <span className="badge badge--neutral">{status}</span>;
}

function DraftCard({
  draft,
  cloneId,
  onUpdated,
}: {
  draft: EmailDraft;
  cloneId: string;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(draft.status === "pending");
  const [editMode, setEditMode] = useState(false);
  const [editedText, setEditedText] = useState(draft.draft);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  async function review(status: "approved" | "edited" | "rejected", edited?: string) {
    setSaving(true);
    try {
      await fetch(`/api/email/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, edited_version: edited ?? null }),
      });
      onUpdated();
    } finally {
      setSaving(false);
      setEditMode(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      await fetch(`/api/email/drafts/${draft.id}/send`, { method: "POST" });
      onUpdated();
    } finally {
      setSending(false);
    }
  }

  const isPending = draft.status === "pending";
  const canSend = draft.status === "approved" || draft.status === "edited";

  return (
    <div style={{ opacity: !isPending ? 0.65 : 1, transition: "opacity 200ms" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%", padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 14,
            textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {draft.subject}
              </p>
              {statusBadge(draft.status)}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              From {draft.sender} · {formatDate(draft.received_at)}
            </p>
          </div>
          <svg
            width="11" height="11" viewBox="0 0 11 11" fill="none"
            style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0, marginTop: 2, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
          >
            <path d="M1.5 3.5l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {expanded && (
          <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {/* Original email */}
            <div style={{ paddingTop: 16 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
                Original email
              </p>
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 12, padding: "10px 14px",
              }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0,
                  display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {draft.body}
                </p>
              </div>
            </div>

            {/* Draft */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: 0 }}>
                  Clone draft
                </p>
                {isPending && !editMode && (
                  <button onClick={() => setEditMode(true)} className="btn btn--ghost btn--sm">Edit</button>
                )}
              </div>

              {editMode ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={6}
                  className="input"
                  style={{ resize: "none", lineHeight: 1.6 }}
                />
              ) : (
                <div style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12, padding: "10px 14px",
                }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>
                    {draft.edited_version ?? draft.draft}
                  </p>
                </div>
              )}

              {draft.reasoning && (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8, fontStyle: "italic" }}>
                  {draft.reasoning}
                </p>
              )}
            </div>

            {/* Actions */}
            {(isPending || canSend) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isPending && editMode ? (
                  <>
                    <button onClick={() => review("edited", editedText)} disabled={saving} className="btn btn--primary">
                      {saving ? "Saving…" : "Save & approve"}
                    </button>
                    <button onClick={() => { setEditMode(false); setEditedText(draft.draft); }} className="btn btn--ghost">
                      Cancel
                    </button>
                  </>
                ) : isPending ? (
                  <>
                    <button onClick={() => review("approved")} disabled={saving} className="btn btn--primary">
                      {saving ? "…" : "Approve"}
                    </button>
                    <button onClick={() => review("rejected")} disabled={saving} className="btn">
                      Reject
                    </button>
                  </>
                ) : canSend ? (
                  <button onClick={send} disabled={sending} className="btn btn--primary">
                    {sending ? "Sending…" : "Send via Gmail →"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TestDraftForm({ cloneId, onCreated }: { cloneId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      await fetch("/api/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clone_id: cloneId,
          sender: sender.split("<")[0].trim() || sender,
          sender_email: sender.match(/<(.+)>/)?.[1] ?? sender,
          subject,
          body,
        }),
      });
      setSender(""); setSubject(""); setBody("");
      setOpen(false);
      onCreated();
    } finally {
      setGenerating(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn">
        + Test: paste an email
      </button>
    );
  }

  return (
    <div className="card">
      <p className="card-title">Paste an email to generate a draft reply</p>
      <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="text"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder="From: John Smith <john@example.com>"
          className="input"
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="input"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body…"
          rows={5}
          className="input"
          style={{ resize: "none", lineHeight: 1.6 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={generating || !sender || !subject || !body}
            className="btn btn--primary"
          >
            {generating ? "Generating…" : "Generate draft →"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn btn--ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function GmailWatchToggle({ cloneId }: { cloneId: string }) {
  const [enabling, setEnabling] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function enable() {
    setEnabling(true);
    setError("");
    try {
      const res = await fetch("/api/email/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed");
      setEnabled(true);
      setExpiresAt(data.expires_at ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable");
    } finally {
      setEnabling(false);
    }
  }

  if (enabled) {
    return (
      <span className="badge badge--pos">
        <span className="badge__dot" />
        Auto-receive on{expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString()}` : ""}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={enable} disabled={enabling} className="btn btn--sm">
        {enabling ? "Enabling…" : "Enable auto-receive →"}
      </button>
      {error && <span style={{ fontSize: 11, color: "rgba(248,113,113,0.60)" }}>{error}</span>}
    </div>
  );
}

export default function EmailPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  const [filter, setFilter] = useState<Filter>("pending");

  const urlParams = new URLSearchParams({ clone_id: clone?.clone_id ?? "" });
  if (filter !== "all") urlParams.set("status", filter);

  const { data, isLoading: draftsLoading, mutate } = useSWR<{ drafts: EmailDraft[]; total: number }>(
    clone ? `/api/email/drafts?${urlParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline" }}>Get started →</a>
        </p>
      </div>
    );
  }

  const drafts = data?.drafts ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Automation</p>
          <h1 className="db-h1">Email drafts</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
          <GmailWatchToggle cloneId={clone.clone_id} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "inline-flex", gap: 4, padding: 4, borderRadius: 12,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
        alignSelf: "flex-start",
      }}>
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            style={{
              padding: "6px 14px", borderRadius: 9, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none", fontFamily: "inherit",
              background: filter === value ? "rgba(255,255,255,0.09)" : "transparent",
              color: filter === value ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
              transition: "all 180ms",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Test form */}
      <TestDraftForm cloneId={clone.clone_id} onCreated={mutate} />

      {/* Loading / empty */}
      {draftsLoading && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</p>
      )}

      {!draftsLoading && drafts.length === 0 && (
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>
            {filter === "pending"
              ? "No pending drafts. Use the test form above, or connect Gmail Push to auto-generate drafts."
              : "No drafts found."}
          </p>
        </div>
      )}

      {/* Draft list */}
      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          cloneId={clone.clone_id}
          onUpdated={mutate}
        />
      ))}

      {total > drafts.length && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
          Showing {drafts.length} of {total}
        </p>
      )}
    </div>
  );
}
