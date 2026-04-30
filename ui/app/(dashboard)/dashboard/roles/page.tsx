"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/hooks/useOrg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface RoleBrain {
  id: string;
  role_name: string;
  description: string;
  member_clone_ids: string[];
  member_names: string[];
  freshness_score: number;
  last_extracted_at: string | null;
  skill_count: number;
  has_knowledge: boolean;
  created_at: string;
}

interface OrgMember {
  clone_id: string;
  display_name: string;
  user_id: string;
}

export default function RolesPage() {
  const { org, isLoading: orgLoading } = useOrg();
  const [roles, setRoles] = useState<RoleBrain[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ role_name: "", description: "" });
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, object>>({});

  const fetchRoles = useCallback(async (orgId: string) => {
    const res = await fetch(`/api/roles?org_id=${orgId}`);
    if (res.ok) setRoles(await res.json());
  }, []);

  useEffect(() => {
    if (!org) return;
    fetchRoles(org.id);
    fetch(`/api/org/members?org_id=${org.id}`)
      .then((r) => r.json())
      .then((data) => {
        // Backend returns { user_id, clone: { clone_id, display_name } }
        // Flatten to the shape this page expects
        const flat = (data.members || [])
          .filter((m: { clone: { clone_id: string } | null }) => m.clone?.clone_id)
          .map((m: { user_id: string; clone: { clone_id: string; display_name: string } }) => ({
            clone_id: m.clone.clone_id,
            display_name: m.clone.display_name,
            user_id: m.user_id,
          }));
        setMembers(flat);
      })
      .catch(() => {});
  }, [org?.id, fetchRoles]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !newRole.role_name.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id, ...newRole }),
      });
      setNewRole({ role_name: "", description: "" });
      await fetchRoles(org.id);
    } finally {
      setCreating(false);
    }
  }

  async function handleExtract(roleId: string) {
    setExtractingId(roleId);
    try {
      await fetch(`/api/roles/${roleId}/extract`, { method: "POST" });
      await fetchRoles(org!.id);
    } finally {
      setExtractingId(null);
    }
  }

  async function handleUpdateMembers(roleId: string, cloneIds: string[]) {
    await fetch(`/api/roles/${roleId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_clone_ids: cloneIds }),
    });
    await fetchRoles(org!.id);
  }

  async function handleDelete(roleId: string) {
    if (!confirm("Delete this role brain? This also removes its extracted skills.")) return;
    await fetch(`/api/roles/${roleId}`, { method: "DELETE" });
    await fetchRoles(org!.id);
  }

  async function expandKnowledge(role: RoleBrain) {
    if (expandedId === role.id) { setExpandedId(null); return; }
    setExpandedId(role.id);
    if (!knowledgeMap[role.id] && role.has_knowledge) {
      const res = await fetch(`/api/roles/${role.id}`);
      if (res.ok) {
        const data = await res.json();
        setKnowledgeMap((prev) => ({ ...prev, [role.id]: data.knowledge_summary }));
      }
    }
  }

  if (orgLoading) return <LoadingSpinner />;

  if (!org) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create an org workspace first from{" "}
          <a href="/dashboard/org" className="text-white/60 underline underline-offset-2">Team</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Company Brain</h1>
        <p className="text-sm text-white/35 mt-1">
          Aggregate your team's knowledge into role brains — then extract executable skills for AI agents.
        </p>
      </div>

      {/* Stats bar */}
      {roles.length > 0 && (
        <div className="flex gap-4">
          <Stat label="Role brains" value={roles.length} />
          <Stat label="Skills extracted" value={roles.reduce((s, r) => s + r.skill_count, 0)} />
          <Stat label="Members covered" value={new Set(roles.flatMap((r) => r.member_clone_ids)).size} />
        </div>
      )}

      {/* Create role brain */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-medium text-white/60 mb-1">Add role brain</h3>
        <p className="text-xs text-white/35 mb-4">
          A role brain aggregates knowledge from all clones in that role.
        </p>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              value={newRole.role_name}
              onChange={(e) => setNewRole((p) => ({ ...p, role_name: e.target.value }))}
              placeholder="Role name (e.g. support_lead, incident_commander)"
              className="flex-1 glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
            />
            <button
              type="submit"
              disabled={creating || !newRole.role_name.trim()}
              className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          <input
            value={newRole.description}
            onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))}
            placeholder="Description (optional)"
            className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
          />
        </form>
      </div>

      {/* Role brain list */}
      {roles.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-white/30">No role brains yet.</p>
          <p className="text-xs text-white/20 mt-1">Create one above to start building your company brain.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {roles.map((role) => (
            <RoleBrainCard
              key={role.id}
              role={role}
              allMembers={members}
              extracting={extractingId === role.id}
              expanded={expandedId === role.id}
              knowledge={knowledgeMap[role.id]}
              onExtract={() => handleExtract(role.id)}
              onUpdateMembers={(ids) => handleUpdateMembers(role.id, ids)}
              onDelete={() => handleDelete(role.id)}
              onExpand={() => expandKnowledge(role)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xl font-light text-white/80">{value}</span>
      <span className="text-[11px] text-white/30">{label}</span>
    </div>
  );
}

function FreshnessBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-emerald-400/50" : pct >= 40 ? "bg-amber-400/50" : "bg-red-400/40";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/30 w-8 text-right">{pct}%</span>
    </div>
  );
}

function RoleBrainCard({
  role, allMembers, extracting, expanded, knowledge,
  onExtract, onUpdateMembers, onDelete, onExpand,
}: {
  role: RoleBrain;
  allMembers: OrgMember[];
  extracting: boolean;
  expanded: boolean;
  knowledge: object | undefined;
  onExtract: () => void;
  onUpdateMembers: (ids: string[]) => void;
  onDelete: () => void;
  onExpand: () => void;
}) {
  const [editingMembers, setEditingMembers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(role.member_clone_ids);

  function toggleMember(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function saveMembers() {
    onUpdateMembers(selectedIds);
    setEditingMembers(false);
  }

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white/70">{role.role_name}</h3>
            {role.skill_count > 0 && (
              <span className="text-[10px] text-emerald-400/70 bg-emerald-400/10 rounded-full px-2 py-0.5">
                {role.skill_count} skills
              </span>
            )}
          </div>
          {role.description && (
            <p className="text-xs text-white/30 mt-0.5 truncate">{role.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {role.has_knowledge && (
            <button
              onClick={onExpand}
              className="text-xs text-white/30 hover:text-white/55 transition-colors"
            >
              {expanded ? "Hide" : "View knowledge"}
            </button>
          )}
          <button
            onClick={onExtract}
            disabled={extracting || role.member_clone_ids.length === 0}
            className="glass hover:glass-md rounded-xl px-4 py-1.5 text-xs text-white/55 hover:text-white/80 transition-all disabled:opacity-40"
          >
            {extracting ? "Extracting…" : role.has_knowledge ? "Re-extract" : "Extract knowledge"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-white/20 hover:text-red-400/60 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-white/30">
            {role.member_names.length > 0
              ? role.member_names.join(", ")
              : "No members assigned"}
          </span>
          <button
            onClick={() => { setSelectedIds(role.member_clone_ids); setEditingMembers(!editingMembers); }}
            className="text-[11px] text-white/30 hover:text-white/55 transition-colors"
          >
            {editingMembers ? "Cancel" : "Edit members"}
          </button>
        </div>

        {editingMembers && (
          <div className="flex flex-col gap-1.5 mt-2">
            {allMembers.filter((m) => m.clone_id).map((m) => (
              <label key={m.clone_id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.clone_id)}
                  onChange={() => toggleMember(m.clone_id)}
                  className="accent-white/60"
                />
                <span className="text-xs text-white/60">{m.display_name}</span>
              </label>
            ))}
            <button
              onClick={saveMembers}
              className="glass-md hover:glass-hi rounded-xl px-4 py-1.5 text-xs text-white/60 hover:text-white/80 transition-all self-start mt-1"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* Freshness */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-[11px] text-white/25">Freshness</span>
          {role.last_extracted_at && (
            <span className="text-[11px] text-white/20">
              Last extracted {new Date(role.last_extracted_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <FreshnessBar score={role.freshness_score} />
      </div>

      {/* Knowledge preview */}
      {expanded && knowledge && (
        <KnowledgePanel knowledge={knowledge as KnowledgeSummary} />
      )}
    </div>
  );
}

interface KnowledgeSummary {
  role_summary?: string;
  key_responsibilities?: string[];
  decision_procedures?: Array<{
    trigger: string;
    steps: string[];
    rules: string[];
    exceptions: string[];
    escalation: string;
  }>;
  common_heuristics?: string[];
  domain_knowledge?: string[];
}

function KnowledgePanel({ knowledge }: { knowledge: KnowledgeSummary }) {
  return (
    <div className="border-t border-white/[0.06] pt-3 flex flex-col gap-3">
      {knowledge.role_summary && (
        <p className="text-xs text-white/50 leading-relaxed">{knowledge.role_summary}</p>
      )}

      {(knowledge.decision_procedures || []).map((proc, i) => (
        <div key={i} className="glass rounded-xl p-3">
          <p className="text-[11px] font-medium text-white/60 mb-1">Trigger: {proc.trigger}</p>
          {proc.steps?.length > 0 && (
            <ol className="text-[11px] text-white/40 space-y-0.5 list-decimal list-inside">
              {proc.steps.map((s, j) => <li key={j}>{s}</li>)}
            </ol>
          )}
          {proc.exceptions?.length > 0 && (
            <div className="mt-1.5">
              <span className="text-[10px] text-amber-400/50">Exceptions: </span>
              <span className="text-[10px] text-white/30">{proc.exceptions.join(" · ")}</span>
            </div>
          )}
        </div>
      ))}

      {knowledge.common_heuristics && knowledge.common_heuristics.length > 0 && (
        <div>
          <p className="text-[11px] text-white/30 mb-1">Heuristics</p>
          <ul className="text-[11px] text-white/40 space-y-0.5">
            {knowledge.common_heuristics.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-white/20">–</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
