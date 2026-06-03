"use client";

import { useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { MemoryInspector } from "@/components/dashboard/MemoryInspector";
import { MemoryOmitter } from "@/components/dashboard/MemoryOmitter";
import { ClonePicker, deriveColor } from "@/components/dashboard/ClonePicker";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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
