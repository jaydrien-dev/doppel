"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-4 h-4 rounded-full border border-white/20 border-t-white/60 animate-spin" />
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
    <div className="glass rounded-2xl p-6 max-w-sm">
      <p className="text-sm font-medium text-white/80 mb-1">Create a team workspace</p>
      <p className="text-xs text-white/35 mb-5">
        Invite colleagues, see everyone&apos;s clones, and search across your team&apos;s collective knowledge.
      </p>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Workspace name (e.g. Acme Corp)"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSlug(slugify(e.target.value));
          }}
          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/25 shrink-0">doppel.ai/team/</span>
          <input
            type="text"
            placeholder="slug"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors font-mono"
          />
        </div>
        {error && <p className="text-[11px] text-red-400/70">{error}</p>}
        <button
          onClick={create}
          disabled={creating || !name.trim() || !slug.trim()}
          className="w-full py-2 rounded-xl text-sm text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
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

function CloneCard({ member }: { member: OrgMember }) {
  const c = member.clone;
  if (!c) {
    return (
      <div className="glass rounded-2xl p-4 opacity-50">
        <p className="text-xs text-white/35">Member hasn&apos;t created a clone yet</p>
        <p className="text-[11px] text-white/20 mt-1 font-mono">{member.user_id.slice(0, 12)}…</p>
      </div>
    );
  }
  return (
    <Link
      href={`/c/${c.handle}`}
      target="_blank"
      className="glass rounded-2xl p-4 flex items-center gap-3 hover:glass-md transition-all group"
    >
      <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs text-white/50 font-medium shrink-0">
        {c.display_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/75 truncate">{c.display_name}</p>
        <p className="text-[11px] text-white/30 font-mono">@{c.handle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
          c.access_mode === "public"
            ? "text-emerald-300/60 bg-emerald-400/[0.07] border-emerald-400/15"
            : "text-white/25 bg-white/[0.03] border-white/[0.06]"
        }`}>
          {c.access_mode}
        </span>
        {member.role === "admin" && (
          <span className="text-[10px] text-white/25 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
            admin
          </span>
        )}
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          className="text-white/20 group-hover:text-white/40 transition-colors"
        >
          <path
            d="M2.5 8.5l6-6M8.5 8.5V2.5H2.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
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
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search across all team clones…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
        />
        <button
          onClick={search}
          disabled={searching || !query.trim()}
          className="shrink-0 px-4 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {searched && results.length === 0 && (
        <p className="text-sm text-white/30 px-1">No matching memories found across your team.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] text-white/40 font-medium">
                  {r.clone_name?.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-white/50">{r.clone_name}</span>
                <span className="text-[10px] text-white/20 font-mono">@{r.clone_handle}</span>
                <span className="ml-auto text-[10px] text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-full font-mono">
                  {(r.similarity * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm text-white/60 leading-relaxed line-clamp-3">{r.content}</p>
              <p className="text-[11px] text-white/25 mt-1">{r.source}</p>
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
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-white/50 font-medium mb-3">Invite teammate</p>
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
          className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
        />
        <button
          onClick={invite}
          disabled={inviting || !email.trim()}
          className="shrink-0 px-3 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
        >
          {inviting ? "…" : sent ? "Invited" : "Invite"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400/70 mt-2">{error}</p>}
      <p className="text-[11px] text-white/20 mt-2">
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

  // Org node
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
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-white/30">Invite teammates to see the org graph.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative rounded-2xl overflow-hidden bg-[#080808] border border-white/[0.06]">
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
      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 pointer-events-none">
        {[
          { color: "bg-white/80", label: "Workspace" },
          { color: "bg-purple-300/75", label: "Member" },
          { color: "bg-blue-300/70", label: "Clone" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
            <span className="text-[10px] text-white/25">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrgPage() {
  const [org, setOrg] = useState<Org | null | undefined>(undefined);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [tab, setTab] = useState<"clones" | "search" | "graph">("clones");

  useEffect(() => {
    fetch("/api/org")
      .then((r) => r.json())
      .then((d) => setOrg(d.org ?? null))
      .catch(() => setOrg(null));
  }, []);

  useEffect(() => {
    if (!org) return;
    fetch("/api/org/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {});
  }, [org]);

  if (org === undefined) {
    return (
      <div className="p-8 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
        <span className="text-sm text-white/30">Loading…</span>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-8 max-w-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-light text-white/85">Team</h1>
          <p className="text-sm text-white/35 mt-1">
            Share knowledge and search across your whole team&apos;s clones.
          </p>
        </div>
        <CreateOrgPanel onCreate={setOrg} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light text-white/85">{org.name}</h1>
          <p className="text-sm text-white/35 mt-1">
            <span className="font-mono text-white/25">doppel.ai/team/{org.slug}</span>
            <span className="ml-3">·</span>
            <span className="ml-3">{members.length} member{members.length !== 1 ? "s" : ""}</span>
          </p>
        </div>
        {org.is_owner && <InvitePanel orgId={org.id} />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-xl p-1 w-fit">
        {([
          { id: "clones", label: `Clones (${members.length})` },
          { id: "graph", label: "Graph" },
          { id: "search", label: "Search" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs transition-all ${
              tab === t.id
                ? "glass-md text-white/75"
                : "text-white/35 hover:text-white/55"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clones" && (
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center">
              <p className="text-sm text-white/30">No members yet — invite your team above.</p>
            </div>
          ) : (
            members.map((m) => <CloneCard key={m.user_id} member={m} />)
          )}
        </div>
      )}

      {tab === "graph" && (
        <div className="flex flex-col" style={{ height: 480 }}>
          <OrgGraph orgName={org.name} members={members} />
        </div>
      )}

      {tab === "search" && (
        <div className="space-y-4">
          <p className="text-xs text-white/30 leading-relaxed">
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
