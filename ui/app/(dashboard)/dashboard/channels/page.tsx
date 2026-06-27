"use client";

import { useState } from "react";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectedTool = {
  id: string;
  name: string;
  tool_names: string[];
  enabled: boolean;
  created_at: string;
};

type AuthFlow = "oauth" | "webhook" | "credentials";
type ConnectorSection = "communication" | "productivity" | "finance";

interface ConnectorDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  authFlow: AuthFlow;
  serviceKey?: string;
  credentialLabel?: string;   // label for the API key input
  credentialHint?: string;
  skills: string[];
  section: ConnectorSection;
  toolNames: string[];
  comingSoon?: boolean;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const CONNECTORS: ConnectorDef[] = [
  // ── Communication ──
  {
    id: "gmail",
    name: "Gmail",
    subtitle: "Inbox · Drafts · Send · Labels",
    description: "Read your inbox, draft and send emails, search conversations, apply labels and archive — exactly as you would.",
    authFlow: "oauth",
    serviceKey: "gmail",
    skills: ["Email triage", "Reply drafting", "Follow-up execution", "Inbox zero"],
    section: "communication",
    toolNames: ["Gmail"],
  },
  {
    id: "gcal",
    name: "Google Calendar",
    subtitle: "Events · Invites · Scheduling",
    description: "Create and reschedule meetings, send invites, read your schedule, and avoid conflicts — on your behalf.",
    authFlow: "oauth",
    serviceKey: "gcal",
    skills: ["Meeting scheduling", "Calendar management", "Conflict detection"],
    section: "communication",
    toolNames: ["Google Calendar"],
  },
  {
    id: "slack",
    name: "Slack",
    subtitle: "Messages · Channels · DMs",
    description: "Post to channels, send direct messages, monitor threads, relay updates — all as you.",
    authFlow: "oauth",
    serviceKey: "slack",
    skills: ["Team communication", "Status updates", "Channel summaries", "Alert routing"],
    section: "communication",
    toolNames: ["Slack"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    subtitle: "Messages · Replies · Customer chats",
    description: "Your clone reads incoming WhatsApp messages and drafts replies — routed through your approval before sending. Uses the Meta WhatsApp Business API.",
    authFlow: "credentials",
    credentialLabel: "Meta API access token",
    credentialHint: "EAAxxxxxxxxx…",
    skills: ["Customer support", "Order updates", "FAQ replies", "Broadcast drafting"],
    section: "communication",
    toolNames: [],
  },
  {
    id: "zoom",
    name: "Zoom",
    subtitle: "Meetings · Recordings · Transcripts",
    description: "Schedule and cancel meetings, read recording transcripts, send post-meeting summaries and action items.",
    authFlow: "oauth",
    serviceKey: "zoom",
    skills: ["Meeting scheduling", "Transcript analysis", "Follow-up execution"],
    section: "communication",
    toolNames: [],
    comingSoon: true,
  },
  {
    id: "microsoft365",
    name: "Microsoft 365",
    subtitle: "Outlook · Teams · OneDrive",
    description: "Send Outlook email, post in Teams, manage OneDrive files and create Word and Excel documents — fully integrated.",
    authFlow: "oauth",
    serviceKey: "microsoft365",
    skills: ["Email triage", "Teams messaging", "File management", "Document creation"],
    section: "communication",
    toolNames: [],
    comingSoon: true,
  },
  {
    id: "facebook_instagram",
    name: "Facebook & Instagram",
    subtitle: "Page DMs · Comments · Posts",
    description: "Reply to DMs, respond to comments, manage your social inbox across Facebook Pages and Instagram — with your approval.",
    authFlow: "oauth",
    serviceKey: "facebook",
    skills: ["Social inbox", "Comment replies", "Customer support"],
    section: "communication",
    toolNames: [],
    comingSoon: true,
  },

  // ── Productivity ──
  {
    id: "gdrive",
    name: "Google Drive",
    subtitle: "Files · Docs · Sheets · Slides",
    description: "Search and read files, create documents and spreadsheets, share and organise your Drive — including Docs, Sheets, and Slides.",
    authFlow: "oauth",
    serviceKey: "gdrive",
    skills: ["File management", "Document writing", "Spreadsheet updates", "Deck creation"],
    section: "productivity",
    toolNames: ["Google Drive"],
  },
  {
    id: "notion",
    name: "Notion",
    subtitle: "Pages · Databases · Workspaces",
    description: "Read and write pages, update database records, create structured documents and meeting notes in your workspace.",
    authFlow: "oauth",
    serviceKey: "notion",
    skills: ["Knowledge base updates", "Meeting notes", "Project tracking", "Documentation"],
    section: "productivity",
    toolNames: ["Notion"],
  },
  {
    id: "canva",
    name: "Canva",
    subtitle: "Designs · Templates · Brand Kit",
    description: "Create on-brand designs using your brand kit, update existing designs, export as PDF or PNG ready for use.",
    authFlow: "oauth",
    serviceKey: "canva",
    skills: ["Flyer creation", "Presentation design", "Social graphics", "Brand consistency"],
    section: "productivity",
    toolNames: [],
    comingSoon: true,
  },

  // ── Finance ──
  {
    id: "sql_accounting",
    name: "SQL Accounting",
    subtitle: "Invoices · Payments · Cash Flow",
    description: "Monitor invoices and payment status, flag overdue accounts, generate financial summaries — built for Malaysian SMEs and GLCs.",
    authFlow: "credentials",
    credentialLabel: "SQL Account API credentials",
    credentialHint: "API URL + credentials",
    skills: ["Invoice tracking", "Payment alerts", "Financial reporting", "Cash flow monitoring"],
    section: "finance",
    toolNames: [],
    comingSoon: true,
  },
];

const SECTIONS: { id: ConnectorSection; label: string; desc: string }[] = [
  { id: "communication", label: "Communication",       desc: "Email, messaging, and meetings — where work actually happens." },
  { id: "productivity",  label: "Files & Productivity", desc: "The apps your delegate reads from and writes to." },
  { id: "finance",       label: "Finance",              desc: "Your accounting system, delegated." },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function ConnectorIcon({ id }: { id: string }) {
  const c = "rgba(255,255,255,0.52)";
  const p: React.SVGProps<SVGSVGElement> = { width: 18, height: 18, fill: "none" };

  switch (id) {
    case "gmail":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="2" y="5" width="16" height="12" rx="2" stroke={c} strokeWidth="1.3"/>
          <path d="M2 7l8 5 8-5" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      );
    case "gcal":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="2.5" y="4.5" width="15" height="13" rx="2" stroke={c} strokeWidth="1.3"/>
          <path d="M7 2.5v4M13 2.5v4M2.5 8.5h15" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="10" cy="13" r="1.5" fill={c} opacity=".6"/>
        </svg>
      );
    case "slack":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="7" y="2" width="3" height="9" rx="1.5" fill={c}/>
          <rect x="7" y="13" width="3" height="3" rx="1.5" fill={c} opacity=".4"/>
          <rect x="11" y="9" width="7" height="3" rx="1.5" fill={c}/>
          <rect x="2" y="9" width="3" height="3" rx="1.5" fill={c} opacity=".4"/>
          <rect x="10" y="7" width="3" height="9" rx="1.5" fill={c} opacity=".6"/>
          <rect x="2" y="7" width="3" height="3" rx="1.5" fill={c} opacity=".25"/>
          <rect x="7" y="11" width="9" height="3" rx="1.5" fill={c} opacity=".6"/>
          <rect x="10" y="2" width="3" height="3" rx="1.5" fill={c} opacity=".25"/>
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <path d="M10 2a8 8 0 0 0-6.93 11.95L2 18l4.17-1.06A8 8 0 1 0 10 2z" stroke={c} strokeWidth="1.3"/>
          <path d="M7.5 8c.4.8 1.2 2 2.5 2.8.3-.3.7-.6 1-.5.5.1 1.2.5 1.2.9 0 .5-.5 1-1 1.2-.9.3-2.4-.3-3.8-1.7S5.8 8.5 6 7.5c.2-.5.7-.9 1.2-.9.3 0 .8.7.8 1z" fill={c}/>
        </svg>
      );
    case "zoom":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="2" y="6" width="11" height="9" rx="2" stroke={c} strokeWidth="1.3"/>
          <path d="M13 9l5-3v8l-5-3V9z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
      );
    case "microsoft365":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="2"  y="2"  width="7" height="7" rx="1" fill={c}/>
          <rect x="11" y="2"  width="7" height="7" rx="1" fill={c} opacity=".60"/>
          <rect x="2"  y="11" width="7" height="7" rx="1" fill={c} opacity=".60"/>
          <rect x="11" y="11" width="7" height="7" rx="1" fill={c} opacity=".30"/>
        </svg>
      );
    case "facebook_instagram":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="2" y="2" width="7" height="7" rx="2" stroke={c} strokeWidth="1.2"/>
          <circle cx="5.5" cy="5.5" r="1.5" fill={c}/>
          <circle cx="8.2" cy="3" r=".7" fill={c}/>
          <rect x="11" y="2" width="7" height="16" rx="2" stroke={c} strokeWidth="1.2"/>
          <path d="M14.5 9h-1v-1.5A.5.5 0 0 1 14 7h1" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M13.5 10.5h3M14.5 13h2" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      );
    case "gdrive":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <path d="M10 3L2.5 16h5L10 10l2.5 6h5L10 3z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="M7 13h6" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity=".5"/>
        </svg>
      );
    case "notion":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <rect x="3" y="2" width="14" height="16" rx="2" stroke={c} strokeWidth="1.3"/>
          <path d="M7 6.5h6M7 10h6M7 13.5h4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      );
    case "canva":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.3"/>
          <path d="M7.5 13.5V8l2.5 2.5L12.5 8v5.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "sql_accounting":
      return (
        <svg {...p} viewBox="0 0 20 20">
          <ellipse cx="10" cy="5.5" rx="6.5" ry="2.5" stroke={c} strokeWidth="1.3"/>
          <path d="M3.5 5.5v4c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-4" stroke={c} strokeWidth="1.3"/>
          <path d="M3.5 9.5v4c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-4" stroke={c} strokeWidth="1.3"/>
        </svg>
      );
    default:
      return (
        <svg {...p} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.3"/>
        </svg>
      );
  }
}

