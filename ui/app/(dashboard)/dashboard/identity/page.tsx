"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClones } from "@/lib/hooks/useClones";
import type { CloneOwnerInfo } from "@/lib/types";
import { SelectMenu } from "@/components/ui/select-menu";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ConnectorInfo {
  connected?: boolean;
  configured: boolean;
}
interface IngestionStatus {
  gmail: ConnectorInfo;
  github: ConnectorInfo;
  notion: ConnectorInfo;
  slack: ConnectorInfo;
}
interface ConnectedTool { id: string; name: string; tool_names: string[]; enabled: boolean }
interface StyleFingerprint {
  preferred_formality?: number;
  directness?: number;
  warmth?: number;
  humor_frequency?: number;
  uses_emojis?: boolean;
  uses_contractions?: boolean;
  uses_bullet_points?: boolean;
  response_length_preference?: string;
  signature_phrases?: string[];
}

// ── Connector config ───────────────────────────────────────────────────────────

const CONNECTORS: { key: keyof IngestionStatus; name: string; desc: string; syncPath: string | null }[] = [
  { key: "gmail",  name: "Gmail",  desc: "Sent emails — vocabulary, formality, reply patterns", syncPath: "/api/ingestion/gmail-sync" },
  { key: "slack",  name: "Slack",  desc: "Channel messages — how you talk with your team",        syncPath: null },
  { key: "notion", name: "Notion", desc: "Docs and notes — thinking style, written voice",        syncPath: "/api/ingestion/notion-sync" },
  { key: "github", name: "GitHub", desc: "PR comments — technical communication style",           syncPath: "/api/ingestion/github-sync" },
];

// ── Connector row ──────────────────────────────────────────────────────────────

function ConnectorRow({
  name, desc, info, syncPath, cloneId, syncing, onSync, connectHref,
}: {
  name: string; desc: string; info: ConnectorInfo | undefined;
  syncPath: string | null; cloneId: string;
  syncing: boolean; onSync: () => void;
  connectHref: string;
}) {
  const connected = info?.connected === true;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, padding: "14px 18px",
      borderRadius: 12,
      background: connected ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${connected ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)"}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.72)", margin: 0 }}>{name}</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "2px 0 0", lineHeight: 1.4 }}>{desc}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {connected ? (
          <>
            <span style={{
              fontSize: 11, color: "rgba(52,211,153,0.70)",
              background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)",
              borderRadius: 999, padding: "2px 8px",
            }}>Connected</span>
            {syncPath && (
              <button
                onClick={onSync}
                disabled={syncing}
                style={{
                  fontSize: 11, color: "rgba(255,255,255,0.40)",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, padding: "4px 10px", cursor: syncing ? "wait" : "pointer",
                  fontFamily: "inherit", opacity: syncing ? 0.5 : 1,
                }}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            )}
          </>
        ) : (
          <Link
            href={connectHref}
            style={{
              fontSize: 11, color: "rgba(255,255,255,0.38)",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "4px 10px", textDecoration: "none",
            }}
          >
            Connect
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Style slider ───────────────────────────────────────────────────────────────

function StyleSlider({
  label, value, leftLabel, rightLabel, onChange,
}: {
  label: string; value: number; leftLabel: string; rightLabel: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>{pct}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={pct}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ width: "100%", accentColor: "rgba(255,255,255,0.55)", cursor: "pointer", height: 2 }}
      />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>{leftLabel}</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>{rightLabel}</span>
      </div>
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", width: "100%",
      }}
    >
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{label}</span>
      <div style={{
        width: 32, height: 18, borderRadius: 999,
        background: value ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.10)",
        position: "relative", transition: "background 180ms",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 17 : 3, width: 12, height: 12,
          borderRadius: "50%", background: "rgba(255,255,255,0.85)", transition: "left 180ms",
        }} />
      </div>
    </button>
  );
}

// ── Multi-clone apply chips ────────────────────────────────────────────────────

