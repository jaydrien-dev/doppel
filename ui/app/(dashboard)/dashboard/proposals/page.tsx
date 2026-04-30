"use client";

import { useEffect, useState } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";

interface Proposal {
  id: string;
  proposal_type: string;
  status: string;
  title: string;
  content: string;
  context: Record<string, unknown>;
  edited_content: string | null;
  confidence: number | null;
  created_at: string;
}

type Tab = "code_review" | "calendar";

export default function ProposalsPage() {
  const { clone, isLoading } = useClone();
  const [tab, setTab] = useState<Tab>("code_review");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Calendar form
  const [calTitle, setCalTitle] = useState("");
  const [calTime, setCalTime] = useState("");
  const [calAttendees, setCalAttendees] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calGenerating, setCalGenerating] = useState(false);

  useEffect(() => {
    if (clone) loadProposals();
  }, [clone?.clone_id, tab]);

  async function loadProposals() {
    if (!clone) return;
    setFetching(true);
    try {
      const res = await fetch(
        `/api/proposals?clone_id=${clone.clone_id}&proposal_type=${tab}&status=pending`
      );
      const data = await res.json();
      setProposals(data.proposals ?? []);
    } finally {
      setFetching(false);
    }
  }

  async function generateCodeReviews() {
    if (!clone) return;
    setGenerating(true);
    try {
      await fetch("/api/proposals/generate-code-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: clone.clone_id }),
      });
      // Poll briefly then reload
      await new Promise((r) => setTimeout(r, 3000));
      await loadProposals();
    } finally {
      setGenerating(false);
    }
  }

  async function generateCalendarProposal(e: React.FormEvent) {
    e.preventDefault();
    if (!clone || !calTitle || !calTime) return;
    setCalGenerating(true);
    try {
      await fetch("/api/proposals/generate-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clone_id: clone.clone_id,
          meeting_title: calTitle,
          meeting_time: calTime,
          attendees: calAttendees,
          description: calDesc,
        }),
      });
      setCalTitle(""); setCalTime(""); setCalAttendees(""); setCalDesc("");
      await loadProposals();
    } finally {
      setCalGenerating(false);
    }
  }

  async function actOnProposal(id: string, status: "approved" | "edited" | "rejected", edited?: string) {
    await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, edited_content: edited ?? null }),
    });
    setEditingId(null);
    setEditContent("");
    await loadProposals();
  }

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first from the{" "}
          <a href="/dashboard" className="text-white/60 underline underline-offset-2">overview</a>.
        </p>
      </div>
    );
  }

  const confColor = (c: number | null) =>
    c == null ? "text-white/30" : c >= 0.8 ? "text-emerald-400/70" : c >= 0.6 ? "text-amber-400/70" : "text-red-400/60";

  return (
    <div className="p-8 max-w-2xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Proposals</h1>
        <p className="text-sm text-white/35 mt-1">Clone-generated action proposals awaiting your approval.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 glass rounded-xl p-1 w-fit">
        {(["code_review", "calendar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs transition-all capitalize",
              tab === t ? "glass-md text-white/80" : "text-white/35 hover:text-white/55"
            )}
          >
            {t === "code_review" ? "Code Review" : "Calendar"}
          </button>
        ))}
      </div>

      {/* Code review tab */}
      {tab === "code_review" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/35">
              Your clone reviews open PRs in your GitHub repos and proposes a comment.
            </p>
            <button
              onClick={generateCodeReviews}
              disabled={generating}
              className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40 shrink-0"
            >
              {generating ? "Scanning repos…" : "Scan open PRs"}
            </button>
          </div>

          {fetching ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-white/30">Loading…</div>
          ) : proposals.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-white/30">
              No pending code review proposals.{" "}
              {!generating && "Click \"Scan open PRs\" to generate some."}
            </div>
          ) : (
            proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                editingId={editingId}
                editContent={editContent}
                confColor={confColor}
                onStartEdit={() => { setEditingId(p.id); setEditContent(p.content); }}
                onEditChange={setEditContent}
                onApprove={() => actOnProposal(p.id, "approved")}
                onApproveEdited={() => actOnProposal(p.id, "edited", editContent)}
                onReject={() => actOnProposal(p.id, "rejected")}
                onCancelEdit={() => { setEditingId(null); setEditContent(""); }}
              />
            ))
          )}
        </div>
      )}

      {/* Calendar tab */}
      {tab === "calendar" && (
        <div className="flex flex-col gap-4">
          {/* Create form */}
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-1">New meeting proposal</h3>
            <p className="text-xs text-white/35 mb-4">
              Describe the meeting and your clone will propose whether to accept, decline, or reschedule.
            </p>
            <form onSubmit={generateCalendarProposal} className="flex flex-col gap-3">
              <input
                value={calTitle}
                onChange={(e) => setCalTitle(e.target.value)}
                placeholder="Meeting title"
                className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
              />
              <input
                value={calTime}
                onChange={(e) => setCalTime(e.target.value)}
                placeholder="When? (e.g. Tomorrow 2pm, Friday morning)"
                className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
              />
              <input
                value={calAttendees}
                onChange={(e) => setCalAttendees(e.target.value)}
                placeholder="Attendees (optional)"
                className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
              />
              <textarea
                value={calDesc}
                onChange={(e) => setCalDesc(e.target.value)}
                placeholder="Agenda or context (optional)"
                rows={2}
                className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none resize-none"
              />
              <button
                type="submit"
                disabled={calGenerating || !calTitle || !calTime}
                className="glass-md hover:glass-hi rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40 self-start"
              >
                {calGenerating ? "Generating…" : "Get clone's recommendation"}
              </button>
            </form>
          </div>

          {fetching ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-white/30">Loading…</div>
          ) : proposals.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-white/30">
              No pending calendar proposals. Add a meeting above.
            </div>
          ) : (
            proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                editingId={editingId}
                editContent={editContent}
                confColor={confColor}
                onStartEdit={() => { setEditingId(p.id); setEditContent(p.content); }}
                onEditChange={setEditContent}
                onApprove={() => actOnProposal(p.id, "approved")}
                onApproveEdited={() => actOnProposal(p.id, "edited", editContent)}
                onReject={() => actOnProposal(p.id, "rejected")}
                onCancelEdit={() => { setEditingId(null); setEditContent(""); }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  editingId,
  editContent,
  confColor,
  onStartEdit,
  onEditChange,
  onApprove,
  onApproveEdited,
  onReject,
  onCancelEdit,
}: {
  proposal: Proposal;
  editingId: string | null;
  editContent: string;
  confColor: (c: number | null) => string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onApprove: () => void;
  onApproveEdited: () => void;
  onReject: () => void;
  onCancelEdit: () => void;
}) {
  const isEditing = editingId === proposal.id;
  const ctx = proposal.context as Record<string, string>;

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/75 font-medium leading-snug">{proposal.title}</p>
          {ctx?.url && (
            <a
              href={ctx.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/30 hover:text-white/55 transition-colors"
            >
              {ctx.repo ?? ""} ↗
            </a>
          )}
        </div>
        {proposal.confidence != null && (
          <span className={`text-xs shrink-0 ${confColor(proposal.confidence)}`}>
            {Math.round(proposal.confidence * 100)}% confident
          </span>
        )}
      </div>

      {isEditing ? (
        <textarea
          value={editContent}
          onChange={(e) => onEditChange(e.target.value)}
          rows={6}
          className="glass rounded-xl px-4 py-3 text-sm text-white/80 outline-none resize-none leading-relaxed w-full"
        />
      ) : (
        <p className="text-sm text-white/55 leading-relaxed whitespace-pre-wrap">{proposal.content}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {isEditing ? (
          <>
            <button
              onClick={onApproveEdited}
              className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/70 hover:text-white/90 transition-all"
            >
              Approve edited
            </button>
            <button
              onClick={onCancelEdit}
              className="glass rounded-xl px-3 py-2 text-sm text-white/40 hover:text-white/60 transition-all"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onApprove}
              className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/70 hover:text-white/90 transition-all"
            >
              Approve
            </button>
            <button
              onClick={onStartEdit}
              className="glass rounded-xl px-3 py-2 text-sm text-white/40 hover:text-white/65 transition-all"
            >
              Edit
            </button>
            <button
              onClick={onReject}
              className="glass rounded-xl px-3 py-2 text-sm text-white/25 hover:text-white/50 transition-all ml-auto"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
