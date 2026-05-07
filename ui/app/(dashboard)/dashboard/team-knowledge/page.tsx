"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";

interface KnowledgeClone {
  clone_id: string;
  display_name: string;
  handle: string;
  expertise_tags: string[];
  member_role: string;
}

export default function TeamKnowledgePage() {
  const { user } = useUser();
  const [clones, setClones] = useState<KnowledgeClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/org/knowledge-directory")
      .then((r) => r.json())
      .then((d) => setClones(d.clones ?? []))
      .catch(() => setError("Failed to load team knowledge clones."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-2">Team</p>
        <h1 className="text-2xl font-light text-white/85">Team Knowledge</h1>
        <p className="text-sm text-white/35 mt-1 leading-relaxed">
          Your colleagues&apos; clones, available to answer questions. Ask about processes,
          decisions, context — the knowledge that&apos;s never on paper.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400/60 mb-4">{error}</p>
      )}

      {clones.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-white/40 mb-2">No knowledge clones available yet.</p>
          <p className="text-xs text-white/25 leading-relaxed max-w-xs mx-auto">
            Org admins can mark team members&apos; clones as knowledge resources in the
            Team settings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clones.map((clone) => (
            <CloneCard key={clone.clone_id} clone={clone} />
          ))}
        </div>
      )}
    </div>
  );
}

function CloneCard({ clone }: { clone: KnowledgeClone }) {
  const initial = clone.display_name[0]?.toUpperCase() ?? "?";
  const firstName = clone.display_name.split(" ")[0];

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4 hover:glass-md transition-all">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl glass-md flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-white/55">{initial}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/80 truncate">{clone.display_name}</p>
          <p className="text-[11px] text-white/30">@{clone.handle}</p>
        </div>
      </div>

      {clone.expertise_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {clone.expertise_tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-white/40 bg-white/[0.05] border border-white/[0.07] rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <a
        href={`/c/${clone.handle}`}
        className="mt-auto glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/60 hover:text-white/80 transition-all text-center"
      >
        Ask {firstName} →
      </a>
    </div>
  );
}