function MultiCloneChips({
  allClones, primaryId, selected, onToggle,
}: {
  allClones: CloneOwnerInfo[]; primaryId: string;
  selected: Set<string>; onToggle: (id: string) => void;
}) {
  const others = allClones.filter(c => c.clone_id !== primaryId);
  if (others.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>
        Also apply tweaks to:
      </span>
      {others.map(c => {
        const on = selected.has(c.clone_id);
        return (
          <button key={c.clone_id} onClick={() => onToggle(c.clone_id)}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
              background: on ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${on ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)"}`,
              color: on ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
              transition: "all 160ms",
            }}>
            {c.display_name}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VoicePage() {
  const { clones } = useClones();
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());

  const primary = clones.find(c => c.clone_id === primaryId) ?? clones[0] ?? null;

  const [status, setStatus]   = useState<IngestionStatus | null>(null);
  const [style, setStyle]     = useState<StyleFingerprint>({});
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Load connector status + style when primary changes
  useEffect(() => {
    if (!primary) return;
    setStatus(null);
    setStyle({});
    setDirty(false);

    fetch(`/api/tools?clone_id=${primary.clone_id}`)
      .then(r => r.json())
      .then((tools: ConnectedTool[]) => {
        const conn = (keyword: string) => {
          const kw = keyword.toLowerCase();
          return (Array.isArray(tools) ? tools : []).some(
            t => t.enabled && (t.name.toLowerCase().includes(kw) || t.tool_names?.some(tn => tn.toLowerCase().includes(kw)))
          );
        };
        setStatus({
          gmail:  { connected: conn("gmail"),  configured: conn("gmail") },
          slack:  { connected: conn("slack"),  configured: conn("slack") },
          notion: { connected: conn("notion"), configured: conn("notion") },
          github: { connected: conn("github"), configured: conn("github") },
        });
      })
      .catch(() => {});

    fetch(`/api/identity?clone_id=${primary.clone_id}`)
      .then(r => r.json())
      .then(d => { if (d.style_fingerprint) setStyle(d.style_fingerprint); })
      .catch(() => {});
  }, [primary?.clone_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchStyle(patch: Partial<StyleFingerprint>) {
    setStyle(prev => ({ ...prev, ...patch }));
    setDirty(true);
    setSaved(false);
  }

  async function saveStyle() {
    if (!primary) return;
    setSaving(true);
    const targets = [primary.clone_id, ...Array.from(extraIds)];
    await Promise.all(
      targets.map(cid =>
        fetch("/api/identity", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layer: "style_fingerprint", data: style, clone_id: cid }),
        }),
      ),
    );
    setSaving(false);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function syncConnector(key: string, path: string) {
    if (!primary) return;
    setSyncing(key);
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clone_id: primary.clone_id }),
    }).catch(() => {});
    setSyncing(null);
  }

  function toggleExtra(id: string) {
    setExtraIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const connectedCount = status
    ? Object.values(status).filter(v => v.connected === true).length
    : null;

  return (
    <div className="db-page">
      {/* Header */}
      <div className="db-page-head" style={{ marginBottom: 8 }}>
        <div>
          <p className="db-eyebrow">Clone settings</p>
          <h1 className="db-h1">Voice</h1>
        </div>
        {clones.length > 0 && (
          <SelectMenu
            value={primary?.clone_id ?? ""}
            onChange={v => { setPrimaryId(v); setExtraIds(new Set()); }}
            options={clones.map(c => ({ value: c.clone_id, label: c.display_name, avatarUrl: c.avatar_url }))}
          />
        )}
      </div>

      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", lineHeight: 1.6, marginBottom: 28, maxWidth: 480 }}>
        Your clone&apos;s voice is built from real conversations. Connect sources to let it learn how you write, then
        adjust any attributes that don&apos;t feel right.
      </p>

      {/* Multi-clone apply */}
      {clones.length > 1 && primary && (
        <div style={{ marginBottom: 28 }}>
          <MultiCloneChips
            allClones={clones}
            primaryId={primary.clone_id}
            selected={extraIds}
            onToggle={toggleExtra}
          />
        </div>
      )}

      {!primary && (
        <div className="card">
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            No clones yet. <Link href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline" }}>Create one</Link>
          </p>
        </div>
      )}

      {primary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

          {/* ── Data sources ──────────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.22)", marginBottom: 4 }}>
                  Data sources
                </p>
                {connectedCount !== null && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", margin: 0 }}>
                    {connectedCount === 0
                      ? "No sources connected — voice won't improve until you do"
                      : `${connectedCount} source${connectedCount > 1 ? "s" : ""} connected`}
                  </p>
                )}
              </div>
              <Link
                href="/dashboard/settings"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "none",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8, padding: "4px 10px" }}
              >
                Manage
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CONNECTORS.map(c => (
                <ConnectorRow
                  key={c.key}
                  name={c.name}
                  desc={c.desc}
                  info={status?.[c.key]}
                  syncPath={c.syncPath}
                  cloneId={primary.clone_id}
                  syncing={syncing === c.key}
                  onSync={() => c.syncPath && syncConnector(c.key, c.syncPath)}
                  connectHref="/dashboard/settings"
                />
              ))}
            </div>
          </section>

          {/* ── Voice profile ──────────────────────────────────────── */}
          <section>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.22)", marginBottom: 14 }}>
              Voice profile
            </p>
            <div style={{
              padding: "20px 22px", borderRadius: 14,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", flexDirection: "column", gap: 22,
            }}>
              {/* Sliders */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 32px" }}>
                <StyleSlider
                  label="Formality"
                  value={style.preferred_formality ?? 0.5}
                  leftLabel="Casual"
                  rightLabel="Formal"
                  onChange={v => patchStyle({ preferred_formality: v })}
                />
                <StyleSlider
                  label="Directness"
                  value={style.directness ?? 0.5}
                  leftLabel="Diplomatic"
                  rightLabel="Direct"
                  onChange={v => patchStyle({ directness: v })}
                />
                <StyleSlider
                  label="Warmth"
                  value={style.warmth ?? 0.5}
                  leftLabel="Cool"
                  rightLabel="Warm"
                  onChange={v => patchStyle({ warmth: v })}
                />
                <StyleSlider
                  label="Humor"
                  value={style.humor_frequency ?? 0.3}
                  leftLabel="Serious"
                  rightLabel="Playful"
                  onChange={v => patchStyle({ humor_frequency: v })}
                />
              </div>

              {/* Toggles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Toggle
                  label="Uses contractions"
                  value={style.uses_contractions ?? true}
                  onChange={v => patchStyle({ uses_contractions: v })}
                />
                <Toggle
                  label="Uses bullet points"
                  value={style.uses_bullet_points ?? false}
                  onChange={v => patchStyle({ uses_bullet_points: v })}
                />
              </div>

              {/* Response length */}
              <div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>Response length</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["brief", "moderate", "detailed"] as const).map(opt => {
                    const on = (style.response_length_preference ?? "moderate") === opt;
                    return (
                      <button key={opt} onClick={() => patchStyle({ response_length_preference: opt })}
                        style={{
                          flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                          background: on ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${on ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)"}`,
                          color: on ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.32)",
                          fontSize: 12, fontWeight: on ? 500 : 400, textTransform: "capitalize",
                          transition: "all 150ms",
                        }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Signature phrases */}
              {(style.signature_phrases ?? []).length > 0 && (
                <div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
                    Signature phrases detected
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(style.signature_phrases ?? []).map((phrase, i) => (
                      <span key={i} style={{
                        fontSize: 11, color: "rgba(255,255,255,0.50)",
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 999, padding: "3px 10px", fontStyle: "italic",
                      }}>
                        &ldquo;{phrase}&rdquo;
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Save */}
              {dirty && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={saveStyle}
                    disabled={saving}
                    style={{
                      fontSize: 12, padding: "8px 20px", borderRadius: 10,
                      background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)",
                      color: "rgba(255,255,255,0.80)", cursor: saving ? "wait" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {saving ? "Saving…" : `Save${extraIds.size > 0 ? ` to ${extraIds.size + 1} clones` : ""}`}
                  </button>
                  {saved && <span style={{ fontSize: 11, color: "rgba(52,211,153,0.65)" }}>Saved</span>}
                </div>
              )}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