// ─── Credential input modal ───────────────────────────────────────────────────

function CredentialsModal({
  def, cloneId, onClose, onSaved,
}: {
  def: ConnectorDef;
  cloneId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clone_id: cloneId,
          name: def.name,
          server_url: `native://${def.id}`,
          transport: "native",
          api_key: value.trim(),
        }),
      });
      if (!res.ok) { setErr("Failed to save. Check your key and try again."); return; }
      onSaved();
      onClose();
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 18, padding: "28px 28px 24px", maxWidth: 420, width: "100%",
        display: "flex", flexDirection: "column", gap: 16,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ConnectorIcon id={def.id} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.82)", margin: 0 }}>
              Connect {def.name}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "2px 0 0" }}>
              {def.subtitle}
            </p>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0, lineHeight: 1.65 }}>
          {def.description}
        </p>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>
            {def.credentialLabel}
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder={def.credentialHint ?? ""}
            autoFocus
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 10, fontSize: 12,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.75)", outline: "none", fontFamily: "monospace",
              boxSizing: "border-box" as const,
            }}
          />
          {err && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", margin: "6px 0 0" }}>{err}</p>}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button onClick={onClose} style={{
            padding: "7px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer",
            background: "transparent", border: "1px solid rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.40)", fontFamily: "inherit",
          }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !value.trim()} style={{
            padding: "7px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer",
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.75)", fontFamily: "inherit",
            opacity: saving || !value.trim() ? 0.4 : 1, transition: "opacity 150ms",
          }}>
            {saving ? "Saving…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Connector card ───────────────────────────────────────────────────────────

function ConnectorCard({
  def, tools, cloneId, userId, onRefresh,
}: {
  def: ConnectorDef;
  tools: ConnectedTool[];
  cloneId: string;
  userId: string;
  onRefresh: () => void;
}) {
  const matchingTools = tools.filter((t) => def.toolNames.includes(t.name) || t.name === def.name);
  const isConnected = matchingTools.length > 0;
  const [disconnecting, setDisconnecting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname.replace("3000", "8000")}/webhook/whatsapp/${cloneId}`
      : `https://api.doppel.ai/webhook/whatsapp/${cloneId}`;

  async function handleDisconnect() {
    setDisconnecting(true);
    await Promise.all(matchingTools.map((t) => fetch(`/api/tools/${t.id}?clone_id=${cloneId}`, { method: "DELETE" })));
    onRefresh();
    setDisconnecting(false);
  }

  function handleConnect() {
    if (def.authFlow === "credentials") {
      setShowModal(true);
    } else {
      window.location.href = `/api/oauth-start?service=${def.serviceKey}&clone_id=${cloneId}&user_id=${userId}`;
    }
  }

  return (
    <>
      {showModal && (
        <CredentialsModal
          def={def}
          cloneId={cloneId}
          onClose={() => setShowModal(false)}
          onSaved={() => { onRefresh(); setShowModal(false); }}
        />
      )}

      <div style={{
        borderRadius: 14,
        border: `1px solid ${isConnected ? "rgba(52,211,153,0.13)" : "rgba(255,255,255,0.07)"}`,
        background: isConnected ? "rgba(52,211,153,0.018)" : "rgba(255,255,255,0.018)",
        padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 12,
        opacity: def.comingSoon ? 0.40 : 1,
        transition: "border-color 200ms",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ConnectorIcon id={def.id} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>
                {def.name}
              </span>
              {def.comingSoon ? (
                <span style={{
                  fontSize: 10, padding: "1px 7px", borderRadius: 999,
                  color: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.07)",
                }}>Soon</span>
              ) : isConnected ? (
                <span style={{
                  fontSize: 10, padding: "1px 7px", borderRadius: 999,
                  color: "rgba(52,211,153,0.75)", background: "rgba(52,211,153,0.07)",
                  border: "1px solid rgba(52,211,153,0.16)",
                }}>Connected</span>
              ) : null}
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.26)", margin: "2px 0 0" }}>
              {def.subtitle}
            </p>
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", margin: 0, lineHeight: 1.65 }}>
          {def.description}
        </p>

        {/* Skills */}
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
          {def.skills.map((s) => (
            <span key={s} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.28)",
            }}>
              {s}
            </span>
          ))}
        </div>

        {/* WhatsApp webhook */}
        {def.authFlow === "webhook" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <code style={{
              flex: 1, fontSize: 10, padding: "6px 10px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.32)", overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }}>
              {webhookUrl}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{
                padding: "5px 10px", borderRadius: 7, fontSize: 10, flexShrink: 0,
                background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                color: copied ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.32)",
                cursor: "pointer", fontFamily: "inherit", transition: "color 150ms",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {/* Action */}
        {!def.comingSoon && def.authFlow !== "webhook" && (
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 2 }}>
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                style={{
                  padding: "4px 12px", borderRadius: 8, fontSize: 11,
                  background: "transparent", border: "1px solid rgba(248,113,113,0.13)",
                  color: "rgba(248,113,113,0.52)", cursor: "pointer", fontFamily: "inherit",
                  opacity: disconnecting ? 0.4 : 1, transition: "all 150ms",
                }}
                onMouseEnter={(e) => { if (!disconnecting) { e.currentTarget.style.borderColor = "rgba(248,113,113,0.28)"; e.currentTarget.style.color = "rgba(248,113,113,0.80)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.13)"; e.currentTarget.style.color = "rgba(248,113,113,0.52)"; }}
              >
                {disconnecting ? "Removing…" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                style={{
                  padding: "4px 12px", borderRadius: 8, fontSize: 11,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.52)", cursor: "pointer", fontFamily: "inherit",
                  transition: "all 150ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.52)"; }}
              >
                Connect →
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function ConnectorsPanel({ cloneId }: { cloneId: string }) {
  const { user } = useUser();
  const { data, mutate } = useSWR(
    `/api/tools?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const tools: ConnectedTool[] = Array.isArray(data) ? data : [];
  const userId = user?.id ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {SECTIONS.map((sec) => {
        const connectors = CONNECTORS.filter((c) => c.section === sec.id);
        return (
          <div key={sec.id}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.09em", color: "rgba(255,255,255,0.22)", margin: "0 0 2px" }}>
                {sec.label}
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.26)", margin: 0 }}>
                {sec.desc}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {connectors.map((def) => (
                <ConnectorCard
                  key={def.id}
                  def={def}
                  tools={tools}
                  cloneId={cloneId}
                  userId={userId}
                  onRefresh={() => mutate()}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChannelsPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find((c) => c.clone_id === selectedId) ?? clones[0] ?? null;

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Connectors</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
            Connect the tools your delegate acts in. Every action routes through your approval.
          </p>
        </div>
        {clones.length > 1 && clone && (
          <ClonePicker clones={clones} selected={clone} onSelect={(c) => setSelectedId(c.clone_id)} />
        )}
      </div>

      {isLoading ? null : clone ? (
        <ConnectorsPanel cloneId={clone.clone_id} />
      ) : (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          Create a clone first to connect tools.
        </p>
      )}
    </div>
  );
}
