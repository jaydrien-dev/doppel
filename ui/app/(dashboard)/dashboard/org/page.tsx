"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OrgInfo { id: string; name: string; slug: string; is_owner: boolean; }

interface OrgMember {
  user_id: string;
  role: "admin" | "member";
  joined_at: string | null;
  clone: { clone_id: string; display_name: string; handle: string; access_mode: string } | null;
}

interface OrgClone {
  clone_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  category: string | null;
  description: string;
  access_mode: string;
  price_per_query: number;
  total_queries: number;
  owner_user_id: string;
  member_role: "admin" | "member";
}

interface CloneMember { user_id: string; role: string; }

interface UserProfile { name: string; email: string; image_url: string | null; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ACCESS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  org_scoped: { label: "Org-wide",  color: "rgba(52,211,153,0.85)",  bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.20)" },
  private:    { label: "Private",   color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.09)" },
  public:     { label: "Public",    color: "rgba(107,174,255,0.80)", bg: "rgba(26,115,232,0.08)",  border: "rgba(26,115,232,0.20)" },
  allowlist:  { label: "Allowlist", color: "rgba(251,191,36,0.80)",  bg: "rgba(251,191,36,0.07)",  border: "rgba(251,191,36,0.18)" },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SectionHead({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: 0 }}>
        {label}
      </p>
      {count !== undefined && (
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.30)" }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberRow — defined at module level to avoid recreating component type
// ---------------------------------------------------------------------------
function MemberRow({
  member, profiles, currentUserId, changingRole, removing,
  onRoleChange, onRemove,
}: {
  member: OrgMember;
  profiles: Record<string, UserProfile>;
  currentUserId: string;
  changingRole: string | null;
  removing: string | null;
  onRoleChange: (userId: string, role: "admin" | "member") => void;
  onRemove: (userId: string) => void;
}) {
  const profile = profiles[member.user_id];
  const name = profile?.name || member.user_id.slice(0, 16) + "…";
  const email = profile?.email || "";
  const isSelf = member.user_id === currentUserId;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px", borderRadius: 14,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0, overflow: "hidden",
        background: "rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.50)",
      }}>
        {profile?.image_url
          ? <img src={profile.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : name[0]?.toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>
          {name}{isSelf ? " (you)" : ""}
        </p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "2px 0 0" }}>
          {email || (member.clone ? `@${member.clone.handle}` : "No clone")} · {formatDate(member.joined_at)}
        </p>
      </div>

      {/* Role select */}
      <select
        value={member.role}
        disabled={changingRole === member.user_id || isSelf}
        onChange={(e) => onRoleChange(member.user_id, e.target.value as "admin" | "member")}
        style={{
          fontSize: 12, padding: "5px 10px", borderRadius: 8,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
          color: member.role === "admin" ? "rgba(167,139,250,0.85)" : "rgba(255,255,255,0.50)",
          cursor: isSelf ? "default" : "pointer", fontFamily: "inherit", outline: "none",
          opacity: changingRole === member.user_id ? 0.5 : 1,
        }}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>

      {/* Remove */}
      {!isSelf && (
        <button
          onClick={() => onRemove(member.user_id)}
          disabled={removing === member.user_id}
          title="Remove member"
          style={{
            width: 30, height: 30, borderRadius: 8,
            border: "1px solid rgba(239,68,68,0.20)",
            background: "rgba(239,68,68,0.06)", color: "rgba(239,68,68,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 160ms", flexShrink: 0,
            opacity: removing === member.user_id ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "rgba(239,68,68,0.85)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.color = "rgba(239,68,68,0.55)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CloneAccessPanel — per-clone expand to manage individual member access
// ---------------------------------------------------------------------------
function CloneAccessPanel({
  clone, members, profiles, currentUserId,
}: {
  clone: OrgClone;
  members: OrgMember[];
  profiles: Record<string, UserProfile>;
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cloneMembers, setCloneMembers] = useState<CloneMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [accessMode, setAccessMode] = useState(clone.access_mode);

  async function fetchCloneMembers() {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/org/admin/clones/${clone.clone_id}/members`);
      const d = await res.json();
      setCloneMembers(d.members ?? []);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleExpand() {
    if (!expanded) await fetchCloneMembers();
    setExpanded((v) => !v);
  }

  async function handleToggleOrgWide() {
    const newMode = accessMode === "org_scoped" ? "private" : "org_scoped";
    setToggling(true);
    try {
      await fetch(`/api/org/admin/clones/${clone.clone_id}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_mode: newMode }),
      });
      setAccessMode(newMode);
    } finally {
      setToggling(false);
    }
  }

