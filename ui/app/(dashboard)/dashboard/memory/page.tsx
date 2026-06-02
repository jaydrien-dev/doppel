"use client";

import { useClone } from "@/lib/hooks/useClone";
import { MemoryInspector } from "@/components/dashboard/MemoryInspector";
import { MemoryOmitter } from "@/components/dashboard/MemoryOmitter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function MemoryPage() {
  const { clone, isLoading } = useClone();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Clone</p>
          <h1 className="db-h1">Memory</h1>
        </div>
      </div>

      {!clone ? (
        <div className="card">
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            Create your clone first.{" "}
            <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              Get started →
            </a>
          </p>
        </div>
      ) : (
        <>
          <MemoryOmitter />
          <MemoryInspector cloneId={clone.clone_id} />
        </>
      )}
    </div>
  );
}
