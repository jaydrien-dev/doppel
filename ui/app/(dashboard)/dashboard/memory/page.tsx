"use client";

import { useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { MemoryInspector } from "@/components/dashboard/MemoryInspector";
import { MemoryOmitter } from "@/components/dashboard/MemoryOmitter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { CloneOwnerInfo } from "@/lib/types";

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function deriveColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function ClonePicker({
  clones,
  selected,
  onSelect,
}: {
  clones: CloneOwnerInfo[];
  selected: CloneOwnerInfo;
  onSelect: (c: CloneOwnerInfo) => void;
}) {
  if (clones.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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

export default function MemoryPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (clones.length === 0) {
    return (
      <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="db-page-head">
          <div>
            <p className="db-eyebrow">Clone</p>
            <h1 className="db-h1">Memory</h1>
          </div>
        </div>
        <div className="card">
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            Create your clone first.{" "}
            <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              Get started →
            </a>
          </p>
        </div>
      </div>
    );
  }

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p className="db-eyebrow">Clone</p>
            <h1 className="db-h1">Memory</h1>
          </div>

          {/* Clone identity + picker */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, paddingTop: 4 }}>
            {/* Active clone badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: deriveColor(clone.display_name),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 500, color: "#fff", overflow: "hidden", flexShrink: 0,
              }}>
                {clone.avatar_url
                  ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : clone.display_name[0]?.toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.3 }}>
                  {clone.listing_title || clone.display_name}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>@{clone.handle}</p>
              </div>
            </div>
            {/* Picker — only visible when there are multiple clones */}
            <ClonePicker
              clones={clones}
              selected={clone}
              onSelect={(c) => setSelectedId(c.clone_id)}
            />
          </div>
        </div>
      </div>

      <MemoryOmitter handle={clone.handle} />
      <MemoryInspector cloneId={clone.clone_id} />
    </div>
  );
}
