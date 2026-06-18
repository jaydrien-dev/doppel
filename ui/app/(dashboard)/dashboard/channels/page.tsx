"use client";

import { useState } from "react";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type ConnectedTool = {
  id: string;
  name: string;
  server_url: string;
  transport: string;
  tool_names: string[];
  enabled: boolean;
  created_at: string;
};

const CHANNEL_DEFS: { id: string; label: string; desc: string }[] = [
  { id: "gmail",  label: "Gmail",          desc: "Read and send email on your behalf." },
  { id: "gcal",   label: "Google Calendar", desc: "Read and create calendar events." },
  { id: "gdrive", label: "Google Drive",    desc: "Search and manage files." },
  { id: "slack",  label: "Slack",           desc: "Post messages and read channels." },
  { id: "github", label: "GitHub",          desc: "Read issues, PRs, and repos." },
  { id: "notion", label: "Notion",          desc: "Read and edit pages." },
];

const TOOL_NAME_TO_ID: Record<string, string> = {
  "Gmail":               "gmail",
  "Google Calendar":     "gcal",
  "Google Drive":        "gdrive",
  "Slack":               "slack",
  "GitHub Integration":  "github",
  "Notion":              "notion",
};

function ChannelsPanel({ cloneId }: { cloneId: string }) {
  const { user } = useUser();
  const { data, mutate } = useSWR<ConnectedTool[]>(
    `/api/tools?clone_id=${cloneId}`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const tools = data ?? [];
  const connectedIds = new Set(tools.map((t) => TOOL_NAME_TO_ID[t.name]).filter(Boolean));
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname.replace("3000", "8000")}/webhook/whatsapp/${cloneId}`
    : `https://api.doppel.ai/webhook/whatsapp/${cloneId}`;

  async function disconnect(toolId: string) {
    const tool = tools.find((t) => TOOL_NAME_TO_ID[t.name] === toolId);
    if (!tool) return;
    setDisconnecting(toolId);
    await fetch(`/api/tools/${tool.id}`, { method: "DELETE" });
    mutate();
    setDisconnecting(null);
  }

  function connect(serviceId: string) {
    const uid = user?.id ?? "";
    window.location.href = `/api/oauth-start?service=${serviceId}&clone_id=${cloneId}&user_id=${uid}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* WhatsApp */}
      <div style={{
        borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)", padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>WhatsApp</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>
              Paste this URL into your Twilio number&apos;s webhook settings.
            </p>
          </div>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 999, flexShrink: 0, marginTop: 2,
            color: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            Manual setup
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{
            flex: 1, fontSize: 11, padding: "7px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.50)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {webhookUrl}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 11,
              background: "transparent", border: "1px solid rgba(255,255,255,0.10)",
              color: copied ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.40)",
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              transition: "color 150ms",
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* OAuth channels */}
      {CHANNEL_DEFS.map((ch) => {
        const isConnected     = connectedIds.has(ch.id);
        const isDisconnecting = disconnecting === ch.id;
        return (
          <div key={ch.id} style={{
            borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)", padding: "14px 18px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>{ch.label}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>{ch.desc}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {isConnected && (
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  color: "rgba(52,211,153,0.70)", background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.18)",
                }}>
                  Connected
                </span>
              )}
              {isConnected ? (
                <button
                  disabled={isDisconnecting}
                  onClick={() => disconnect(ch.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11,
                    background: "transparent", border: "1px solid rgba(248,113,113,0.15)",
                    color: "rgba(248,113,113,0.60)", cursor: "pointer", fontFamily: "inherit",
                    opacity: isDisconnecting ? 0.4 : 1, transition: "all 150ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.30)"; e.currentTarget.style.color = "rgba(248,113,113,0.85)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.60)"; }}
                >
                  {isDisconnecting ? "…" : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={() => connect(ch.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.55)", cursor: "pointer", fontFamily: "inherit",
                    transition: "all 150ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
                >
                  Connect →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ChannelsPage() {
  const { clones } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find((c) => c.clone_id === selectedId) ?? clones[0] ?? null;

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Channels</h1>
        </div>
        {clones.length > 1 && clone && (
          <ClonePicker clones={clones} selected={clone} onSelect={(c) => setSelectedId(c.clone_id)} />
        )}
      </div>

      <div style={{ maxWidth: 640 }}>
        {clone ? (
          <>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 20 }}>
              Connect tools and communication channels. Your clone acts on your behalf across all connected surfaces.
            </p>
            <ChannelsPanel cloneId={clone.clone_id} />
          </>
        ) : (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            Create a clone first to connect channels.
          </p>
        )}
      </div>
    </div>
  );
}
