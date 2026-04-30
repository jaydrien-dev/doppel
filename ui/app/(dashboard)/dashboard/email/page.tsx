"use client";

import { useState } from "react";
import useSWR from "swr";
import { useClone } from "@/lib/hooks/useClone";
import type { EmailDraft } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filter = "pending" | "approved" | "edited" | "rejected" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Needs review" },
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "edited", label: "Edited" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: EmailDraft["status"] }) {
  const styles: Record<string, string> = {
    pending: "text-amber-300/60 bg-amber-400/[0.08] border-amber-400/15",
    approved: "text-white/50 bg-white/[0.05] border-white/10",
    edited: "text-blue-200/60 bg-blue-400/[0.08] border-blue-400/15",
    rejected: "text-white/25 bg-white/[0.03] border-white/[0.06]",
  };
  const labels: Record<string, string> = {
    pending: "needs review",
    approved: "approved",
    edited: "edited & sent",
    rejected: "rejected",
  };
  return (
    <span className={cn("text-[10px] border rounded-full px-2 py-0.5", styles[status])}>
      {labels[status]}
    </span>
  );
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

  const isPending = draft.status === "pending";

  return (
    <div className={cn("glass rounded-2xl overflow-hidden transition-all", !isPending && "opacity-60 hover:opacity-80")}>
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-start gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-white/75 truncate">{draft.subject}</p>
            <StatusBadge status={draft.status} />
          </div>
          <p className="text-xs text-white/35 truncate">
            From {draft.sender} · {formatDate(draft.received_at)}
          </p>
        </div>
        <svg
          className={cn("text-white/25 shrink-0 mt-0.5 transition-transform", expanded && "rotate-180")}
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-white/[0.05]">
          {/* Original email */}
          <div className="pt-4">
            <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2">Original email</p>
            <div className="glass rounded-xl px-4 py-3">
              <p className="text-xs text-white/45 leading-relaxed whitespace-pre-wrap line-clamp-4">
                {draft.body}
              </p>
            </div>
          </div>

          {/* Draft */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-white/25 uppercase tracking-widest">
                Clone draft
              </p>
              {isPending && !editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-[10px] text-white/35 hover:text-white/55 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {editMode ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                className="w-full glass rounded-xl px-4 py-3 text-sm text-white/80 outline-none resize-none leading-relaxed"
              />
            ) : (
              <div className="glass rounded-xl px-4 py-3">
                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                  {draft.edited_version ?? draft.draft}
                </p>
              </div>
            )}

            {draft.reasoning && (
              <p className="text-[10px] text-white/25 mt-2 italic">{draft.reasoning}</p>
            )}
          </div>

          {/* Actions */}
          {isPending && (
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <button
                    onClick={() => review("edited", editedText)}
                    disabled={saving}
                    className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/70 hover:text-white/90 transition-all disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Save & approve"}
                  </button>
                  <button
                    onClick={() => { setEditMode(false); setEditedText(draft.draft); }}
                    className="text-xs text-white/30 hover:text-white/55 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => review("approved")}
                    disabled={saving}
                    className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/70 hover:text-white/90 transition-all disabled:opacity-40"
                  >
                    {saving ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => review("rejected")}
                    disabled={saving}
                    className="glass rounded-xl px-4 py-2 text-xs text-white/35 hover:text-white/55 transition-all disabled:opacity-40"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
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
      <button
        onClick={() => setOpen(true)}
        className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/50 hover:text-white/70 transition-all"
      >
        + Test: paste an email
      </button>
    );
  }

  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm font-medium text-white/60 mb-4">Paste an email to generate a draft reply</p>
      <form onSubmit={handleGenerate} className="flex flex-col gap-3">
        <input
          type="text"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder="From: John Smith <john@example.com>"
          className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body…"
          rows={5}
          className="glass rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/25 outline-none resize-none leading-relaxed"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={generating || !sender || !subject || !body}
            className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-40"
          >
            {generating ? "Generating…" : "Generate draft →"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-white/30 hover:text-white/55 transition-colors px-3"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EmailPage() {
  const { clone, isLoading } = useClone();
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
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first.{" "}
          <a href="/dashboard" className="text-white/60 underline underline-offset-2">Overview →</a>
        </p>
      </div>
    );
  }

  const drafts = data?.drafts ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-8 max-w-2xl flex flex-col gap-5">
      <div className="mb-2">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-light text-white/85">Email drafts</h1>
          <span className="text-xs text-white/25 bg-amber-400/[0.08] text-amber-300/50 border border-amber-400/15 rounded-full px-2 py-0.5">
            Gmail push — integration needed
          </span>
        </div>
        <p className="text-sm text-white/35">
          Review draft replies your clone wrote for incoming emails.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 glass rounded-xl p-1 w-fit">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs transition-all",
              filter === value ? "glass-md text-white/80" : "text-white/35 hover:text-white/55"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Test form */}
      <TestDraftForm cloneId={clone.clone_id} onCreated={mutate} />

      {/* Draft list */}
      {draftsLoading && <p className="text-sm text-white/30">Loading…</p>}

      {!draftsLoading && drafts.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-white/30">
            {filter === "pending"
              ? "No pending drafts. Use the test form above, or connect Gmail Push to auto-generate drafts."
              : "No drafts found."}
          </p>
        </div>
      )}

      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          cloneId={clone.clone_id}
          onUpdated={mutate}
        />
      ))}

      {total > drafts.length && (
        <p className="text-xs text-white/25 text-center">
          Showing {drafts.length} of {total}
        </p>
      )}
    </div>
  );
}

