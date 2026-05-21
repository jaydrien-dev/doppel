"use client";

import { useEffect, useState } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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

  const [calTitle, setCalTitle] = useState("");
  const [calTime, setCalTime] = useState("");
  const [calAttendees, setCalAttendees] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calGenerating, setCalGenerating] = useState(false);

  useEffect(() => {
    if (clone) loadProposals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone?.clone_id, tab]);

  async function loadProposals() {
    if (!clone) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/proposals?clone_id=${clone.clone_id}&proposal_type=${tab}&status=pending`);
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
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline" }}>Get started →</a>
        </p>
      </div>
    );
  }

  const confColor = (c: number | null): string => {
    if (c == null) return "rgba(255,255,255,0.30)";
    if (c >= 0.8) return "rgba(52,211,153,0.70)";
    if (c >= 0.6) return "rgba(251,191,36,0.70)";
    return "rgba(248,113,113,0.60)";
  };

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Automation</p>
          <h1 className="db-h1">Proposals</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "inline-flex", gap: 4, padding: 4, borderRadius: 12, alignSelf: "flex-start",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {(["code_review", "calendar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px", borderRadius: 9, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none", fontFamily: "inherit",
              background: tab === t ? "rgba(255,255,255,0.09)" : "transparent",
              color: tab === t ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
              transition: "all 180ms",
            }}
          >
            {t === "code_review" ? "Code Review" : "Calendar"}
          </button>
        ))}
      </div>

      {/* Code review tab */}
      {tab === "code_review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.5 }}>
              Your clone reviews open PRs in your GitHub repos and proposes a comment.
            </p>
            <button onClick={generateCodeReviews} disabled={generating} className="btn btn--primary" style={{ flexShrink: 0 }}>
              {generating ? "Scanning repos…" : "Scan open PRs"}
            </button>
          </div>

          {fetching ? (
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>Loading…</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>
                No pending code review proposals.{!generating && " Click \"Scan open PRs\" to generate some."}
              </p>
            </div>
          ) : proposals.map((p) => (
            <ProposalCard
              key={p.id} proposal={p} editingId={editingId} editContent={editContent} confColor={confColor}
              onStartEdit={() => { setEditingId(p.id); setEditContent(p.content); }}
              onEditChange={setEditContent}
              onApprove={() => actOnProposal(p.id, "approved")}
              onApproveEdited={() => actOnProposal(p.id, "edited", editContent)}
              onReject={() => actOnProposal(p.id, "rejected")}
              onCancelEdit={() => { setEditingId(null); setEditContent(""); }}
            />
          ))}
        </div>
      )}

      {/* Calendar tab */}
      {tab === "calendar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <p className="card-title">New meeting proposal</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16, lineHeight: 1.5 }}>
              Describe the meeting and your clone will propose whether to accept, decline, or reschedule.
            </p>
            <form onSubmit={generateCalendarProposal} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Meeting title" className="input" />
              <input value={calTime} onChange={(e) => setCalTime(e.target.value)} placeholder="When? (e.g. Tomorrow 2pm, Friday morning)" className="input" />
              <input value={calAttendees} onChange={(e) => setCalAttendees(e.target.value)} placeholder="Attendees (optional)" className="input" />
              <textarea value={calDesc} onChange={(e) => setCalDesc(e.target.value)} placeholder="Agenda or context (optional)" rows={2} className="input" style={{ resize: "none" }} />
              <button type="submit" disabled={calGenerating || !calTitle || !calTime} className="btn btn--primary" style={{ alignSelf: "flex-start" }}>
                {calGenerating ? "Generating…" : "Get clone's recommendation"}
              </button>
            </form>
          </div>

          {fetching ? (
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>Loading…</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>No pending calendar proposals. Add a meeting above.</p>
            </div>
          ) : proposals.map((p) => (
            <ProposalCard
              key={p.id} proposal={p} editingId={editingId} editContent={editContent} confColor={confColor}
              onStartEdit={() => { setEditingId(p.id); setEditContent(p.content); }}
              onEditChange={setEditContent}
              onApprove={() => actOnProposal(p.id, "approved")}
              onApproveEdited={() => actOnProposal(p.id, "edited", editContent)}
              onReject={() => actOnProposal(p.id, "rejected")}
              onCancelEdit={() => { setEditingId(null); setEditContent(""); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal, editingId, editContent, confColor,
  onStartEdit, onEditChange, onApprove, onApproveEdited, onReject, onCancelEdit,
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
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: "0 0 4px", lineHeight: 1.3 }}>
            {proposal.title}
          </p>
          {ctx?.url && (
            <a href={ctx.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}>
              {ctx.repo ?? ""} ↗
            </a>
          )}
        </div>
        {proposal.confidence != null && (
          <span style={{ fontSize: 12, flexShrink: 0, color: confColor(proposal.confidence) }}>
            {Math.round(proposal.confidence * 100)}% confident
          </span>
        )}
      </div>

      {isEditing ? (
        <textarea value={editContent} onChange={(e) => onEditChange(e.target.value)}
          rows={6} className="input" style={{ resize: "none", lineHeight: 1.6 }} />
      ) : (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>
          {proposal.content}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        {isEditing ? (
          <>
            <button onClick={onApproveEdited} className="btn btn--primary">Approve edited</button>
            <button onClick={onCancelEdit} className="btn btn--ghost">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={onApprove} className="btn btn--primary">Approve</button>
            <button onClick={onStartEdit} className="btn">Edit</button>
            <button onClick={onReject} className="btn btn--ghost" style={{ marginLeft: "auto" }}>Dismiss</button>
          </>
        )}
      </div>
    </div>
  );
}