  async function handleGrant(targetUserId: string) {
    setGranting(targetUserId);
    try {
      await fetch(`/api/org/admin/clones/${clone.clone_id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
      await fetchCloneMembers();
    } finally {
      setGranting(null);
    }
  }

  async function handleRevoke(targetUserId: string) {
    setRevoking(targetUserId);
    try {
      await fetch(`/api/org/admin/clones/${clone.clone_id}/members/${targetUserId}`, {
        method: "DELETE",
      });
      setCloneMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
    } finally {
      setRevoking(null);
    }
  }

  const am = ACCESS_LABELS[accessMode] ?? ACCESS_LABELS.private;
  const isPublicWarning = accessMode === "public";
  const grantedIds = new Set(cloneMembers.map((m) => m.user_id));
  const eligible = members.filter((m) => !grantedIds.has(m.user_id) && m.user_id !== clone.owner_user_id);

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      background: accessMode === "org_scoped" ? "rgba(52,211,153,0.04)" : "rgba(255,255,255,0.025)",
      border: `1px solid ${accessMode === "org_scoped" ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.07)"}`,
      transition: "all 200ms",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0, overflow: "hidden",
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.50)",
        }}>
          {clone.avatar_url
            ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : clone.display_name[0]?.toUpperCase()}
        </div>

