"use client";

import useSWR from "swr";

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

function strengthStyle(count: number, max: number): React.CSSProperties {
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.5) {
    return {
      color: "rgba(255,255,255,0.75)",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
    };
  }
  if (ratio >= 0.2) {
    return {
      color: "rgba(255,255,255,0.55)",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
    };
  }
  return {
    color: "rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  };
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
      <div className="card">
        <div style={{ height: 14, width: 128, background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 12 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ height: 24, width: 64, background: "rgba(255,255,255,0.04)", borderRadius: 9999 }} />
          ))}
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="card">
        <p className="card-title">Topic coverage</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
          No topics detected yet. Add more memories to build your coverage map.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <p className="card-title">Topic coverage</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
            {topics.length} topics across {(data?.total_memories ?? 0).toLocaleString()} memories
          </p>
        </div>
      </div>

      {/* Topic pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {topics.map((t) => (
          <span
            key={t.name}
            title={`${t.count} memories`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              borderRadius: 9999,
              fontSize: 12,
              transition: "opacity 0.15s",
              ...strengthStyle(t.count, max),
            }}
          >
            {t.name}
            <span style={{ fontSize: 10, opacity: 0.6 }}>{t.count}</span>
          </span>
        ))}
      </div>

      {/* Knowledge gaps */}
      {gaps.length > 0 && (
        <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 3v2.5M5 7h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Knowledge gaps &mdash; add content to strengthen these areas
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {gaps.map((g) => (
              <span
                key={g.domain}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: 12,
                  color: "rgba(251,191,36,0.50)",
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.10)",
                }}
              >
                {g.domain}
                <span style={{ fontSize: 10, opacity: 0.7 }}>{g.facts} facts</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
