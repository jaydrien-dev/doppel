"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useClones } from "@/lib/hooks/useClones";
import { updateClone } from "@/lib/api";
import type { CloneOwnerInfo } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type EmbedTab = "widget" | "iframe";
type AccessMode = CloneOwnerInfo["access_mode"];

const ACCESS_MODES: { value: AccessMode; label: string; desc: string }[] = [
  { value: "public", label: "Public", desc: "Anyone with the link can chat" },
  { value: "org_scoped", label: "Org-scoped", desc: "Only members of your org workspace can chat" },
  { value: "allowlist", label: "Allowlist", desc: "Only specific emails can chat" },
  { value: "private", label: "Private", desc: "Only you can access" },
];

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function deriveColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function ClonePicker({ clones, selected, onSelect }: {
  clones: CloneOwnerInfo[];
  selected: CloneOwnerInfo;
  onSelect: (c: CloneOwnerInfo) => void;
}) {
  if (clones.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
      {clones.map((c) => {
        const col = deriveColor(c.display_name);
        const active = c.clone_id === selected.clone_id;
        return (
          <button
            key={c.clone_id}
            onClick={() => onSelect(c)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px 6px 8px", borderRadius: 10,
              border: `1px solid ${active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`,
              background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: "50%", background: col, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 500, color: "#fff", overflow: "hidden",
            }}>
              {c.avatar_url
                ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : c.display_name[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: active ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.45)" }}>
              {c.listing_title || c.display_name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function DeployPage() {
  const { clones, isLoading, mutate } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [embedTab, setEmbedTab] = useState<EmbedTab>("widget");
  const [embedCopied, setEmbedCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Allowlist state
  const [emailInput, setEmailInput] = useState("");
  const [savingEmails, setSavingEmails] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (clones.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>Get started →</a>
        </p>
      </div>
    );
  }

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://doppel-pi.vercel.app";
  const publicUrl = `${appUrl}/add/${clone.handle}`;
  const widgetSnippet = `<script src="${appUrl}/api/widget?handle=${clone.handle}" async></script>`;
  const iframeSnippet = `<iframe\n  src="${appUrl}/embed/${clone.handle}"\n  width="400" height="560"\n  style="border:none;border-radius:16px"\n  allow="clipboard-write"\n/>`;
  const activeSnippet = embedTab === "widget" ? widgetSnippet : iframeSnippet;

  const allowedEmails: string[] = clone.allowed_emails ?? [];

  function copyToClipboard(text: string, which: "link" | "embed") {
    navigator.clipboard.writeText(text);
    if (which === "link") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    }
  }

  async function setAccessMode(mode: AccessMode) {
    if (!clone || mode === clone.access_mode) return;
    setUpdatingMode(true);
    setModeError(null);
    try {
      const res = await fetch(`/api/clones/${clone.handle}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_mode: mode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setModeError(`Failed to save: ${d.detail ?? d.error ?? res.status}`);
        return;
      }
      await mutate();
    } catch (e) {
      setModeError(String(e));
    } finally {
      setUpdatingMode(false);
    }
  }

  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!clone) return;
    const email = emailInput.trim().toLowerCase();
    if (!email || allowedEmails.includes(email)) return;
    setSavingEmails(true);
    try {
      await updateClone(clone.handle, { allowed_emails: [...allowedEmails, email] });
      setEmailInput("");
      await mutate();
    } finally {
      setSavingEmails(false);
    }
  }

  async function removeEmail(email: string) {
    if (!clone) return;
    setSavingEmails(true);
    try {
      await updateClone(clone.handle, { allowed_emails: allowedEmails.filter((e) => e !== email) });
      await mutate();
    } finally {
      setSavingEmails(false);
    }
  }

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 24, "--page-accent": "#1A73E8" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Deploy</h1>
          <ClonePicker clones={clones} selected={clone} onSelect={(c) => setSelectedId(c.clone_id)} />
        </div>
      </div>

      {/* Shareable link + QR */}
      <div className="card">
        <p className="card-title" style={{ marginBottom: 4 }}>Your clone link</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Share this link — anyone can chat with your clone.</p>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 16px" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{publicUrl}</p>
          </div>
          <button
            onClick={() => copyToClipboard(publicUrl, "link")}
            className="btn btn--primary"
            style={{ flexShrink: 0 }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost"
            style={{ flexShrink: 0 }}
          >
            Open ↗
          </a>
          <button
            onClick={() => setShowQR((v) => !v)}
            className="btn btn--ghost"
            style={{
              flexShrink: 0,
              color: showQR ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.40)",
              background: showQR ? "rgba(255,255,255,0.07)" : "transparent",
            }}
            title="Show QR code"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="10" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="1" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="2.5" y="2.5" width="2" height="2" fill="currentColor"/>
              <rect x="11.5" y="2.5" width="2" height="2" fill="currentColor"/>
              <rect x="2.5" y="11.5" width="2" height="2" fill="currentColor"/>
              <path d="M10 10h1.5v1.5H10zM12.5 10H14v1.5h-1.5zM10 12.5h1.5V14H10zM12.5 12.5H14V14h-1.5z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {showQR && (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <div className="card" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <QRCodeSVG
                value={publicUrl}
                size={140}
                bgColor="transparent"
                fgColor="rgba(255,255,255,0.7)"
                level="M"
              />
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Scan to open clone</p>
            </div>
          </div>
        )}
      </div>

      {/* 2-col grid: left = access control + rate limiting, right = shared access + embed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Access mode */}
          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Access control</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Who can chat with your clone?</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ACCESS_MODES.map(({ value, label, desc }) => {
                const active = clone.access_mode === value;
                return (
                  <button
                    key={value}
                    onClick={() => setAccessMode(value)}
                    disabled={updatingMode}
                    style={{
                      display: "flex", alignItems: "center", gap: 16,
                      borderRadius: 12, padding: "12px 16px", textAlign: "left",
                      border: `1px solid ${active ? "rgba(255,255,255,0.12)" : "transparent"}`,
                      background: active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                      cursor: updatingMode ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 12, height: 12, borderRadius: "50%",
                      border: `1px solid ${active ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.20)"}`,
                      background: active ? "rgba(255,255,255,0.30)" : "transparent",
                      flexShrink: 0, transition: "all 0.15s",
                    }} />
                    <div>
                      <p style={{ fontSize: 13, color: active ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.45)" }}>{label}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {modeError && (
              <p style={{ marginTop: 12, fontSize: 12, color: "rgba(248,113,113,0.60)", fontFamily: "ui-monospace, monospace" }}>{modeError}</p>
            )}

            {/* Allowlist email manager */}
            {clone.access_mode === "allowlist" && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginBottom: 12 }}>Allowed emails</p>

                {allowedEmails.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {allowedEmails.map((email) => (
                      <span
                        key={email}
                        className="badge badge--neutral"
                        style={{ borderRadius: 10 }}
                      >
                        {email}
                        <button
                          onClick={() => removeEmail(email)}
                          disabled={savingEmails}
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.30)", cursor: savingEmails ? "not-allowed" : "pointer", fontSize: 12, marginLeft: 4, padding: 0, opacity: savingEmails ? 0.4 : 1 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {allowedEmails.length === 0 && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>No emails yet — add some below.</p>
                )}

                <form onSubmit={addEmail} style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="colleague@example.com"
                    className="input"
                  />
                  <button
                    type="submit"
                    disabled={savingEmails || !emailInput.trim()}
                    className="btn btn--primary"
                    style={{ flexShrink: 0 }}
                  >
                    Add
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Rate limiting */}
          <RateLimitSection clone={clone} onUpdated={mutate} />
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Team access */}
          <TeamAccessSection cloneHandle={clone.handle} />

          {/* Embed widget */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p className="card-title" style={{ marginBottom: 4 }}>Embed widget</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  Add a floating chat button to any website — one line of code.
                </p>
              </div>
              {clone.access_mode !== "public" && (
                <span className="badge badge--warn" style={{ flexShrink: 0, marginLeft: 12 }}>
                  Set to Public first
                </span>
              )}
            </div>

            {/* Widget / iframe tab toggle */}
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 4, marginBottom: 16, width: "fit-content" }}>
              {(["widget", "iframe"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEmbedTab(t)}
                  style={{
                    padding: "6px 14px", borderRadius: 9, border: "none",
                    background: embedTab === t ? "rgba(255,255,255,0.07)" : "transparent",
                    color: embedTab === t ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {t === "widget" ? "Floating button" : "iFrame"}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>
              {embedTab === "widget"
                ? "Creates a floating chat bubble in the bottom-right corner of your page."
                : "Embeds the chat inline at a fixed size — good for dedicated contact pages."}
            </p>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
              <pre style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6, margin: 0 }}>
                {activeSnippet}
              </pre>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => copyToClipboard(activeSnippet, "embed")}
                className="btn btn--primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {embedCopied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M1.5 7L5 10.5 11.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  "Copy snippet"
                )}
              </button>
              {embedTab === "widget" && (
                <a
                  href={`/embed/${clone.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textDecoration: "none", transition: "color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
                >
                  Preview embed →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Access (RBAC)
// ---------------------------------------------------------------------------

type Permission = { user_id: string; role: string; granted_by: string; created_at: string };
const ROLES = ["viewer", "contributor", "admin"] as const;

function TeamAccessSection({ cloneHandle }: { cloneHandle: string }) {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "contributor" | "admin">("viewer");
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    fetch(`/api/clones/${cloneHandle}/permissions`)
      .then((r) => r.json())
      .then((d) => { setPerms(d.permissions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cloneHandle]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    const uid = newUserId.trim();
    if (!uid) return;
    setGranting(true);
    try {
      const r = await fetch(`/api/clones/${cloneHandle}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, role: newRole }),
      });
      if (r.ok) {
        const d = await r.json();
        setPerms((prev) => [
          ...prev.filter((p) => p.user_id !== uid),
          { user_id: uid, role: d.role, granted_by: "", created_at: new Date().toISOString() },
        ]);
        setNewUserId("");
      }
    } finally {
      setGranting(false);
    }
  }

  async function revoke(userId: string) {
    await fetch(`/api/clones/${cloneHandle}/permissions/${userId}`, { method: "DELETE" });
    setPerms((prev) => prev.filter((p) => p.user_id !== userId));
  }

  return (
    <div className="card">
      <p className="card-title" style={{ marginBottom: 4 }}>Shared access</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20, lineHeight: 1.6 }}>
        Share your clone with other accounts. They can chat with it based on their assigned role.
      </p>

      {loading ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
      ) : perms.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>No team members yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {perms.map((p) => (
            <div key={p.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 16px" }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, monospace" }}>{p.user_id}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "capitalize" }}>{p.role}</span>
                <button
                  onClick={() => revoke(p.user_id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.25)", transition: "color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(248,113,113,0.70)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={grant} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          placeholder="User ID"
          className="input"
          style={{ fontSize: 12 }}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as typeof newRole)}
          className="input"
          style={{ width: "auto", appearance: "none", fontSize: 12 }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r} style={{ background: "#111" }}>{r}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!newUserId.trim() || granting}
          className="btn btn--primary btn--sm"
          style={{ flexShrink: 0 }}
        >
          {granting ? "…" : "Add"}
        </button>
      </form>
    </div>
  );
}

function RateLimitSection({
  clone,
  onUpdated,
}: {
  clone: CloneOwnerInfo;
  onUpdated: () => void;
}) {
  const [limit, setLimit] = useState(clone.rate_limit_per_day ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/clones/${clone.handle}/rate-limit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_limit_per_day: limit }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  const PRESETS = [0, 5, 10, 25, 50, 100];

  return (
    <div className="card">
      <p className="card-title" style={{ marginBottom: 4 }}>Rate limiting</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20, lineHeight: 1.6 }}>
        Limit how many messages each visitor can send per day. 0 = unlimited.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => setLimit(v)}
            className={limit === v ? "btn btn--primary btn--sm" : "btn btn--ghost btn--sm"}
          >
            {v === 0 ? "Unlimited" : `${v}/day`}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="number"
          min={0}
          max={1000}
          value={limit}
          onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))}
          className="input"
          style={{ width: 80, textAlign: "center" }}
        />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>messages per visitor per day</span>
        <button
          onClick={handleSave}
          disabled={saving || limit === (clone.rate_limit_per_day ?? 0)}
          className="btn btn--primary btn--sm"
          style={{ marginLeft: "auto" }}
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}
