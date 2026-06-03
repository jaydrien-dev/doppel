"use client";

import type { CloneOwnerInfo } from "@/lib/types";

const PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];

export function deriveColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function ClonePicker({
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
