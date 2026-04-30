"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useClone } from "@/lib/hooks/useClone";
import { cn } from "@/lib/utils";
import type { MemoryChunk, MemorySource } from "@/lib/types";

// react-force-graph-2d uses window — must be dynamically imported
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
  // Injected by force graph
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface MemoryEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  stats: { episodic: number; semantic: number; procedural: number; relational: number };
}

// ---------------------------------------------------------------------------
// Colours per memory type
// ---------------------------------------------------------------------------

const TYPE_COLOR: Record<MemoryNode["type"], string> = {
  episodic: "rgba(255,255,255,0.75)",
  semantic: "rgba(147,197,253,0.85)",
  procedural: "rgba(253,186,116,0.85)",
  relational: "rgba(196,181,253,0.85)",
};

const TYPE_LABEL: Record<MemoryNode["type"], string> = {
  episodic: "Memory",
  semantic: "Fact",
  procedural: "Pattern",
  relational: "Person",
};

const TYPE_DOT: Record<MemoryNode["type"], string> = {
  episodic: "bg-white/70",
  semantic: "bg-blue-300/80",
  procedural: "bg-amber-300/80",
  relational: "bg-purple-300/80",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function GraphSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
      <div className="w-14 h-14 rounded-2xl glass-md flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="white" strokeOpacity="0.3" strokeWidth="1.4" />
          <circle cx="11" cy="11" r="3" stroke="white" strokeOpacity="0.3" strokeWidth="1.4" />
          <path d="M11 2v3M11 17v3M2 11h3M17 11h3" stroke="white" strokeOpacity="0.3" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-white/60 text-sm mb-1">No brain data yet</p>
        <p className="text-white/25 text-xs">Train your clone with Gmail or Q&A to see your memory graph.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

function NodePanel({ node, onClose }: { node: MemoryNode; onClose: () => void }) {
  const color = TYPE_COLOR[node.type];
  const badgeColors: Record<MemoryNode["type"], string> = {
    episodic: "text-white/60 bg-white/10",
    semantic: "text-blue-200 bg-blue-400/10",
    procedural: "text-amber-200 bg-amber-400/10",
    relational: "text-purple-200 bg-purple-400/10",
  };

  const metaEntries = Object.entries(node.meta).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && (v as unknown[]).length === 0)
  );

  return (
    <div className="w-72 shrink-0 glass border-l border-white/[0.06] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <span
          className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", badgeColors[node.type])}
        >
          {TYPE_LABEL[node.type]}
        </span>
        <button
          onClick={onClose}
          className="text-white/25 hover:text-white/60 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Node colour accent */}
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />

        <p className="text-sm text-white/80 leading-relaxed">{node.content}</p>

        {metaEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-white/25 uppercase tracking-wider">Details</p>
            {metaEntries.map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <span className="text-xs text-white/30 shrink-0 min-w-[80px] capitalize">
                  {k.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-white/60">
                  {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
                </span>
              </div>
            ))}
          </div>
        )}

        {node.created_at && (
          <p className="text-[10px] text-white/20">
            {new Date(node.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline panel
// ---------------------------------------------------------------------------

interface TimelineMonth {
  label: string;
  chunks: MemoryChunk[];
}

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

  const SOURCE_COLOR: Record<string, string> = {
    gmail: "text-red-300/60",
    slack: "text-purple-300/60",
    notion: "text-white/40",
    upload: "text-blue-300/60",
    chat: "text-emerald-300/60",
    seed_qa: "text-amber-300/60",
    meeting: "text-cyan-300/60",
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8">
        <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
        <span className="text-sm text-white/30">Loading timeline…</span>
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-white/30">No memories yet. Train your clone to see the timeline.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
      {months.map(({ label, chunks }) => (
        <div key={label}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] uppercase tracking-widest text-white/25 font-medium">{label}</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-white/20">{chunks.length}</span>
          </div>
          <div className="space-y-2">
            {chunks.map((c) => (
              <div key={c.id} className="glass rounded-xl p-3 flex items-start gap-3 group">
                <div className={cn(
                  "shrink-0 text-[10px] font-mono mt-0.5",
                  SOURCE_COLOR[c.source] ?? "text-white/30"
                )}>
                  {c.source}
                </div>
                <p className="flex-1 text-xs text-white/55 leading-relaxed line-clamp-3">{c.content}</p>
                <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {c.is_pinned && (
                    <span className="text-[9px] text-amber-300/60 bg-amber-400/10 px-1.5 py-0.5 rounded-full">pinned</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-2 rounded-xl text-xs text-white/30 glass hover:glass-md transition-all"
        >
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
        body: JSON.stringify({
          clone_id: cloneId,
          session_id: crypto.randomUUID(),
          message: query.trim(),
          context_type: "chat",
        }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 max-w-2xl">
      <p className="text-xs text-white/35 mb-5 leading-relaxed">
        Ask your clone a question and see exactly which memories it pulls from. Useful for understanding what knowledge drives each response.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && test()}
          placeholder='Try "What do I believe about hiring?" or "How do I handle conflict?"'
          className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
        />
        <button
          onClick={test}
          disabled={testing || !query.trim()}
          className="shrink-0 px-4 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
        >
          {testing ? "Thinking…" : "Test"}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Response */}
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-widest text-white/25">Response</span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                result.path_taken === "slow"
                  ? "text-blue-300/50 bg-blue-400/[0.07] border-blue-400/15"
                  : "text-emerald-300/50 bg-emerald-400/[0.07] border-emerald-400/15"
              )}>
                {result.path_taken} path
              </span>
              <span className="ml-auto text-[10px] text-white/25">
                {Math.round(result.confidence * 100)}% confidence
              </span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{result.response}</p>
          </div>

          {/* Sources */}
          {result.sources.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2 px-1">
                Memories used ({result.sources.length})
              </p>
              <div className="space-y-2">
                {result.sources.map((s, i) => (
                  <div key={i} className="glass rounded-xl p-3 flex items-start gap-3">
                    <span className="text-[10px] font-mono text-white/25 shrink-0 mt-0.5 w-8">
                      {(s.similarity * 100).toFixed(0)}%
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/55 leading-relaxed line-clamp-3">{s.content}</p>
                      <p className="text-[10px] text-white/25 mt-1 font-mono">{s.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.sources.length === 0 && (
            <div className="glass rounded-xl p-3">
              <p className="text-xs text-white/30">No specific memories retrieved — response generated from identity layer only.</p>
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
  const { clone, isLoading: cloneLoading } = useClone();
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

  // Measure container
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

  // Fetch graph data
  useEffect(() => {
    if (!clone) return;
    setLoading(true);
    setError("");
    fetch(`/api/brain/graph?clone_id=${clone.clone_id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load brain graph");
        return r.json();
      })
      .then((d: GraphData) => setGraphData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clone]);

  // Custom node rendering
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

      // Glow for selected/hovered
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(n.x, n.y, radius, n.x, n.y, radius + 6);
        gradient.addColorStop(0, color.replace(/[\d.]+\)$/, "0.3)"));
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Main dot
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected || isHovered ? color : color.replace(/[\d.]+\)$/, "0.5)");
      ctx.fill();

      // Label (only when zoomed in enough)
      if (globalScale >= 1.5 || isSelected || isHovered) {
        const label = n.label.length > 40 ? n.label.slice(0, 40) + "…" : n.label;
        const fontSize = Math.max(10 / globalScale, 2.5);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.textAlign = "center";
        ctx.fillText(label, n.x, n.y + radius + fontSize + 1);
      }
    },
    [selectedNode, hoveredNode]
  );

  const handleNodeClick = useCallback((node: unknown) => {
    setSelectedNode((prev) => {
      const n = node as MemoryNode;
      return prev?.id === n.id ? null : n;
    });
  }, []);

  const handleNodeHover = useCallback((node: unknown) => {
    setHoveredNode(node ? (node as MemoryNode) : null);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleZoomFit = useCallback(() => {
    graphRef.current?.zoomToFit(400);
  }, []);

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
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs transition-all",
                  view === t.id
                    ? "glass-md text-white/75"
                    : "text-white/30 hover:text-white/55"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Graph legend + controls (only on graph tab) */}
          {view === "graph" && (
            <div className="flex items-center gap-4">
              {graphData && totalNodes > 0 && (
                <>
                  <div className="flex items-center gap-4">
                    {(["episodic", "semantic", "procedural", "relational"] as const).map((type) => (
                      graphData.stats[type] > 0 && (
                        <div key={type} className="flex items-center gap-1.5">
                          <div className={cn("w-1.5 h-1.5 rounded-full", TYPE_DOT[type])} />
                          <span className="text-xs text-white/30">
                            {graphData.stats[type]} {TYPE_LABEL[type]}
                            {graphData.stats[type] !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                  <button
                    onClick={handleZoomFit}
                    className="glass rounded-lg px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    Fit view
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Panel content */}
        {view === "graph" && (
          <div ref={containerRef} className="flex-1 relative overflow-hidden">
            {loading && <GraphSkeleton />}
            {!loading && error && (
              <div className="flex-1 flex items-center justify-center h-full">
                <p className="text-xs text-white/30">{error}</p>
              </div>
            )}
            {!loading && !error && graphData && totalNodes === 0 && <EmptyState />}
            {!loading && !error && graphData && totalNodes > 0 && (
              <ForceGraph2D
                ref={graphRef}
                graphData={{
                  nodes: graphData.nodes as object[],
                  links: graphData.edges.map((e) => ({
                    source: e.source,
                    target: e.target,
                    weight: e.weight,
                  })),
                }}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#080808"
                nodeRelSize={1}
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={() => "replace"}
                linkColor={() => "rgba(255,255,255,0.06)"}
                linkWidth={(link) => {
                  const l = link as { weight?: number };
                  return (l.weight ?? 0.5) * 1.2;
                }}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onBackgroundClick={handleBackgroundClick}
                cooldownTicks={120}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.4}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                enablePanInteraction={true}
              />
            )}
            {!loading && graphData && totalNodes > 0 && (
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/15 pointer-events-none select-none">
                Drag nodes · Scroll to zoom · Click to inspect
              </p>
            )}
          </div>
        )}

        {view === "timeline" && clone && (
          <TimelinePanel cloneId={clone.clone_id} />
        )}

        {view === "test" && clone && (
          <TestBeliefPanel cloneId={clone.clone_id} />
        )}

        {(view === "timeline" || view === "test") && !clone && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-white/30">Create your clone first.</p>
          </div>
        )}
      </div>

      {/* Side panel (graph view only) */}
      {view === "graph" && selectedNode && (
        <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
