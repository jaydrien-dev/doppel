"use client";

import { useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { CloneOwnerInfo } from "@/lib/types";

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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
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

export default function TestPage() {
  const { clones, isLoading } = useClones();
  const [mode, setMode] = useState<"owner" | "public">("owner");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (clones.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          No clone yet.{" "}
          <a href="/dashboard" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Create one →
          </a>
        </p>
      </div>
    );
  }

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Creator only</p>
          <h1 className="db-h1">Test your clone <em>before anyone else does.</em></h1>
          <p style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.45)", maxWidth: 520, lineHeight: 1.6 }}>
            <strong style={{ color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>Training mode</strong> — approve, edit, or reject answers to teach the clone. No credits deducted.{" "}
            <strong style={{ color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>Consumer preview</strong> — see exactly what visitors experience. Credits deducted at the clone&apos;s rate.
          </p>
          <div style={{ marginTop: 12 }}>
            <ClonePicker clones={clones} selected={clone} onSelect={(c) => setSelectedId(c.clone_id)} />
          </div>
        </div>
        {/* Mode toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 3 }}>
          {(["owner", "public"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "6px 14px", borderRadius: 9, border: "none",
              background: mode === m ? "rgba(255,255,255,0.07)" : "transparent",
              color: mode === m ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
              fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
              {m === "owner" ? "Training mode" : "Consumer preview"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat surface */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 880, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", minHeight: 440 }}>
          <ChatInterface
            key={clone.clone_id}
            cloneId={clone.clone_id}
            cloneName={clone.listing_title || clone.display_name}
            cloneAvatarUrl={clone.avatar_url}
            contextType="chat"
            ownerMode={mode === "owner"}
            placeholder={mode === "owner" ? "Train your clone — ask it anything…" : "Preview as a consumer — credits will deduct…"}
            pricePerQuery={mode === "owner" ? 0 : (clone.price_per_query ?? 0)}
          />
        </div>
      </div>
    </div>
  );
}
