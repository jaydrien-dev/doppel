"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import type { MemoryChunk, MemorySource } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <GraphSkeleton />,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryNode {
  id: string;
  type: "episodic" | "semantic" | "procedural" | "relational";
  label: string;
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
  x?: number; y?: number; fx?: number | null; fy?: number | null;
}
interface MemoryEdge { source: string; target: string; weight: number; }
interface GraphData {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  stats: { episodic: number; semantic: number; procedural: number; relational: number };
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const TYPE_COLOR: Record<MemoryNode["type"], string> = {
  episodic:   "rgba(26,115,232,0.85)",
  semantic:   "rgba(52,168,83,0.85)",
  procedural: "rgba(251,188,4,0.90)",
  relational: "rgba(156,39,176,0.80)",
};
const TYPE_DOT_COLOR: Record<MemoryNode["type"], string> = {
  episodic:   "#1A73E8",
  semantic:   "#34A853",
  procedural: "#FBBC04",
  relational: "#9C27B0",
};
const TYPE_LABEL: Record<MemoryNode["type"], string> = {
  episodic: "Memory", semantic: "Fact", procedural: "Pattern", relational: "Person",
};
const TYPE_LABEL_PLURAL: Record<MemoryNode["type"], string> = {
  episodic: "Memories", semantic: "Facts", procedural: "Patterns", relational: "People",
};

// ---------------------------------------------------------------------------
// Skeleton / empty
// ---------------------------------------------------------------------------

function GraphSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#1A73E8", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: "0 32px" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="currentColor" opacity="0.25" strokeWidth="1.4"/>
          <circle cx="11" cy="11" r="3" stroke="currentColor" opacity="0.25" strokeWidth="1.4"/>
          <path d="M11 2v3M11 17v3M2 11h3M17 11h3" stroke="currentColor" opacity="0.25" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </div>
      <div>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>No brain data yet</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Train your clone with Gmail or Q&amp;A to see your memory graph.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

function NodePanel({ node, onClose }: { node: MemoryNode; onClose: () => void }) {
  const color = TYPE_COLOR[node.type];
  const metaEntries = Object.entries(node.meta).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && (v as unknown[]).length === 0)
  );
  return (
    <div style={{ width: 280, flexShrink: 0, background: "#0D0D0D", borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color, padding: "2px 8px", borderRadius: 6, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          {TYPE_LABEL[node.type]}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: 0 }}>{node.content}</p>
        {metaEntries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Details</p>
            {metaEntries.map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0, minWidth: 80, textTransform: "capitalize" }}>
                  {k.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                  {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
                </span>
              </div>
            ))}
          </div>
        )}
        {node.created_at && (
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            {new Date(node.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline panel
// ---------------------------------------------------------------------------

interface TimelineMonth { label: string; chunks: MemoryChunk[]; }

const SOURCE_COLOR_MAP: Record<string, string> = {
  gmail:   "#F87171", slack:   "#A78BFA", notion: "rgba(255,255,255,0.4)",
  upload:  "#60A5FA", chat:    "#34D399", seed_qa: "#FBBF24", meeting: "#67E8F9",
};

function TimelinePanel({ cloneId }: { cloneId: string }) {
  const [months, setMonths] = useState<TimelineMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 40;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/brain/memories?clone_id=${cloneId}&page=1&page_size=${PAGE_SIZE}&sort=created_at_desc`)
      .then((r) => r.json())
      .then((d: { chunks: MemoryChunk[]; total: number }) => {
        groupIntoMonths(d.chunks);
        setHasMore(d.total > PAGE_SIZE);
        setPage(1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cloneId]);

  function groupIntoMonths(chunks: MemoryChunk[]) {
    const map = new Map<string, MemoryChunk[]>();
    for (const c of chunks) {
      const label = c.created_at
        ? new Date(c.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : "Unknown date";
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(c);
    }
    setMonths(Array.from(map.entries()).map(([label, chunks]) => ({ label, chunks })));
  }

  function loadMore() {
    const nextPage = page + 1;
    fetch(`/api/brain/memories?clone_id=${cloneId}&page=${nextPage}&page_size=${PAGE_SIZE}&sort=created_at_desc`)
      .then((r) => r.json())
      .then((d: { chunks: MemoryChunk[]; total: number }) => {
        setMonths((prev) => {
          const merged = [...prev.flatMap((m) => m.chunks), ...d.chunks];
          const map = new Map<string, MemoryChunk[]>();
          for (const c of merged) {
            const label = c.created_at
              ? new Date(c.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
              : "Unknown date";
            if (!map.has(label)) map.set(label, []);
            map.get(label)!.push(c);
          }
          return Array.from(map.entries()).map(([label, chunks]) => ({ label, chunks }));
        });
        setHasMore((nextPage * PAGE_SIZE) < d.total);
        setPage(nextPage);
      });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)", animation: "pulse 1.5s ease-in-out infinite" }} />
        Loading timeline…
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>No memories yet. Train your clone to see the timeline.</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
      {months.map(({ label, chunks }) => (
        <div key={label}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{chunks.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {chunks.map((c) => (
              <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", marginTop: 2, color: SOURCE_COLOR_MAP[c.source] ?? "rgba(255,255,255,0.3)" }}>
                  {c.source}
                </span>
                <p style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>{c.content}</p>
                {c.is_pinned && (
                  <span style={{ fontSize: 9, color: "#FBBF24", background: "rgba(251,191,36,0.10)", padding: "2px 6px", borderRadius: 999, flexShrink: 0 }}>pinned</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <button onClick={loadMore} className="btn" style={{ alignSelf: "center" }}>
          Load more
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test a belief panel
// ---------------------------------------------------------------------------

function TestBeliefPanel({ cloneId }: { cloneId: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ response: string; sources: MemorySource[]; confidence: number; path_taken: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function test() {
    if (!query.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, session_id: crypto.randomUUID(), message: query.trim(), context_type: "chat" }),
      });
      setResult(await res.json());
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", maxWidth: 720 }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20, lineHeight: 1.6 }}>
        Ask your clone a question and see exactly which memories it pulls from.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && test()}
          placeholder='Try "What do I believe about hiring?" or "How do I handle conflict?"'
          className="input"
          style={{ flex: 1 }}
        />
        <button onClick={test} disabled={testing || !query.trim()} className="btn btn--primary">
          {testing ? "Thinking…" : "Test"}
        </button>
      </div>

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)" }}>Response</span>
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 999,
                color: result.path_taken === "slow" ? "rgba(96,165,250,0.7)" : "rgba(52,211,153,0.7)",
                background: result.path_taken === "slow" ? "rgba(96,165,250,0.08)" : "rgba(52,211,153,0.08)",
                border: `1px solid ${result.path_taken === "slow" ? "rgba(96,165,250,0.2)" : "rgba(52,211,153,0.2)"}`,
              }}>
                {result.path_taken} path
              </span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                {Math.round(result.confidence * 100)}% confidence
              </span>
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>{result.response}</p>
          </div>

          {result.sources.length > 0 && (
            <div>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
                Memories used ({result.sources.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.sources.map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", color: "rgba(255,255,255,0.25)", flexShrink: 0, marginTop: 1, width: 32 }}>
                      {(s.similarity * 100).toFixed(0)}%
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, margin: "0 0 4px" }}>{s.content}</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "ui-monospace, Menlo, monospace", margin: 0 }}>{s.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.sources.length === 0 && (
            <div className="card">
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>No specific memories retrieved — response generated from identity layer only.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type BrainView = "graph" | "timeline" | "test";

export default function BrainPage() {
  const { clones, isLoading: cloneLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  const [view, setView] = useState<BrainView>("graph");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<MemoryNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setDimensions({ width: el.offsetWidth, height: el.offsetHeight }));
    obs.observe(el);
    setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setGraphData(null);
    setSelectedNode(null);
    setHoveredNode(null);
  }, [clone?.clone_id]);

  useEffect(() => {
    if (!clone) return;
    setLoading(true);
    setError("");
    fetch(`/api/brain/graph?clone_id=${clone.clone_id}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load brain graph"); return r.json(); })
      .then((d: GraphData) => setGraphData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clone]);

  const nodeCanvasObject = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as MemoryNode & { x: number; y: number };
      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const isPinned = n.meta?.is_pinned === true;
      const baseRadius = n.type === "relational" ? 5 : 4;
      const radius = baseRadius + (isPinned ? 2 : 0);
      const color = TYPE_COLOR[n.type];

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(n.x, n.y, radius, n.x, n.y, radius + 6);
        gradient.addColorStop(0, color.replace(/[\d.]+\)$/, "0.3)"));
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected || isHovered ? color : color.replace(/[\d.]+\)$/, "0.88)");
      ctx.fill();

      if (globalScale >= 1.5 || isSelected || isHovered) {
        const label = n.label.length > 40 ? n.label.slice(0, 40) + "…" : n.label;
        const fontSize = Math.max(10 / globalScale, 2.5);
        ctx.font = `${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.textAlign = "center";
        ctx.fillText(label, n.x, n.y + radius + fontSize + 1);
      }
    },
    [selectedNode, hoveredNode]
  );

  const handleNodeClick = useCallback((node: unknown) => {
    setSelectedNode((prev) => { const n = node as MemoryNode; return prev?.id === n.id ? null : n; });
  }, []);
  const handleNodeHover = useCallback((node: unknown) => { setHoveredNode(node ? (node as MemoryNode) : null); }, []);
  const handleBackgroundClick = useCallback(() => setSelectedNode(null), []);
  const handleZoomFit = useCallback(() => graphRef.current?.zoomToFit(400), []);

  if (cloneLoading) return <GraphSkeleton />;

  const totalNodes = graphData
    ? graphData.stats.episodic + graphData.stats.semantic + graphData.stats.procedural + graphData.stats.relational
    : 0;

  const TABS: { id: BrainView; label: string }[] = [
    { id: "graph", label: "Graph" },
    { id: "timeline", label: "Timeline" },
    { id: "test", label: "Test a belief" },
  ];

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
          background: "rgba(8,8,8,0.82)", backdropFilter: "blur(20px) saturate(140%)",
        }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 3 }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                padding: "6px 14px", borderRadius: 9, border: "none",
                background: view === t.id ? "rgba(255,255,255,0.07)" : "transparent",
                color: view === t.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer",
                transition: "all 180ms cubic-bezier(0.25,0.46,0.45,0.94)",
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Clone picker + graph legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ClonePicker clones={clones} selected={clone ?? clones[0]} onSelect={c => setSelectedId(c.clone_id)} />
            {view === "graph" && graphData && totalNodes > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {(["episodic", "semantic", "procedural", "relational"] as const).map((type) =>
                    graphData.stats[type] > 0 ? (
                      <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: TYPE_DOT_COLOR[type] }} />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {graphData.stats[type]} {graphData.stats[type] === 1 ? TYPE_LABEL[type] : TYPE_LABEL_PLURAL[type]}
                        </span>
                      </div>
                    ) : null
                  )}
                </div>
                <button onClick={handleZoomFit} className="btn btn--sm btn--ghost">Fit view</button>
              </div>
            )}
          </div>
        </div>

        {/* Panel */}
        {view === "graph" && (
          <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {loading && <GraphSkeleton />}
            {!loading && error && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{error}</p>
              </div>
            )}
            {!loading && !error && graphData && totalNodes === 0 && <EmptyState />}
            {!loading && !error && graphData && totalNodes > 0 && (
              <ForceGraph2D
                ref={graphRef}
                graphData={{
                  nodes: graphData.nodes as object[],
                  links: graphData.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
                }}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#080808"
                nodeRelSize={1}
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={() => "replace"}
                linkColor={() => "rgba(255,255,255,0.06)"}
                linkWidth={(link) => ((link as { weight?: number }).weight ?? 0.5) * 1.2}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onBackgroundClick={handleBackgroundClick}
                cooldownTicks={120}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.4}
                enableNodeDrag
                enableZoomInteraction
                enablePanInteraction
              />
            )}
            {!loading && graphData && totalNodes > 0 && (
              <p style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "rgba(255,255,255,0.2)", pointerEvents: "none", userSelect: "none" }}>
                Drag nodes · Scroll to zoom · Click to inspect
              </p>
            )}
          </div>
        )}

        {view === "timeline" && clone && <TimelinePanel cloneId={clone.clone_id} />}
        {view === "test" && clone && <TestBeliefPanel cloneId={clone.clone_id} />}
        {(view === "timeline" || view === "test") && !clone && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Create your clone first.</p>
          </div>
        )}
      </div>

      {view === "graph" && selectedNode && (
        <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
