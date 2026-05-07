"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useClone } from "@/lib/hooks/useClone";
import { updateClone } from "@/lib/api";
import type { CloneOwnerInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type EmbedTab = "widget" | "iframe";
type AccessMode = CloneOwnerInfo["access_mode"];

const ACCESS_MODES: { value: AccessMode; label: string; desc: string }[] = [
  { value: "public", label: "Public", desc: "Anyone with the link can chat" },
  { value: "org_scoped", label: "Org-scoped", desc: "Only members of your org workspace can chat" },
  { value: "allowlist", label: "Allowlist", desc: "Only specific emails can chat" },
  { value: "private", label: "Private", desc: "Only you can access" },
];

export default function DeployPage() {
  const { clone, isLoading, mutate } = useClone();
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = `${appUrl}/c/${clone.handle}`;
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
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Deploy</h1>
        <p className="text-sm text-white/35 mt-1">Share your clone with the world.</p>
      </div>

      {/* Shareable link + QR */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-medium text-white/60 mb-1">Your clone link</h3>
        <p className="text-xs text-white/35 mb-4">Share this link — anyone can chat with your clone.</p>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 glass rounded-xl px-4 py-2.5">
            <p className="text-sm text-white/60 font-mono truncate">{publicUrl}</p>
          </div>
          <button
            onClick={() => copyToClipboard(publicUrl, "link")}
            className="glass-md hover:glass-hi rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all shrink-0"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="glass hover:glass-md rounded-xl px-4 py-2.5 text-sm text-white/50 hover:text-white/70 transition-all shrink-0"
          >
            Open ↗
          </a>
          <button
            onClick={() => setShowQR((v) => !v)}
            className={cn(
              "glass hover:glass-md rounded-xl px-4 py-2.5 text-sm transition-all shrink-0",
              showQR ? "text-white/70 glass-md" : "text-white/40 hover:text-white/60"
            )}
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
          <div className="flex justify-center py-4">
            <div className="glass rounded-2xl p-5 inline-flex flex-col items-center gap-3">
              <QRCodeSVG
                value={publicUrl}
                size={140}
                bgColor="transparent"
                fgColor="rgba(255,255,255,0.7)"
                level="M"
              />
              <p className="text-[10px] text-white/25">Scan to open clone</p>
            </div>
          </div>
        )}
      </div>

      {/* 2-col grid: left = access control + rate limiting, right = team access + embed */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Access mode */}
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-1">Access control</h3>
            <p className="text-xs text-white/35 mb-4">Who can chat with your clone?</p>

            <div className="flex flex-col gap-2">
              {ACCESS_MODES.map(({ value, label, desc }) => {
                const active = clone.access_mode === value;
                return (
                  <button
                    key={value}
                    onClick={() => setAccessMode(value)}
                    disabled={updatingMode}
                    className={`flex items-center gap-4 rounded-xl px-4 py-3 text-left transition-all border ${
                      active
                        ? "glass-md border-white/[0.12]"
                        : "glass border-transparent hover:glass"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full border transition-all ${
                        active ? "border-white/60 bg-white/30" : "border-white/20"
                      }`}
                    />
                    <div>
                      <p className={`text-sm ${active ? "text-white/80" : "text-white/45"}`}>{label}</p>
                      <p className="text-xs text-white/30">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {modeError && (
              <p className="mt-3 text-xs text-red-400/60 font-mono">{modeError}</p>
            )}

            {/* Allowlist email manager */}
            {clone.access_mode === "allowlist" && (
              <div className="mt-5 pt-5 border-t border-white/[0.06]">
                <p className="text-xs text-white/40 mb-3">Allowed emails</p>

                {allowedEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {allowedEmails.map((email) => (
                      <span
                        key={email}
                        className="flex items-center gap-1.5 glass rounded-xl px-3 py-1.5 text-xs text-white/60"
                      >
                        {email}
                        <button
                          onClick={() => removeEmail(email)}
                          disabled={savingEmails}
                          className="text-white/25 hover:text-white/60 transition-colors ml-1 disabled:opacity-40"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {allowedEmails.length === 0 && (
                  <p className="text-xs text-white/25 mb-3">No emails yet — add some below.</p>
                )}

                <form onSubmit={addEmail} className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="colleague@example.com"
                    className="flex-1 glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingEmails || !emailInput.trim()}
                    className="glass-md hover:glass-hi rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
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
        <div className="flex flex-col gap-6">
          {/* Team access */}
          <TeamAccessSection cloneHandle={clone.handle} />

          {/* Embed widget */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-white/60 mb-1">Embed widget</h3>
                <p className="text-xs text-white/35">
                  Add a floating chat button to any website — one line of code.
                </p>
              </div>
              {clone.access_mode !== "public" && (
                <span className="text-[10px] text-amber-300/60 bg-amber-400/10 px-2 py-1 rounded-lg shrink-0 ml-3">
                  Set to Public first
                </span>
              )}
            </div>

            <div className="flex gap-1 glass rounded-xl p-1 mb-4 w-fit">
              {(["widget", "iframe"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setEmbedTab(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs transition-all capitalize",
                    embedTab === tab ? "glass-md text-white/80" : "text-white/35 hover:text-white/55"
                  )}
                >
                  {tab === "widget" ? "Floating button" : "iFrame"}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-white/25 mb-3">
              {embedTab === "widget"
                ? "Creates a floating chat bubble in the bottom-right corner of your page."
                : "Embeds the chat inline at a fixed size — good for dedicated contact pages."}
            </p>

            <div className="glass rounded-xl px-4 py-3 mb-3">
              <pre className="text-xs text-white/50 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {activeSnippet}
              </pre>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => copyToClipboard(activeSnippet, "embed")}
                className="glass-md hover:glass-hi rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all flex items-center gap-2"
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
                  className="text-xs text-white/30 hover:text-white/55 transition-colors"
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
    <div className="glass rounded-2xl p-6">
      <h3 className="text-sm font-medium text-white/60 mb-1">Team access</h3>
      <p className="text-xs text-white/35 mb-5 leading-relaxed">
        Grant specific users access to this clone with a defined role.
      </p>

      {loading ? (
        <p className="text-xs text-white/25">Loading…</p>
      ) : perms.length === 0 ? (
        <p className="text-xs text-white/25 mb-4">No team members yet.</p>
      ) : (
        <div className="space-y-2 mb-5">
          {perms.map((p) => (
            <div key={p.user_id} className="flex items-center justify-between glass rounded-xl px-4 py-2.5">
              <div>
                <p className="text-xs text-white/60 font-mono">{p.user_id}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/40 capitalize">{p.role}</span>
                <button
                  onClick={() => revoke(p.user_id)}
                  className="text-[11px] text-white/25 hover:text-red-400/70 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={grant} className="flex gap-2">
        <input
          type="text"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          placeholder="User ID"
          className="flex-1 glass rounded-xl px-3 py-2 text-xs text-white/60 placeholder:text-white/20 outline-none focus:border-white/15"
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as typeof newRole)}
          className="glass rounded-xl px-2 py-2 text-xs text-white/60 outline-none"
        >
          {ROLES.map((r) => (
            <option key={r} value={r} className="bg-neutral-900 capitalize">{r}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!newUserId.trim() || granting}
          className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
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
    <div className="glass rounded-2xl p-6">
      <h3 className="text-sm font-medium text-white/60 mb-1">Rate limiting</h3>
      <p className="text-xs text-white/35 mb-5 leading-relaxed">
        Limit how many messages each visitor can send per day. 0 = unlimited.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => setLimit(v)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs transition-all border",
              limit === v
                ? "glass-md text-white/80 border-white/[0.12]"
                : "glass text-white/40 border-transparent hover:text-white/60"
            )}
          >
            {v === 0 ? "Unlimited" : `${v}/day`}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          max={1000}
          value={limit}
          onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-24 glass rounded-xl px-3 py-2 text-sm text-white/80 outline-none text-center"
        />
        <span className="text-xs text-white/35">messages per visitor per day</span>
        <button
          onClick={handleSave}
          disabled={saving || limit === (clone.rate_limit_per_day ?? 0)}
          className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40 ml-auto"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}

