"use client";

import { useState } from "react";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { InterviewPanel } from "@/components/interview/InterviewPanel";

export default function TrainPage() {
  const { clones, isLoading } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (clones.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Create your clone first.{" "}
          <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Get started →
          </a>
        </p>
      </div>
    );
  }

  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0];

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Interview</h1>
        </div>
        <ClonePicker clones={clones} selected={clone} onSelect={c => setSelectedId(c.clone_id)} />
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <InterviewPanel
          key={clone.clone_id}
          cloneId={clone.clone_id}
          cloneName={clone.display_name}
        />
      </div>
    </div>
  );
}
