"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Topic {
  name: string;
  count: number;
  sources: { gmail: number; upload: number; seed_qa: number; chat: number };
}

interface Gap {
  domain: string;
  facts: number;
  avg_confidence: number;
}

interface TopicsData {
  topics: Topic[];
  gaps: Gap[];
  total_memories: number;
}

function strengthColor(count: number, max: number): string {
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.5) return "text-white/75 bg-white/[0.08] border-white/[0.12]";
  if (ratio >= 0.2) return "text-white/55 bg-white/[0.05] border-white/[0.08]";
  return "text-white/35 bg-white/[0.03] border-white/[0.05]";
}

export function TopicCoverageCard({ cloneId }: { cloneId: string }) {
  const { data, isLoading } = useSWR<TopicsData>(
    `/api/brain/topics?clone_id=${cloneId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const topics = data?.topics ?? [];
  const gaps = data?.gaps ?? [];
  const max = topics[0]?.count ?? 1;

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="h-4 w-32 bg-white/[0.05] rounded animate-pulse mb-3" />
        <div className="flex flex-wrap gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-6 w-16 bg-white/[0.04] rounded-full animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-medium text-white/60 mb-1">Topic coverage</h3>
        <p className="text-xs text-white/30">
          No topics detected yet. Add more memories to build your coverage map.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-white/60 mb-1">Topic coverage</h3>
          <p className="text-xs text-white/30">
            {topics.length} topics across {(data?.total_memories ?? 0).toLocaleString()} memories
          </p>
        </div>
      </div>

      {/* Topic pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {topics.map((t) => (
          <span
            key={t.name}
            title={`${t.count} memories`}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all",
              strengthColor(t.count, max)
            )}
          >
            {t.name}
            <span className="text-[10px] opacity-60">{t.count}</span>
          </span>
        ))}
      </div>

      {/* Knowledge gaps */}
      {gaps.length > 0 && (
        <div className="pt-4 border-t border-white/[0.06]">
          <p className="text-[11px] text-white/35 mb-2 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 3v2.5M5 7h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Knowledge gaps — add content to strengthen these areas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {gaps.map((g) => (
              <span
                key={g.domain}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-amber-300/50 bg-amber-400/[0.06] border border-amber-400/[0.1]"
              >
                {g.domain}
                <span className="text-[10px] opacity-70">{g.facts} facts</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
