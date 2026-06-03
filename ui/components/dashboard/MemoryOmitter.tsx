"use client";

import { useState } from "react";
import useSWR from "swr";

interface OmissionRule {
  pattern: string;
  created_at: string;
  affected: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function MemoryOmitter({ handle }: { handle: string }) {

  const { data, isLoading, mutate } = useSWR<{ rules: OmissionRule[] }>(
    handle ? `/api/clones/${handle}/omissions` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ pattern: string; affected: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const rules = data?.rules ?? [];

  async function handleAdd() {
    if (!handle || !input.trim() || adding) return;
    setAdding(true);
    setAddResult(null);
    try {
      const res = await fetch(`/api/clones/${handle}/omissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: input.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        setAddResult({ pattern: d.pattern, affected: d.affected });
        setInput("");
        mutate();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(pattern: string) {
    if (!handle || removing) return;
    setRemoving(pattern);
    try {
      await fetch(`/api/clones/${handle}/omissions?pattern=${encodeURIComponent(pattern)}`, {
        method: "DELETE",
      });
      setConfirmRemove(null);
      mutate();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div style={{
      borderRadius: 16, overflow: "hidden",
      background: "rgba(239,68,68,0.04)",
      border: "1px solid rgba(239,68,68,0.20)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid rgba(239,68,68,0.12)",
        display: "flex", alignItems: "flex-start", gap: 12,
      }}>
        {/* Warning icon */}
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(248,113,113,0.80)",
        }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14.5 13.5H1.5L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(248,113,113,0.90)", margin: 0 }}>
            Memory Omitter
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 3, lineHeight: 1.5 }}>
            Block topics or keywords from your clone&apos;s memory permanently.
            Any chunk containing a blocked term is excluded from all responses.
          </p>
        </div>
      </div>

      {/* Add rule */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(239,68,68,0.10)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g. salary, home address, medical history…"
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(239,68,68,0.18)",
              borderRadius: 10, padding: "8px 12px",
              fontSize: 12, color: "rgba(255,255,255,0.75)", fontFamily: "inherit", outline: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 500,
              background: adding || !input.trim() ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.14)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: adding || !input.trim() ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.85)",
              cursor: adding || !input.trim() ? "default" : "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            {adding ? "Blocking…" : "Block"}
          </button>
        </div>
        {addResult && (
          <p style={{ fontSize: 11, color: "rgba(248,113,113,0.60)", marginTop: 8, marginBottom: 0 }}>
            &ldquo;{addResult.pattern}&rdquo; blocked —{" "}
            <span style={{ color: "rgba(248,113,113,0.80)" }}>{addResult.affected}</span> chunk{addResult.affected !== 1 ? "s" : ""} excluded
          </p>
        )}
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
          Blocked chunks are permanently hidden. Removing a rule does not restore them.
        </p>
      </div>

      {/* Rules list */}
      {isLoading ? (
        <div style={{ padding: "16px 20px", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Loading…</div>
      ) : rules.length === 0 ? (
        <div style={{ padding: "18px 20px" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>
            No blocked topics. Your clone has full access to all stored memory.
          </p>
        </div>
      ) : (
        <div>
          {rules.map((rule, idx) => (
            <div
              key={rule.pattern}
              style={{
                padding: "11px 20px",
                borderTop: idx === 0 ? "none" : "1px solid rgba(239,68,68,0.08)",
                display: "flex", alignItems: "center", gap: 10,
              }}
            >
              {/* Pattern */}
              <span style={{
                flex: 1, fontSize: 13, color: "rgba(255,255,255,0.65)",
                fontFamily: "ui-monospace, Menlo, monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {rule.pattern}
              </span>
              {/* Count */}
              <span style={{
                fontSize: 11, flexShrink: 0,
                color: rule.affected > 0 ? "rgba(248,113,113,0.55)" : "rgba(255,255,255,0.25)",
              }}>
                {rule.affected} chunk{rule.affected !== 1 ? "s" : ""}
              </span>
              {/* Date */}
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
                {new Date(rule.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              {/* Remove */}
              {confirmRemove === rule.pattern ? (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleRemove(rule.pattern)}
                    disabled={removing === rule.pattern}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
                      color: "rgba(248,113,113,0.80)", fontFamily: "inherit",
                    }}
                  >
                    {removing === rule.pattern ? "…" : "Remove rule"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                      background: "none", border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.35)", fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemove(rule.pattern)}
                  style={{
                    fontSize: 11, color: "rgba(255,255,255,0.25)", background: "none",
                    border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
                  }}
                >
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