        {/* Name + owner */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>
              {clone.display_name}
            </p>
            {clone.owner_user_id === currentUserId && (
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.30)" }}>yours</span>
            )}
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "2px 0 0" }}>
            @{clone.handle} · {clone.total_queries.toLocaleString()} queries
            {profiles[clone.owner_user_id] && ` · by ${profiles[clone.owner_user_id].name}`}
          </p>
        </div>

        {/* Access badge */}
        <span style={{
          fontSize: 11, padding: "4px 10px", borderRadius: 999,
          background: am.bg, border: `1px solid ${am.border}`, color: am.color, whiteSpace: "nowrap",
        }}>
          {am.label}
        </span>

        {/* Org-wide toggle */}
        <button
          onClick={handleToggleOrgWide}
          disabled={toggling}
          style={{
            padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            background: accessMode === "org_scoped" ? "rgba(239,68,68,0.07)" : "rgba(52,211,153,0.08)",
            border: `1px solid ${accessMode === "org_scoped" ? "rgba(239,68,68,0.18)" : "rgba(52,211,153,0.22)"}`,
            color: accessMode === "org_scoped" ? "rgba(239,68,68,0.75)" : "rgba(52,211,153,0.80)",
            transition: "all 160ms", opacity: toggling ? 0.5 : 1,
          }}
        >
          {toggling ? "…" : accessMode === "org_scoped" ? "Remove org-wide" : "Share org-wide"}
        </button>

        {/* Expand */}
        <button
          onClick={handleExpand}
          style={{
            width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.09)",
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 160ms", flexShrink: 0,
          }}
          title={expanded ? "Collapse" : "Manage individual access"}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
            style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Public clone warning */}
      {isPublicWarning && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 16px",
          background: "rgba(251,191,36,0.07)",
          borderTop: "1px solid rgba(251,191,36,0.15)",
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M7 2L13 12H1L7 2z" stroke="rgba(251,191,36,0.80)" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M7 6v2.5M7 10v.5" stroke="rgba(251,191,36,0.80)" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: "rgba(251,191,36,0.80)", margin: 0 }}>
            This clone is <strong>public</strong> — anyone on the internet can access it, not just org members.
          </p>
        </div>
      )}

      {/* Expanded member access panel */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px 16px" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginBottom: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Individual access
          </p>

          {loadingMembers ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
          ) : (
            <>
              {/* Granted members */}
              {cloneMembers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {cloneMembers.map((cm) => {
                    const p = profiles[cm.user_id];
                    return (
                      <div key={cm.user_id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 12px", borderRadius: 10,
                        background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)",
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                          background: "rgba(255,255,255,0.07)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, color: "rgba(255,255,255,0.45)",
                        }}>
                          {p?.image_url
                            ? <img src={p.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : (p?.name[0] ?? "?")}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", margin: 0 }}>
                            {p?.name ?? cm.user_id.slice(0, 14)}
                          </p>
                          {p?.email && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "1px 0 0" }}>{p.email}</p>}
                        </div>
                        <span style={{ fontSize: 10, color: "rgba(52,211,153,0.70)" }}>Has access</span>
                        <button
                          onClick={() => handleRevoke(cm.user_id)}
                          disabled={revoking === cm.user_id}
                          style={{
                            fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                            background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)",
                            color: "rgba(239,68,68,0.70)", fontFamily: "inherit",
                            opacity: revoking === cm.user_id ? 0.5 : 1,
                          }}
                        >
                          {revoking === cm.user_id ? "…" : "Revoke"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add members */}
              {eligible.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>Add member:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {eligible.map((m) => {
                      const p = profiles[m.user_id];
                      return (
                        <div key={m.user_id} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "7px 12px", borderRadius: 10,
                          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                        }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: 7, overflow: "hidden", flexShrink: 0,
                            background: "rgba(255,255,255,0.07)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, color: "rgba(255,255,255,0.40)",
                          }}>
                            {p?.image_url
                              ? <img src={p.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : (p?.name[0] ?? "?")}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", margin: 0 }}>
                              {p?.name ?? m.user_id.slice(0, 14)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleGrant(m.user_id)}
                            disabled={granting === m.user_id}
                            style={{
                              fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                              background: "rgba(26,115,232,0.10)", border: "1px solid rgba(26,115,232,0.22)",
                              color: "rgba(107,174,255,0.80)", fontFamily: "inherit",
                              opacity: granting === m.user_id ? 0.5 : 1,
                            }}
                          >
                            {granting === m.user_id ? "…" : "Grant access"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {cloneMembers.length === 0 && eligible.length === 0 && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
                  All org members have been added, or share org-wide instead.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-org gate (shown when user has no org)
// ---------------------------------------------------------------------------
function CreateOrgGate({ onCreated }: { onCreated: () => void }) {
  const { user } = useUser();
  const [tier, setTier] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Check clone tier
    fetch("/api/clones")
      .then((r) => r.json())
      .then((d) => {
        const clones: { subscription_tier?: string }[] = d.clones ?? [];
        const tiers = clones.map((c) => c.subscription_tier ?? "free");
        const rank: Record<string, number> = { free: 0, personal: 1, enterprise_pro: 2, enterprise_max: 3 };
        const best = tiers.reduce((a, b) => (rank[a] ?? 0) >= (rank[b] ?? 0) ? a : b, "free");
        setTier(best);
      })
      .catch(() => setTier("free"));
  }, [user?.id]);

  const isEnterprise = tier === "personal" || tier === "enterprise_pro" || tier === "enterprise_max";

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true); setErr(null);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "Failed to create org");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreating(false); }
  }

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div><p className="db-eyebrow">Organisation</p><h1 className="db-h1">Organisation</h1></div>
      </div>

      {tier === null ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)" }}>Loading…</p>
        </div>
      ) : !isEnterprise ? (
        <div style={{ padding: "48px 0", textAlign: "center", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>Organisations require an Enterprise plan.</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", marginBottom: 24 }}>Upgrade to Enterprise Pro or Max to create a team workspace.</p>
          <Link href="/dashboard/billing" style={{ display: "inline-block", padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: "none", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)" }}>
            View plans →
          </Link>
        </div>
      ) : (
        <div style={{ maxWidth: 480 }}>
          <div style={{ padding: "28px 28px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.02)" }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>Create your organisation</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Organisation name</p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Acme Inc."
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.80)", outline: "none", fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
                {name.trim() && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
                    Slug: {name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
                  </p>
                )}
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                style={{
                  padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                  background: name.trim() ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${name.trim() ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)"}`,
                  color: name.trim() ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.25)",
                  cursor: name.trim() && !creating ? "pointer" : "default",
                  fontFamily: "inherit", transition: "all 150ms", opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "Creating…" : "Create organisation"}
              </button>
              {err && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.75)" }}>{err}</p>}
            </div>
          </div>

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", marginTop: 16, lineHeight: 1.6 }}>
            As the owner you&apos;ll be an admin. Invite teammates after creating.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite link section
// ---------------------------------------------------------------------------
function InviteLinkSection() {
  const [token, setToken] = useState<string | null>(null);
  const [useCount, setUseCount] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/org/join-token")
      .then((r) => r.json())
      .then((d) => { setToken(d.token ?? null); setUseCount(d.use_count ?? 0); })
      .catch(() => {});
  }, []);

  const joinUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${token}`
    : "";

  async function handleCopy() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch("/api/org/join-token", { method: "POST" });
      const d = await res.json();
      setToken(d.token ?? null);
      setUseCount(0);
    } finally { setResetting(false); }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <SectionHead label="Invite link" />
      <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 12, lineHeight: 1.6 }}>
          Share this link with anyone you want to add. They&apos;ll join as a member.
          {useCount > 0 && <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 6 }}>{useCount} joined via link</span>}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            readOnly
            value={token ? joinUrl : "Generating…"}
            style={{
              flex: 1, padding: "9px 14px", borderRadius: 10, fontSize: 12,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)", outline: "none", fontFamily: "ui-monospace, monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={handleCopy}
            disabled={!token}
            style={{
              padding: "9px 16px", borderRadius: 10, fontSize: 12, fontWeight: 500,
              background: copied ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${copied ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.10)"}`,
              color: copied ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.55)",
              cursor: token ? "pointer" : "default", fontFamily: "inherit", transition: "all 150ms",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Revoke and regenerate link"
            style={{
              padding: "9px 12px", borderRadius: 10, fontSize: 12,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.30)", cursor: "pointer", fontFamily: "inherit",
              transition: "all 150ms", opacity: resetting ? 0.5 : 1,
            }}
          >
            {resetting ? "…" : (
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M12 7A5 5 0 112 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M12 3v4h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", marginTop: 8 }}>
          Resetting revokes the old link immediately — anyone who hasn&apos;t joined yet will need the new link.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members section
// ---------------------------------------------------------------------------
function MembersSection({
  members, profiles, orgId, currentUserId, onRefresh,
}: {
  members: OrgMember[];
  profiles: Record<string, UserProfile>;
  orgId: string;
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true); setInviteMsg(null);
    try {
      const res = await fetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, invited_email: inviteEmail.trim(), role: inviteRole }),
      });
      const d = await res.json();
      setInviteMsg(res.ok ? `Invite sent to ${inviteEmail.trim()}.` : (d.detail ?? "Failed."));
      if (res.ok) { setInviteEmail(""); onRefresh(); }
    } finally { setInviting(false); }
  }

  async function handleRoleChange(targetUserId: string, newRole: "admin" | "member") {
    setChangingRole(targetUserId);
    try {
      await fetch("/api/org/members/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: targetUserId, new_role: newRole }),
      });
      onRefresh();
    } finally { setChangingRole(null); }
  }

  async function handleRemove(targetUserId: string) {
    setRemoving(targetUserId);
    try {
      await fetch(`/api/org/members/${targetUserId}`, { method: "DELETE" });
      onRefresh();
    } finally { setRemoving(null); }
  }

  return (
    <div>
      <SectionHead label="Members" count={members.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
        {members.length === 0 && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", padding: "20px 0" }}>No members yet.</p>
        )}
        {members.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            profiles={profiles}
            currentUserId={currentUserId}
            changingRole={changingRole}
            removing={removing}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
          />
        ))}
      </div>

      {/* Invite */}
      <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginBottom: 12, fontWeight: 500 }}>Invite by email</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            placeholder="colleague@company.com"
            style={{
              flex: 1, padding: "9px 14px", borderRadius: 10, fontSize: 13,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.75)", outline: "none", fontFamily: "inherit",
            }}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
            style={{
              padding: "9px 12px", borderRadius: 10, fontSize: 12,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.55)", fontFamily: "inherit", outline: "none", cursor: "pointer",
            }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            style={{
              padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: inviteEmail.trim() ? "rgba(26,115,232,0.20)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${inviteEmail.trim() ? "rgba(26,115,232,0.35)" : "rgba(255,255,255,0.08)"}`,
              color: inviteEmail.trim() ? "rgba(107,174,255,0.90)" : "rgba(255,255,255,0.25)",
              cursor: inviteEmail.trim() ? "pointer" : "default",
              fontFamily: "inherit", transition: "all 160ms", opacity: inviting ? 0.6 : 1,
            }}
          >
            {inviting ? "Sending…" : "Invite"}
          </button>
        </div>
        {inviteMsg && <p style={{ fontSize: 12, color: "rgba(52,211,153,0.75)", marginTop: 10 }}>{inviteMsg}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OrgAdminPage() {
  const { user, isLoaded } = useUser();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [clones, setClones] = useState<OrgClone[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"members" | "clones">("members");
  const [orgCredits, setOrgCredits] = useState(0);
  const [addingCredits, setAddingCredits] = useState(false);
  const [creditInput, setCreditInput] = useState("");
  const [creditMsg, setCreditMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [orgRes, membersRes] = await Promise.all([
      fetch("/api/org"),
      fetch("/api/org/members"),
    ]);
    const orgData = await orgRes.json();
    const membersData = await membersRes.json();

    const orgInfo: OrgInfo | null = orgData.org ?? null;
    setOrg(orgInfo);

    const memberList: OrgMember[] = membersData.members ?? [];
    setMembers(memberList);

    const me = memberList.find((m) => m.user_id === user.id);
    const admin = me?.role === "admin";
    setIsAdmin(admin);

    // Fetch Clerk profiles for all member user_ids
    if (memberList.length > 0) {
      const profileRes = await fetch("/api/org/member-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: memberList.map((m) => m.user_id) }),
      });
      const profileData = await profileRes.json();
      setProfiles(profileData.profiles ?? {});
    }

    if (admin) {
      const [clonesRes, creditsRes] = await Promise.all([
        fetch("/api/org/admin/clones"),
        fetch("/api/org/credits"),
      ]);
      const clonesData = await clonesRes.json();
      setClones(clonesData.clones ?? []);
      const creditsData = await creditsRes.json();
      setOrgCredits(creditsData.credits ?? 0);
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (isLoaded && user) load();
  }, [isLoaded, user?.id, load]);

  if (!isLoaded || loading) {
    return (
      <div className="db-page">
        <div className="db-page-head"><div><p className="db-eyebrow">Organisation</p><h1 className="db-h1">Loading…</h1></div></div>
      </div>
    );
  }

  if (!org) {
    return <CreateOrgGate onCreated={load} />;
  }

  if (!isAdmin) {
    return (
      <div className="db-page">
        <div className="db-page-head">
          <div><p className="db-eyebrow">Organisation</p><h1 className="db-h1">{org.name}</h1></div>
          <Link href="/org" className="btn btn--sm">View team clones →</Link>
        </div>
        <div style={{ padding: "40px 0", textAlign: "center", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)" }}>Admin access required to manage this organisation.</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", marginTop: 6 }}>Contact your org admin to request elevated permissions.</p>
        </div>
      </div>
    );
  }

  const orgVisibleCount = clones.filter((c) => c.access_mode === "org_scoped").length;

  return (
    <div className="db-page" style={{ "--page-accent": "#6BAEFF" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Organisation</p>
          <h1 className="db-h1">{org.name} <em>Admin</em></h1>
        </div>
        <Link href="/org" className="btn btn--sm">View as member →</Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        {[
          { label: "Members", value: members.length, color: "rgba(255,255,255,0.85)" },
          { label: "Clones in org", value: clones.length, color: "rgba(255,255,255,0.85)" },
          { label: "Org-visible", value: orgVisibleCount, color: "rgba(255,255,255,0.85)" },
          { label: "Pool credits", value: orgCredits, color: orgCredits > 0 ? "rgba(52,211,153,0.85)" : "rgba(239,68,68,0.75)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p style={{ fontSize: 26, fontWeight: 300, color, margin: "0 0 4px", letterSpacing: "-0.02em" }}>{value}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 28, width: "fit-content" }}>
        {(["members", "clones"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit", border: "none",
            background: tab === t ? "rgba(255,255,255,0.09)" : "transparent",
            color: tab === t ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
            transition: "all 160ms",
          }}>
            {t === "members" ? `Members (${members.length})` : `Clone access (${clones.length})`}
          </button>
        ))}
      </div>

      {tab === "members" ? (
        <div>
          <MembersSection
            members={members}
            profiles={profiles}
            orgId={org.id}
            currentUserId={user!.id}
            onRefresh={load}
          />

          <InviteLinkSection />

          {/* Org credit pool */}
          <div style={{ marginTop: 32 }}>
            <SectionHead label="Credit Pool" />
            <div style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 24, fontWeight: 300, color: orgCredits > 0 ? "rgba(52,211,153,0.85)" : "rgba(239,68,68,0.70)", margin: "0 0 3px", letterSpacing: "-0.02em" }}>
                    {orgCredits} credits
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: 0 }}>
                    Shared pool — all org members draw from this when querying org clones.
                  </p>
                </div>
                <Link href="/dashboard/credits" style={{
                  fontSize: 12, padding: "7px 14px", borderRadius: 9, textDecoration: "none",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.45)",
                }}>
                  Buy credits →
                </Link>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  value={creditInput}
                  onChange={(e) => setCreditInput(e.target.value)}
                  placeholder="Amount to add"
                  style={{
                    flex: 1, padding: "9px 14px", borderRadius: 10, fontSize: 13,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                    color: "rgba(255,255,255,0.75)", outline: "none", fontFamily: "inherit",
                  }}
                />
                <button
                  disabled={addingCredits || !creditInput || parseInt(creditInput) < 1}
                  onClick={async () => {
                    const n = parseInt(creditInput);
                    if (!n || n < 1) return;
                    setAddingCredits(true); setCreditMsg(null);
                    try {
                      const res = await fetch("/api/org/credits", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ credits: n }),
                      });
                      const d = await res.json();
                      if (res.ok) {
                        setOrgCredits(d.org_credits ?? orgCredits + n);
                        setCreditInput("");
                        setCreditMsg(`Added ${n} credits to the pool.`);
                      } else {
                        setCreditMsg(d.detail ?? "Failed.");
                      }
                    } finally { setAddingCredits(false); }
                  }}
                  style={{
                    padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                    cursor: creditInput && parseInt(creditInput) >= 1 ? "pointer" : "default",
                    background: creditInput && parseInt(creditInput) >= 1 ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${creditInput && parseInt(creditInput) >= 1 ? "rgba(52,211,153,0.30)" : "rgba(255,255,255,0.08)"}`,
                    color: creditInput && parseInt(creditInput) >= 1 ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.25)",
                    fontFamily: "inherit", transition: "all 160ms", opacity: addingCredits ? 0.6 : 1,
                  }}
                >
                  {addingCredits ? "Adding…" : "Add to pool"}
                </button>
              </div>
              {creditMsg && (
                <p style={{ fontSize: 12, color: creditMsg.startsWith("Add") ? "rgba(52,211,153,0.75)" : "rgba(239,68,68,0.70)", marginTop: 10 }}>
                  {creditMsg}
                </p>
              )}
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 10 }}>
                Transfers from your personal credit balance. Any org member can contribute.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <SectionHead label="Clone Access" count={clones.length} />
          {clones.length === 0 && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", padding: "20px 0" }}>
              No clones found. Members need to create clones first.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clones.map((c) => (
              <CloneAccessPanel
                key={c.clone_id}
                clone={c}
                members={members}
                profiles={profiles}
                currentUserId={user!.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
