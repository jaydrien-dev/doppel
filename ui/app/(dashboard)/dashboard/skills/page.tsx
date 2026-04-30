"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/hooks/useOrg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Skill {
  id: string;
  skill_name: string;
  role: string | null;
  trigger_context: string[];
  inputs_required: string[];
  confidence: number;
  source_count: number;
  last_verified_at: string | null;
  procedure?: {
    steps?: string[];
    decision_rules?: Array<{ condition: string; action: string }>;
    exceptions?: string[];
    escalation?: string;
  };
}

interface AgentQuery {
  id: string;
  situation: string;
  skill_applied: string | null;
  confidence: number;
  escalated: boolean;
  latency_ms: number | null;
  created_at: string;
}

type Tab = "skills" | "test" | "queries" | "integrate";

export default function SkillsPage() {
  const { org, isLoading: orgLoading } = useOrg();
  const [tab, setTab] = useState<Tab>("skills");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [queries, setQueries] = useState<AgentQuery[]>([]);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillDetails, setSkillDetails] = useState<Record<string, Skill>>({});

  const fetchData = useCallback(async (orgId: string) => {
    const [skillsRes, queriesRes] = await Promise.all([
      fetch(`/api/skills?org_id=${orgId}`),
      fetch(`/api/skills/queries?org_id=${orgId}`),
    ]);
    if (skillsRes.ok) {
      const data = await skillsRes.json();
      setSkills(data.skills || []);
    }
    if (queriesRes.ok) {
      const data = await queriesRes.json();
      setQueries(data.queries || []);
    }
  }, []);

  useEffect(() => {
    if (!org) return;
    fetchData(org.id);
  }, [org?.id, fetchData]);

  async function expandSkill(skill: Skill) {
    if (expandedSkill === skill.id) { setExpandedSkill(null); return; }
    setExpandedSkill(skill.id);
    if (!skillDetails[skill.id]) {
      const res = await fetch(`/api/skills/${skill.id}?org_id=${org!.id}`);
      if (res.ok) {
        const data = await res.json();
        setSkillDetails((prev) => ({ ...prev, [skill.id]: data }));
      }
    }
  }

  if (orgLoading) return <LoadingSpinner />;

  if (!org) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Set up an org workspace first from{" "}
          <a href="/dashboard/org" className="text-white/60 underline underline-offset-2">Team</a>.
        </p>
      </div>
    );
  }

  const avgConfidence = skills.length
    ? Math.round((skills.reduce((s, sk) => s + sk.confidence, 0) / skills.length) * 100)
    : 0;

  const openaiSpec = JSON.stringify(
    {
      tools: [
        {
          type: "function",
          function: {
            name: "query_company_brain",
            description: `Query ${org.name}'s company brain before taking action`,
            parameters: {
              type: "object",
              properties: {
                situation: { type: "string", description: "Describe the situation" },
                context: { type: "object", description: "Relevant variables" },
              },
              required: ["situation"],
            },
          },
        },
      ],
    },
    null,
    2
  );

  const anthropicSnippet = `import anthropic
client = anthropic.Anthropic()

# Query the company brain before acting
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=[{
        "name": "query_company_brain",
        "description": "Get company-specific guidance before taking action",
        "input_schema": {
            "type": "object",
            "properties": {
                "situation": {"type": "string"},
                "context": {"type": "object"}
            },
            "required": ["situation"]
        }
    }],
    messages=[{"role": "user", "content": task_description}]
)
# If tool_use, call:
# POST /v1/org/${org.id}/query
# { "situation": tool_input["situation"], "context": tool_input.get("context", {}) }`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/[0.06] flex items-start justify-between">
        <div>
          <h1 className="text-xl font-light text-white/85">Skills API</h1>
          <p className="text-xs text-white/30 mt-0.5">
            Executable company knowledge for AI agents · {org.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {skills.length > 0 && (
            <>
              <div className="text-right">
                <p className="text-lg font-light text-white/80">{skills.length}</p>
                <p className="text-[10px] text-white/25">skills</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-light text-white/80">{avgConfidence}%</p>
                <p className="text-[10px] text-white/25">avg confidence</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 pt-4 flex gap-1 border-b border-white/[0.06] pb-0">
        {(["skills", "test", "queries", "integrate"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs rounded-t-lg transition-all capitalize ${
              tab === t
                ? "glass-md text-white/80 border-b-2 border-white/20"
                : "text-white/35 hover:text-white/60"
            }`}
          >
            {t === "integrate" ? "Integrate" : t === "queries" ? "Agent log" : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {tab === "skills" && (
          <SkillsTab
            skills={skills}
            orgId={org.id}
            expandedSkill={expandedSkill}
            skillDetails={skillDetails}
            onExpand={expandSkill}
          />
        )}
        {tab === "test" && <TestTab orgId={org.id} />}
        {tab === "queries" && <AgentLogTab queries={queries} />}
        {tab === "integrate" && (
          <IntegrateTab
            orgId={org.id}
            orgName={org.name}
            anthropicSnippet={anthropicSnippet}
            openaiSpec={openaiSpec}
          />
        )}
      </div>
    </div>
  );
}

function SkillsTab({
  skills, orgId, expandedSkill, skillDetails, onExpand,
}: {
  skills: Skill[];
  orgId: string;
  expandedSkill: string | null;
  skillDetails: Record<string, Skill>;
  onExpand: (s: Skill) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center">
        <p className="text-sm text-white/30 mb-1">No skills extracted yet.</p>
        <p className="text-xs text-white/20">
          Go to{" "}
          <a href="/dashboard/roles" className="text-white/40 underline underline-offset-2">
            Company Brain
          </a>{" "}
          to create role brains and extract skills.
        </p>
      </div>
    );
  }

  const byRole: Record<string, Skill[]> = {};
  for (const s of skills) {
    const key = s.role || "Other";
    byRole[key] = [...(byRole[key] || []), s];
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {Object.entries(byRole).map(([role, roleSkills]) => (
        <div key={role}>
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2">{role}</p>
          <div className="flex flex-col gap-2">
            {roleSkills.map((skill) => {
              const detail = skillDetails[skill.id];
              const isExpanded = expandedSkill === skill.id;
              return (
                <div key={skill.id} className="glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => onExpand(skill)}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ConfidenceDot confidence={skill.confidence} />
                      <span className="text-sm text-white/70 font-mono truncate">
                        {skill.skill_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-white/30">
                        {Math.round(skill.confidence * 100)}% confidence
                      </span>
                      <svg
                        width="12" height="12" viewBox="0 0 12 12" fill="none"
                        className={`text-white/25 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-white/[0.06] flex flex-col gap-3">
                      {/* Triggers */}
                      {skill.trigger_context.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] text-white/25 mb-1.5">Trigger context</p>
                          <div className="flex flex-wrap gap-1.5">
                            {skill.trigger_context.map((t) => (
                              <span key={t} className="text-[10px] glass rounded-full px-2 py-0.5 text-white/40">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Procedure (from detail) */}
                      {detail?.procedure && (
                        <ProcedureView procedure={detail.procedure} />
                      )}

                      {/* Copy snippet */}
                      <div className="mt-1">
                        <p className="text-[10px] text-white/25 mb-1">Agent endpoint</p>
                        <code className="block text-[10px] text-white/40 glass rounded-lg px-3 py-2 font-mono">
                          GET /v1/org/{`{org_id}`}/skills/{skill.id}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProcedureView({ procedure }: { procedure: Skill["procedure"] }) {
  if (!procedure) return null;
  return (
    <div className="flex flex-col gap-2">
      {procedure.steps && procedure.steps.length > 0 && (
        <div>
          <p className="text-[10px] text-white/25 mb-1">Steps</p>
          <ol className="text-xs text-white/50 space-y-0.5 list-decimal list-inside">
            {procedure.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}
      {procedure.decision_rules && procedure.decision_rules.length > 0 && (
        <div>
          <p className="text-[10px] text-white/25 mb-1">Decision rules</p>
          <div className="flex flex-col gap-1">
            {procedure.decision_rules.map((r, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-white/25 shrink-0">if</span>
                <span className="text-white/50">{r.condition}</span>
                <span className="text-white/25 shrink-0">→</span>
                <span className="text-white/60">{r.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {procedure.exceptions && procedure.exceptions.length > 0 && (
        <div>
          <p className="text-[10px] text-amber-400/40 mb-1">Exceptions</p>
          <ul className="text-xs text-white/40 space-y-0.5">
            {procedure.exceptions.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {procedure.escalation && (
        <div className="glass rounded-lg px-3 py-2">
          <span className="text-[10px] text-white/25">Escalate when: </span>
          <span className="text-xs text-white/45">{procedure.escalation}</span>
        </div>
      )}
    </div>
  );
}

function TestTab({ orgId }: { orgId: string }) {
  const [situation, setSituation] = useState("");
  const [context, setContext] = useState("{}");
  const [result, setResult] = useState<object | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"query" | "validate">("query");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!situation.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let ctx: object = {};
      try { ctx = JSON.parse(context); } catch { /* ignore */ }

      const endpoint = mode === "query" ? `/api/skills/query` : `/api/skills/validate`;
      const body = mode === "query"
        ? { org_id: orgId, situation, context: ctx }
        : { org_id: orgId, proposed_action: situation, context: ctx };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Error"); return; }
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  const r = result as Record<string, unknown> | null;

  return (
    <div className="max-w-xl flex flex-col gap-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex gap-1 mb-4">
          {(["query", "validate"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                mode === m ? "glass-md text-white/80" : "text-white/35 hover:text-white/55"
              }`}
            >
              {m === "query" ? "Query brain" : "Validate action"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] text-white/30 mb-1 block">
              {mode === "query" ? "Situation" : "Proposed action"}
            </label>
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder={
                mode === "query"
                  ? "e.g. Customer wants a refund on a 45-day-old VIP order..."
                  : "e.g. Auto-approve a $2,400 refund for a Category B order..."
              }
              rows={3}
              className="w-full glass rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/25 outline-none resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/30 mb-1 block">Context (JSON)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              className="w-full glass rounded-xl px-4 py-2 text-xs text-white/60 font-mono outline-none resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !situation.trim()}
            className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40 self-start"
          >
            {loading ? "Querying…" : mode === "query" ? "Query company brain" : "Validate action"}
          </button>
        </form>
      </div>

      {error && (
        <div className="glass rounded-xl px-4 py-3">
          <p className="text-xs text-red-400/60">{error}</p>
        </div>
      )}

      {r && (
        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          {mode === "query" ? (
            <>
              {r.skill_applied && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/25">Skill applied:</span>
                  <span className="text-[10px] font-mono glass rounded-full px-2 py-0.5 text-white/50">
                    {r.skill_applied as string}
                  </span>
                </div>
              )}
              {r.recommendation && (
                <div>
                  <p className="text-[11px] text-white/30 mb-1">Recommendation</p>
                  <p className="text-sm text-white/70 leading-relaxed">{r.recommendation as string}</p>
                </div>
              )}
              {r.reasoning && (
                <div>
                  <p className="text-[11px] text-white/30 mb-1">Reasoning</p>
                  <p className="text-xs text-white/45 leading-relaxed">{r.reasoning as string}</p>
                </div>
              )}
              <div className="flex items-center gap-4">
                <ConfidenceTag confidence={r.confidence as number} />
                {r.escalate && (
                  <span className="text-[10px] text-amber-400/60 bg-amber-400/10 rounded-full px-2 py-0.5">
                    Escalate to human
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {r.safe_to_proceed ? (
                  <span className="text-xs text-emerald-400/70 bg-emerald-400/10 rounded-full px-3 py-1">
                    Safe to proceed
                  </span>
                ) : (
                  <span className="text-xs text-red-400/60 bg-red-400/10 rounded-full px-3 py-1">
                    Blocked
                  </span>
                )}
                <ConfidenceTag confidence={r.confidence as number} />
              </div>
              {r.blocking_reason && (
                <p className="text-xs text-white/50">{r.blocking_reason as string}</p>
              )}
              {r.suggested_alternative && (
                <div>
                  <p className="text-[11px] text-white/30 mb-1">Suggested instead</p>
                  <p className="text-xs text-white/55">{r.suggested_alternative as string}</p>
                </div>
              )}
            </>
          )}
          <p className="text-[10px] text-white/20">{r.latency_ms as number}ms</p>
        </div>
      )}
    </div>
  );
}

function AgentLogTab({ queries }: { queries: AgentQuery[] }) {
  if (queries.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center max-w-lg">
        <p className="text-sm text-white/30">No agent queries yet.</p>
        <p className="text-xs text-white/20 mt-1">
          When AI agents call your Skills API, they appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      {queries.map((q) => (
        <div key={q.id} className="glass rounded-xl px-4 py-3 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/60 truncate">{q.situation}</p>
            {q.skill_applied && (
              <p className="text-[10px] text-white/30 mt-0.5 font-mono">{q.skill_applied}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {q.escalated && (
              <span className="text-[9px] text-amber-400/50">escalated</span>
            )}
            <ConfidenceTag confidence={q.confidence} />
            <span className="text-[10px] text-white/20">
              {new Date(q.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegrateTab({
  orgId, orgName, anthropicSnippet, openaiSpec,
}: {
  orgId: string;
  orgName: string;
  anthropicSnippet: string;
  openaiSpec: string;
}) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin.replace("3000", "8000") : "http://localhost:8000";
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white/60 mb-1">Base URL</h3>
        <p className="text-xs text-white/35 mb-3">
          Your company brain API endpoints for AI agents.
        </p>
        <div className="flex flex-col gap-2">
          {[
            ["GET skills catalog", `${baseUrl}/v1/org/${orgId}/skills`],
            ["POST query brain", `${baseUrl}/v1/org/${orgId}/query`],
            ["POST validate action", `${baseUrl}/v1/org/${orgId}/validate`],
            ["GET OpenAPI spec", `${baseUrl}/v1/org/${orgId}/skills.openapi.json`],
          ].map(([label, url]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[10px] text-white/25 w-32 shrink-0">{label}</span>
              <code className="flex-1 text-[10px] text-white/50 font-mono glass rounded-lg px-3 py-1.5 truncate">
                {url}
              </code>
              <button
                onClick={() => copy(url, label)}
                className="text-[10px] text-white/25 hover:text-white/55 transition-colors shrink-0"
              >
                {copied === label ? "Copied!" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white/60 mb-1">Anthropic tool use</h3>
        <p className="text-xs text-white/35 mb-3">
          Drop this into any Claude-powered agent to give it access to {orgName}&apos;s company brain.
        </p>
        <div className="relative">
          <pre className="text-[10px] text-white/45 font-mono leading-relaxed overflow-x-auto glass rounded-xl p-4 whitespace-pre-wrap break-all">
            {anthropicSnippet}
          </pre>
          <button
            onClick={() => copy(anthropicSnippet, "anthropic")}
            className="absolute top-3 right-3 text-[10px] text-white/25 hover:text-white/55 glass rounded-lg px-2 py-1"
          >
            {copied === "anthropic" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white/60 mb-1">OpenAI / LangChain format</h3>
        <div className="relative">
          <pre className="text-[10px] text-white/45 font-mono leading-relaxed overflow-x-auto glass rounded-xl p-4 whitespace-pre">
            {openaiSpec}
          </pre>
          <button
            onClick={() => copy(openaiSpec, "openai")}
            className="absolute top-3 right-3 text-[10px] text-white/25 hover:text-white/55 glass rounded-lg px-2 py-1"
          >
            {copied === "openai" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.8
      ? "bg-emerald-400/70"
      : confidence >= 0.6
      ? "bg-amber-400/60"
      : "bg-red-400/50";
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
}

function ConfidenceTag({ confidence }: { confidence: number }) {
  const pct = Math.round((confidence || 0) * 100);
  const color =
    pct >= 80 ? "text-emerald-400/60" : pct >= 60 ? "text-amber-400/50" : "text-red-400/40";
  return <span className={`text-[10px] ${color}`}>{pct}% conf</span>;
}
