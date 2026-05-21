"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.20)", borderTopColor: "rgba(255,255,255,0.60)", animation: "spin 0.8s linear infinite" }} />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Org {
  id: string;
  name: string;
  slug: string;
  is_owner: boolean;
  created_at: string | null;
}

interface OrgMember {
  user_id: string;
  role: "admin" | "member";
  joined_at: string | null;
  clone: {
    clone_id: string;
    display_name: string;
    handle: string;
    access_mode: string;
    is_onboarding_resource?: boolean;
  } | null;
}

interface SearchResult {
  clone_id: string;
  clone_name: string;
  clone_handle: string;
  content: string;
  source: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Create org panel
// ---------------------------------------------------------------------------

function CreateOrgPanel({ onCreate }: { onCreate: (org: Org) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function create() {
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      if (res.status === 409) {
        setError("Slug already taken — try another.");
        return;
      }
      const data = await res.json();
      onCreate({ id: data.org_id, name: data.name, slug: data.slug, is_owner: true, created_at: null });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 384 }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Create a team workspace</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>
        Invite colleagues, see everyone&apos;s clones, and search across your team&apos;s collective knowledge.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="text"
          placeholder="Workspace name (e.g. Acme Corp)"
          value={name}
          onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }}
          className="input"
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>doppel.ai/team/</span>
          <input
            type="text"
            placeholder="slug"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className="input"
            style={{ flex: 1, fontFamily: "monospace" }}
          />
        </div>
        {error && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)" }}>{error}</p>}
        <button
          onClick={create}
          disabled={creating || !name.trim() || !slug.trim()}
          className="btn btn--primary"
          style={{ width: "100%", justifyContent: "center" }}
        >
          {creating ? "Creating…" : "Create workspace"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone card
// ---------------------------------------------------------------------------

function CloneCard({
  member,
  isAdmin,
  onRoleChange,
}: {
  member: OrgMember;
  isAdmin: boolean;
  onRoleChange: (userId: string, newRole: "admin" | "member") => void;
}) {
  const [updatingRole, setUpdatingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [isKnowledgeResource, setIsKnowledgeResource] = useState(
    member.clone?.is_onboarding_resource ?? false
  );
  const [togglingResource, setTogglingResource] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const c = member.clone;

  async function toggleKnowledgeResource() {
    if (!c) return;
    setTogglingResource(true);
    setKnowledgeError("");
    try {
      const next = !isKnowledgeResource;
      const res = await fetch(`/api/clones/${c.handle}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_onboarding_resource: next }),
      });
      if (res.ok) {
        setIsKnowledgeResource(next);
      } else {
        const data = await res.json().catch(() => ({}));
        setKnowledgeError(data.detail ?? data.error ?? `Error ${res.status}`);
      }
    } catch {
      setKnowledgeError("Network error");
    } finally {
      setTogglingResource(false);
    }
  }

  async function handleRoleChange(newRole: "admin" | "member") {
    if (newRole === member.role) return;
    setUpdatingRole(true);
    setRoleError("");
    try {
      const res = await fetch("/api/org/members/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: member.user_id, new_role: newRole }),
      });
      if (res.ok) {
        onRoleChange(member.user_id, newRole);
      } else {
        const data = await res.json().catch(() => ({}));
        setRoleError(data.detail ?? data.error ?? `Error ${res.status}`);
      }
    } catch {
      setRoleError("Network error");
    } finally {
      setUpdatingRole(false);
    }
  }

  if (!c) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, opacity: 0.6 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>?</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>No clone yet</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", fontFamily: "monospace", margin: 0 }}>{member.user_id.slice(0, 12)}…</p>
        </div>
        {isAdmin && (
          <RoleSelector role={member.role} disabled={updatingRole} onChange={handleRoleChange} />
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden", padding: 0 }}>
      <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href={`/c/${c.handle}`} target="_blank" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 500, flexShrink: 0 }}>
            {c.display_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{c.display_name}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", fontFamily: "monospace", margin: 0 }}>@{c.handle}</p>
          </div>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {c.access_mode === "public"
            ? <span className="badge badge--pos">{c.access_mode}</span>
            : <span className="badge badge--neutral">{c.access_mode}</span>
          }
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleKnowledgeResource(); }}
              disabled={togglingResource}
              title={isKnowledgeResource ? "Remove from Team Knowledge" : "Add to Team Knowledge"}
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 999,
                border: isKnowledgeResource ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.05)",
                background: isKnowledgeResource ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                color: isKnowledgeResource ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.20)",
                cursor: "pointer", transition: "all 0.15s", opacity: togglingResource ? 0.4 : 1,
                fontFamily: "inherit",
              }}
            >
              {isKnowledgeResource ? "knowledge" : "+ knowledge"}
            </button>
          )}
          {isAdmin ? (
            <RoleSelector role={member.role} disabled={updatingRole} onChange={handleRoleChange} />
          ) : member.role === "admin" ? (
            <span className="badge badge--neutral">admin</span>
          ) : null}
          <Link
            href={`/c/${c.handle}`}
            target="_blank"
            style={{ color: "rgba(255,255,255,0.20)", transition: "color 0.15s", lineHeight: 0, display: "flex" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.40)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.20)")}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M2.5 8.5l6-6M8.5 8.5V2.5H2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
      {(roleError || knowledgeError) && (
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {roleError && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.60)", margin: 0 }}>{roleError}</p>}
          {knowledgeError && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.60)", margin: 0 }}>{knowledgeError}</p>}
        </div>
      )}
    </div>
  );
}

function RoleSelector({
  role,
  disabled,
  onChange,
}: {
  role: string;
  disabled: boolean;
  onChange: (r: "admin" | "member") => void;
}) {
  return (
    <select
      value={role}
      disabled={disabled}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value as "admin" | "member"); }}
      onClick={(e) => e.stopPropagation()}
      className="input"
      style={{ fontSize: 10, padding: "2px 8px", cursor: "pointer", opacity: disabled ? 0.4 : 1, width: "auto" }}
    >
      <option value="member">member</option>
      <option value="admin">admin</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Cross-clone search
// ---------------------------------------------------------------------------

function CrossCloneSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch("/api/org/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Search across all team clones…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="input"
          style={{ flex: 1 }}
        />
        <button
          onClick={search}
          disabled={searching || !query.trim()}
          className="btn btn--primary"
          style={{ flexShrink: 0 }}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {searched && results.length === 0 && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", padding: "0 4px" }}>No matching memories found across your team.</p>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r, i) => (
            <div key={i} className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(255,255,255,0.40)", fontWeight: 500 }}>
                  {r.clone_name?.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{r.clone_name}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "monospace" }}>@{r.clone_handle}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 999, fontFamily: "monospace" }}>
                  {(r.similarity * 100).toFixed(0)}%
                </span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6, margin: 0 }}>{r.content}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4, marginBottom: 0 }}>{r.source}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite panel
// ---------------------------------------------------------------------------

function InvitePanel({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    setError("");
    try {
      const res = await fetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, invited_email: email.trim() }),
      });
      if (!res.ok) {
        setError("Failed to invite — try again.");
        return;
      }
      setSent(true);
      setEmail("");
      setTimeout(() => setSent(false), 3000);
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 500, marginBottom: 12 }}>Invite teammate</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
          className="input"
          style={{ flex: 1 }}
        />
        <button
          onClick={invite}
          disabled={inviting || !email.trim()}
          className="btn btn--primary"
          style={{ flexShrink: 0 }}
        >
          {inviting ? "…" : sent ? "Invited" : "Invite"}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", marginTop: 8, marginBottom: 0 }}>{error}</p>}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 8, marginBottom: 0 }}>
        They&apos;ll be added when they sign up with this email.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org knowledge graph
// ---------------------------------------------------------------------------

interface OrgNode {
  id: string;
  label: string;
  nodeType: "org" | "member" | "clone";
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface OrgLink {
  source: string;
  target: string;
}

function OrgGraph({ orgName, members }: { orgName: string; members: OrgMember[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
    });
    obs.observe(el);
    setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
    return () => obs.disconnect();
  }, []);

  const nodes: OrgNode[] = [];
  const links: OrgLink[] = [];

  nodes.push({ id: "org", label: orgName, nodeType: "org" });

  for (const m of members) {
    const memberId = `member_${m.user_id}`;
    const memberLabel = m.clone?.display_name ?? m.user_id.slice(0, 8) + "…";
    nodes.push({ id: memberId, label: memberLabel, nodeType: "member" });
    links.push({ source: "org", target: memberId });

    if (m.clone) {
      const cloneId = `clone_${m.clone.clone_id}`;
      nodes.push({ id: cloneId, label: `@${m.clone.handle}`, nodeType: "clone" });
      links.push({ source: memberId, target: cloneId });
    }
  }

  const NODE_COLOR: Record<OrgNode["nodeType"], string> = {
    org: "rgba(255,255,255,0.85)",
    member: "rgba(196,181,253,0.8)",
    clone: "rgba(147,197,253,0.75)",
  };

  const NODE_SIZE: Record<OrgNode["nodeType"], number> = {
    org: 8,
    member: 5,
    clone: 3.5,
  };

  const nodeCanvasObject = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    const n = node as OrgNode & { x: number; y: number };
    const color = NODE_COLOR[n.nodeType];
    const radius = NODE_SIZE[n.nodeType];

    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    if (globalScale >= 1 || n.nodeType === "org") {
      const label = n.label.length > 20 ? n.label.slice(0, 20) + "…" : n.label;
      const fontSize = n.nodeType === "org"
        ? Math.max(12 / globalScale, 3)
        : Math.max(9 / globalScale, 2.5);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = n.nodeType === "org" ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)";
      ctx.textAlign = "center";
      ctx.fillText(label, n.x, n.y + radius + fontSize + 1);
    }
  };

  if (members.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Invite teammates to see the org graph.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, position: "relative", borderRadius: 16, overflow: "hidden", background: "#080808", border: "1px solid rgba(255,255,255,0.06)" }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={{ nodes: nodes as object[], links }}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#080808"
        nodeRelSize={1}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace"}
        linkColor={() => "rgba(255,255,255,0.08)"}
        linkWidth={1}
        cooldownTicks={80}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.5}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
      <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", alignItems: "center", gap: 16, pointerEvents: "none" }}>
        {[
          { color: "rgba(255,255,255,0.80)", label: "Workspace" },
          { color: "rgba(196,181,253,0.75)", label: "Member" },
          { color: "rgba(147,197,253,0.70)", label: "Clone" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PendingInvite {
  org_id: string;
  org_name: string;
  org_slug: string;
  role: string;
}

export default function OrgPage() {
  const { user } = useUser();
  const [org, setOrg] = useState<Org | null | undefined>(undefined);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [tab, setTab] = useState<"clones" | "search" | "graph">("clones");
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch("/api/org")
      .then((r) => r.json())
      .then((d) => setOrg(d.org ?? null))
      .catch(() => setOrg(null));
  }, []);

  useEffect(() => {
    if (org !== null) return;
    fetch("/api/org/pending-invite")
      .then((r) => r.json())
      .then((d) => setPendingInvite(d.invite ?? null))
      .catch(() => {});
  }, [org]);

  useEffect(() => {
    if (!org) return;
    fetch("/api/org/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {});
  }, [org]);

  async function acceptInvite() {
    setJoining(true);
    try {
      const res = await fetch("/api/org/join", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.org) {
        setOrg(data.org);
        setPendingInvite(null);
      }
    } finally {
      setJoining(false);
    }
  }

  if (org === undefined) {
    return (
      <div style={{ padding: 32, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.20)" }} />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</span>
      </div>
    );
  }

  const ORG_TABS = [
    { id: "clones" as const, label: `Clones (${members.length})` },
    { id: "graph" as const, label: "Graph" },
    { id: "search" as const, label: "Search" },
  ];

  if (!org) {
    return (
      <div className="db-page">
        <div className="db-page-head">
          <div>
            <p className="db-eyebrow">Workspace</p>
            <h1 className="db-h1">Team</h1>
          </div>
        </div>
        {pendingInvite && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)", marginBottom: 4 }}>
              You&apos;ve been invited to join <span style={{ color: "rgba(255,255,255,0.85)" }}>{pendingInvite.org_name}</span>
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
              As a {pendingInvite.role} · doppel.ai/team/{pendingInvite.org_slug}
            </p>
            <button
              onClick={acceptInvite}
              disabled={joining}
              className="btn btn--primary"
            >
              {joining ? "Joining…" : `Join ${pendingInvite.org_name}`}
            </button>
          </div>
        )}
        <CreateOrgPanel onCreate={setOrg} />
      </div>
    );
  }

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Workspace</p>
          <h1 className="db-h1">{org.name} <em>· {members.length} member{members.length !== 1 ? "s" : ""}</em></h1>
          <p style={{ fontSize: 12, marginTop: 4, color: "var(--fg-dark-3)" }}>
            <span style={{ fontFamily: "monospace" }}>doppel.ai/team/{org.slug}</span>
          </p>
        </div>
        {org.is_owner && <InvitePanel orgId={org.id} />}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 4, width: "fit-content" }}>
        {ORG_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 18px", borderRadius: 12, border: "none",
              background: tab === t.id ? "rgba(255,255,255,0.08)" : "transparent",
              color: tab === t.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
              fontFamily: "inherit", fontSize: 13, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.length === 0 ? (
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>No members yet — invite your team above.</p>
            </div>
          ) : (
            members.map((m) => {
              const currentUserIsAdmin = org.is_owner ||
                members.find((x) => x.user_id === user?.id)?.role === "admin";
              return (
                <CloneCard
                  key={m.user_id}
                  member={m}
                  isAdmin={currentUserIsAdmin}
                  onRoleChange={(userId, newRole) =>
                    setMembers((prev) =>
                      prev.map((x) => x.user_id === userId ? { ...x, role: newRole } : x)
                    )
                  }
                />
              );
            })
          )}
        </div>
      )}

      {tab === "graph" && (
        <div style={{ display: "flex", flexDirection: "column", height: 480 }}>
          <OrgGraph orgName={org.name} members={members} />
        </div>
      )}

      {tab === "search" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.6 }}>
            Semantic search across all memories from every clone in your workspace.
            Useful for finding shared context, avoiding duplicate work, or discovering
            what your colleagues know.
          </p>
          <CrossCloneSearch />
        </div>
      )}
    </div>
  );
}
