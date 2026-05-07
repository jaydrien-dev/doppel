"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/hooks/useOrg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface RoleBrain {
  id: string;
  role_name: string;
  member_count: number;
  has_knowledge: boolean;
  last_extracted_at: string | null;
  knowledge_summary: Record<string, unknown> | null;
}

type Template = "claude_md" | "system_prompt" | "knowledge_base";

const TEMPLATES: { id: Template; label: string; description: string }[] = [
  {
    id: "claude_md",
    label: "CLAUDE.md",
    description: "For Claude Code agents — drop into any repo",
  },
  {
    id: "system_prompt",
    label: "System prompt",
    description: "Paste as the system message for any agent",
  },
  {
    id: "knowledge_base",
    label: "Knowledge base",
    description: "Full structured reference for RAG or context injection",
  },
];

function generateMarkdown(
  role: RoleBrain,
  orgName: string,
  template: Template
): string {
  const k = role.knowledge_summary as Record<string, unknown> | null;
  if (!k) return `# ${role.role_name}\n\nNo knowledge extracted yet. Go to Company Brain and run extraction first.`;

  const roleSummary = (k.role_summary as string) || "";
  const responsibilities = (k.key_responsibilities as string[]) || [];
  const procedures = (k.decision_procedures as Array<Record<string, unknown>>) || [];
  const heuristics = (k.common_heuristics as string[]) || [];
  const domainKnowledge = (k.domain_knowledge as string[]) || [];
  const tools = (k.tools_and_systems as string[]) || [];
  const escalationPaths = (k.escalation_paths as Record<string, string>) || {};
  const mistakes = (k.frequent_mistakes as string[]) || [];

  const proceduresSection = procedures.length
    ? procedures.map((p, i) => {
        const steps = (p.steps as string[]) || [];
        const rules = (p.rules as string[]) || [];
        const exceptions = (p.exceptions as string[]) || [];
        return [
          `#### ${i + 1}. ${p.trigger || "Procedure"}`,
          steps.length ? steps.map((s) => `- ${s}`).join("\n") : "",
          rules.length ? `\n**Rules:**\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
          exceptions.length ? `\n**Exceptions:**\n${exceptions.map((e) => `- ${e}`).join("\n")}` : "",
          p.escalation ? `\n**Escalate when:** ${p.escalation}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }).join("\n\n")
    : "";

  if (template === "claude_md") {
    return [
      `# ${orgName} — ${role.role_name} Knowledge`,
      "",
      `> This file is auto-generated from the ${orgName} company brain. It captures how the ${role.role_name} role operates — use it to ground agent decisions in company-specific procedure.`,
      "",
      "## Role Overview",
      roleSummary,
      "",
      responsibilities.length
        ? `## Key Responsibilities\n${responsibilities.map((r) => `- ${r}`).join("\n")}`
        : "",
      "",
      proceduresSection
        ? `## Decision Procedures\n\nWhen taking action in the following situations, follow the procedure below:\n\n${proceduresSection}`
        : "",
      "",
      heuristics.length
        ? `## Heuristics\n\nApply these rules of thumb when making judgment calls:\n\n${heuristics.map((h) => `- ${h}`).join("\n")}`
        : "",
      "",
      domainKnowledge.length
        ? `## Domain Knowledge\n\n${domainKnowledge.map((d) => `- ${d}`).join("\n")}`
        : "",
      "",
      tools.length
        ? `## Tools & Systems\n\n${tools.map((t) => `- ${t}`).join("\n")}`
        : "",
      "",
      Object.keys(escalationPaths).length
        ? `## Escalation Paths\n\n${Object.entries(escalationPaths).map(([sit, who]) => `- **${sit}** → ${who}`).join("\n")}`
        : "",
      "",
      mistakes.length
        ? `## Common Mistakes to Avoid\n\n${mistakes.map((m) => `- ${m}`).join("\n")}`
        : "",
    ]
      .filter((l) => l !== undefined)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (template === "system_prompt") {
    return [
      `You are operating as part of the ${orgName} team in the ${role.role_name} role.`,
      "",
      "## Your role",
      roleSummary,
      "",
      responsibilities.length
        ? `## Your responsibilities\n${responsibilities.map((r) => `- ${r}`).join("\n")}`
        : "",
      "",
      proceduresSection
        ? `## How to handle specific situations\n\n${proceduresSection}`
        : "",
      "",
      heuristics.length
        ? `## Decision heuristics\n\nWhen in doubt, apply these:\n${heuristics.map((h) => `- ${h}`).join("\n")}`
        : "",
      "",
      Object.keys(escalationPaths).length
        ? `## When to escalate\n\n${Object.entries(escalationPaths).map(([sit, who]) => `- ${sit}: escalate to ${who}`).join("\n")}`
        : "",
      "",
      "Always act consistently with these procedures. If a situation is not covered, err on the side of caution and surface it for human review.",
    ]
      .filter((l) => l !== undefined)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // knowledge_base
  return [
    `# ${role.role_name} Knowledge Base — ${orgName}`,
    `*Generated from company brain · ${new Date().toLocaleDateString()}*`,
    "",
    "---",
    "",
    "## Summary",
    roleSummary,
    "",
    responsibilities.length
      ? `## Responsibilities\n\n${responsibilities.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      : "",
    "",
    proceduresSection
      ? `## Decision Procedures\n\n${proceduresSection}`
      : "",
    "",
    heuristics.length
      ? `## Heuristics\n\n${heuristics.map((h) => `- ${h}`).join("\n")}`
      : "",
    "",
    domainKnowledge.length
      ? `## Domain Knowledge\n\n${domainKnowledge.map((d) => `- ${d}`).join("\n")}`
      : "",
    "",
    tools.length
      ? `## Tools & Systems\n\n${tools.map((t) => `- ${t}`).join("\n")}`
      : "",
    "",
    Object.keys(escalationPaths).length
      ? `## Escalation Paths\n\n| Situation | Escalate to |\n|-----------|-------------|\n${Object.entries(escalationPaths).map(([s, w]) => `| ${s} | ${w} |`).join("\n")}`
      : "",
    "",
    mistakes.length
      ? `## Common Mistakes\n\n${mistakes.map((m) => `- ${m}`).join("\n")}`
      : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AgentPromptsPage() {
  const { org, isLoading: orgLoading } = useOrg();
  const [roles, setRoles] = useState<RoleBrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RoleBrain | null>(null);
  const [template, setTemplate] = useState<Template>("claude_md");
  const [copied, setCopied] = useState(false);

  const fetchRoles = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/roles?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        const r: RoleBrain[] = Array.isArray(data) ? data : (data.roles || []);
        setRoles(r);
        if (r.length > 0 && r[0].has_knowledge) setSelected(r[0]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!org) return;
    fetchRoles(org.id);
  }, [org?.id, fetchRoles]);

  if (orgLoading || loading) return <LoadingSpinner />;

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

  const markdown = selected?.has_knowledge
    ? generateMarkdown(selected, org.name, template)
    : null;

  const filename =
    template === "claude_md"
      ? `CLAUDE.md`
      : template === "system_prompt"
      ? `${selected?.role_name ?? "role"}-system-prompt.md`
      : `${selected?.role_name ?? "role"}-knowledge.md`;

  function copy() {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/[0.06]">
        <h1 className="text-xl font-light text-white/85">Agent Prompts</h1>
        <p className="text-xs text-white/30 mt-0.5">
          Generate Markdown files from your company brain · feed directly into any AI agent
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: role selector + template */}
        <div className="w-64 shrink-0 border-r border-white/[0.06] flex flex-col p-4 gap-4 overflow-y-auto">

          {/* Template */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Format</p>
            <div className="flex flex-col gap-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`text-left px-3 py-2.5 rounded-xl transition-all ${
                    template === t.id ? "glass-md" : "hover:glass"
                  }`}
                >
                  <p className={`text-xs font-medium ${template === t.id ? "text-white/80" : "text-white/45"}`}>
                    {t.label}
                  </p>
                  <p className="text-[10px] text-white/25 mt-0.5 leading-snug">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Role brains */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Role brain</p>
            {roles.length === 0 ? (
              <p className="text-xs text-white/25 leading-relaxed">
                No role brains yet.{" "}
                <a href="/dashboard/roles" className="text-white/45 underline underline-offset-2">
                  Create one →
                </a>
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => r.has_knowledge && setSelected(r)}
                    disabled={!r.has_knowledge}
                    className={`text-left px-3 py-2.5 rounded-xl transition-all ${
                      selected?.id === r.id
                        ? "glass-md"
                        : r.has_knowledge
                        ? "hover:glass"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <p className={`text-xs ${selected?.id === r.id ? "text-white/80" : "text-white/50"}`}>
                      {r.role_name}
                    </p>
                    <p className="text-[10px] text-white/25 mt-0.5">
                      {r.has_knowledge
                        ? `${r.member_count} member${r.member_count !== 1 ? "s" : ""}`
                        : "No knowledge — re-extract"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected || !markdown ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-white/30">
                  {roles.length === 0
                    ? "No role brains with extracted knowledge."
                    : "Select a role brain to preview its prompt file."}
                </p>
                {roles.length === 0 && (
                  <p className="text-xs text-white/20 mt-1">
                    <a href="/dashboard/roles" className="text-white/40 underline underline-offset-2">
                      Go to Company Brain →
                    </a>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-white/40">{filename}</span>
                  <span className="text-[10px] text-white/20">·</span>
                  <span className="text-[10px] text-white/20">
                    {markdown.split("\n").length} lines
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copy}
                    className="px-3 py-1.5 rounded-lg text-xs text-white/50 glass hover:glass-md transition-all"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => downloadMarkdown(markdown, filename)}
                    className="px-3 py-1.5 rounded-lg text-xs text-white/70 glass-md hover:glass-hi transition-all"
                  >
                    Download
                  </button>
                </div>
              </div>

              {/* Markdown preview */}
              <div className="flex-1 overflow-y-auto p-6">
                <pre className="text-[11px] text-white/55 font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {markdown}
                </pre>
              </div>

              {/* Usage hint */}
              <div className="px-6 py-3 border-t border-white/[0.06]">
                <p className="text-[11px] text-white/20">
                  {template === "claude_md"
                    ? "Drop CLAUDE.md into your repo root — Claude Code reads it automatically on every session."
                    : template === "system_prompt"
                    ? "Paste as the system message when initializing your agent."
                    : "Include as context in your RAG pipeline or agent memory."}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
