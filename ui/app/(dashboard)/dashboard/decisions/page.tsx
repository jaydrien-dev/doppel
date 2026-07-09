"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useClones } from "@/lib/hooks/useClones";
import type { CloneOwnerInfo } from "@/lib/types";
import { SelectMenu } from "@/components/ui/select-menu";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Heuristic {
  id: string;
  description: string;
  domain: string;
  examples: string[];
  confidence: number;
  occurrence_count: number;
  created_at: string | null;
}

// ── Domain config ──────────────────────────────────────────────────────────────

const DOMAIN_ORDER = ["product", "technical", "hiring", "financial", "relationships", "operations", "general"];

const DOMAIN_LABELS: Record<string, string> = {
  product: "Product",
  technical: "Technical",
  hiring: "Hiring",
  financial: "Financial",
  relationships: "Relationships",
  operations: "Operations",
  general: "General",
};

// ── Heuristic card ─────────────────────────────────────────────────────────────

function HeuristicCard({ h, onDelete }: { h: Heuristic; onDelete: () => void }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const bars = Math.round(h.confidence * 5);

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.5 }}>
          {h.description}
        </p>
        {confirming ? (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setConfirming(false)}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>
              Cancel
            </button>
            <button onClick={onDelete}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)", color: "rgba(248,113,113,0.70)" }}>
              Remove
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.18)", padding: 4, borderRadius: 6, fontSize: 14, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Confidence dots */}
        <div style={{ display: "flex", gap: 3 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: "50%",
              background: i <= bars ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.10)",
            }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
          {h.confidence >= 0.85 ? "High confidence" : h.confidence >= 0.65 ? "Moderate" : "Low confidence"}
        </span>
        {h.occurrence_count > 1 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)" }}>
            · {h.occurrence_count}× observed
          </span>
        )}
        {h.examples.length > 0 && (
          <button onClick={() => setShowEvidence(e => !e)}
            style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", background: "none", border: "none",
              cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            {showEvidence ? "Hide evidence" : "See evidence"}
          </button>
        )}
      </div>

      {showEvidence && h.examples.length > 0 && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {h.examples.map((ex, i) => (
            <p key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", margin: i > 0 ? "6px 0 0" : 0,
              fontStyle: "italic", lineHeight: 1.5 }}>
              &ldquo;{ex}&rdquo;
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add heuristic form ─────────────────────────────────────────────────────────

function AddHeuristicForm({ onAdd }: { onAdd: (description: string, domain: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("general");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) ref.current?.focus(); }, [open]);

  async function submit() {
    if (!description.trim()) return;
    setSaving(true);
    await onAdd(description.trim(), domain);
    setDescription("");
    setDomain("general");
    setSaving(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
          background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.10)",
          color: "rgba(255,255,255,0.35)", fontSize: 12, width: "100%",
        }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        Add a rule manually
      </button>
    );
  }

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <textarea
        ref={ref}
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="e.g. I never agree to a deadline without first understanding the scope"
        rows={2}
        style={{
          width: "100%", background: "transparent", border: "none", outline: "none",
          fontSize: 13, color: "rgba(255,255,255,0.80)", fontFamily: "inherit", resize: "none",
          lineHeight: 1.5, boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SelectMenu
          value={domain}
          onChange={setDomain}
          size="sm"
          options={DOMAIN_ORDER.map(d => ({ value: d, label: DOMAIN_LABELS[d] ?? d }))}
        />
        <div style={{ flex: 1 }} />
        <button onClick={() => { setOpen(false); setDescription(""); }}
          style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", background: "none", border: "none",
            cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
          Cancel
        </button>
        <button onClick={submit} disabled={!description.trim() || saving}
          style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 8,
            background: description.trim() ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${description.trim() ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
            color: description.trim() ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
            cursor: description.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>
          {saving ? "Adding…" : "Add rule"}
        </button>
      </div>
    </div>
  );
}

// ── Profile card ───────────────────────────────────────────────────────────────

function DecisionProfile({ heuristics, cloneName }: { heuristics: Heuristic[]; cloneName: string }) {
  if (heuristics.length === 0) return null;

  const topDomain = (() => {
    const counts: Record<string, number> = {};
    heuristics.forEach(h => { counts[h.domain] = (counts[h.domain] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "general";
  })();

  const domainCount = new Set(heuristics.map(h => h.domain)).size;
  const highConf = heuristics.filter(h => h.confidence >= 0.80).length;

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 14,
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.22)", margin: 0 }}>
        Decision profile
      </p>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>
        {heuristics.length} rule{heuristics.length !== 1 ? "s" : ""} extracted across {domainCount} domain{domainCount !== 1 ? "s" : ""}.
        {highConf > 0 && ` ${highConf} confirmed with high confidence.`}
        {` Strongest coverage in ${DOMAIN_LABELS[topDomain] ?? topDomain}.`}
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {DOMAIN_ORDER.filter(d => heuristics.some(h => h.domain === d)).map(d => {
          const count = heuristics.filter(h => h.domain === d).length;
          return (
            <span key={d} style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 999,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.40)",
            }}>
              {DOMAIN_LABELS[d]} · {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Multi-clone apply chips ────────────────────────────────────────────────────

function MultiCloneChips({
  allClones, primaryId, selected, onToggle,
}: {
  allClones: CloneOwnerInfo[]; primaryId: string;
  selected: Set<string>; onToggle: (id: string) => void;
}) {
  const others = allClones.filter(c => c.clone_id !== primaryId);
  if (others.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>
        Also add rules to:
      </span>
      {others.map(c => {
        const on = selected.has(c.clone_id);
        return (
          <button key={c.clone_id} onClick={() => onToggle(c.clone_id)}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
              background: on ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${on ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)"}`,
              color: on ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
              transition: "all 160ms",
            }}>
            {c.display_name}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DecisionsPage() {
  const { clones } = useClones();
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());

  const primary = clones.find(c => c.clone_id === primaryId) ?? clones[0] ?? null;

  const [heuristics, setHeuristics] = useState<Heuristic[]>([]);
  const [loading, setLoading]       = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!primary) return;
    setHeuristics([]);
    setLoading(true);
    fetch(`/api/clones/${primary.handle}/decisions`)
      .then(r => r.json())
      .then(d => setHeuristics(d.decisions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [primary?.handle]); // eslint-disable-line react-hooks/exhaustive-deps

  async function extract() {
    if (!primary) return;
    setExtracting(true);
    setExtractMsg(null);
    const res = await fetch(`/api/clones/${primary.handle}/decisions/extract`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.extracted > 0) {
      setExtractMsg(`${data.extracted} new rule${data.extracted > 1 ? "s" : ""} found`);
      // Reload heuristics
      const r2 = await fetch(`/api/clones/${primary.handle}/decisions`);
      const d2 = await r2.json().catch(() => ({}));
      setHeuristics(d2.decisions ?? []);
    } else {
      setExtractMsg(data.message ?? "No new rules found");
    }
    setExtracting(false);
    setTimeout(() => setExtractMsg(null), 5000);
  }

  async function addHeuristic(description: string, domain: string) {
    if (!primary) return;
    const targets = [primary.handle, ...Array.from(extraIds).map(id => clones.find(c => c.clone_id === id)?.handle).filter(Boolean) as string[]];
    await Promise.all(
      targets.map(handle =>
        fetch(`/api/clones/${handle}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, domain, confidence: 0.85 }),
        }),
      ),
    );
    // Reload for primary
    const r = await fetch(`/api/clones/${primary.handle}/decisions`);
    const d = await r.json().catch(() => ({}));
    setHeuristics(d.decisions ?? []);
  }

  async function deleteHeuristic(id: string) {
    if (!primary) return;
    await fetch(`/api/clones/${primary.handle}/decisions/${id}`, { method: "DELETE" });
    setHeuristics(prev => prev.filter(h => h.id !== id));
  }

  function toggleExtra(id: string) {
    setExtraIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group heuristics by domain
  const grouped = DOMAIN_ORDER.reduce<Record<string, Heuristic[]>>((acc, d) => {
    const items = heuristics.filter(h => h.domain === d);
    if (items.length > 0) acc[d] = items;
    return acc;
  }, {});
  // Catch any unknown domains
  heuristics.forEach(h => {
    if (!DOMAIN_ORDER.includes(h.domain)) {
      grouped[h.domain] = grouped[h.domain] ? [...grouped[h.domain], h] : [h];
    }
  });

  return (
    <div className="db-page">

      {/* Header */}
      <div className="db-page-head" style={{ marginBottom: 8 }}>
        <div>
          <p className="db-eyebrow">Clone settings</p>
          <h1 className="db-h1">Decisions</h1>
        </div>
        {clones.length > 0 && (
          <SelectMenu
            value={primary?.clone_id ?? ""}
            onChange={v => { setPrimaryId(v); setExtraIds(new Set()); }}
            options={clones.map(c => ({ value: c.clone_id, label: c.display_name, avatarUrl: c.avatar_url }))}
          />
        )}
      </div>

      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", lineHeight: 1.6, marginBottom: 24, maxWidth: 520 }}>
        A set of heuristics that captures how you make decisions. Your clone applies these when someone asks for your take, your recommendation, or what you would do.
      </p>

      {!primary && (
        <div className="card">
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            No clones yet. <Link href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline" }}>Create one</Link>
          </p>
        </div>
      )}

      {primary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Multi-clone apply */}
          {clones.length > 1 && (
            <MultiCloneChips
              allClones={clones}
              primaryId={primary.clone_id}
              selected={extraIds}
              onToggle={toggleExtra}
            />
          )}

          {/* Extract button */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={extract}
              disabled={extracting}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 10, cursor: extracting ? "wait" : "pointer",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.70)", fontSize: 12, fontFamily: "inherit",
                opacity: extracting ? 0.6 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v3M7 10v3M1 7h3M10 7h3M3.5 3.5l2 2M8.5 8.5l2 2M10.5 3.5l-2 2M5.5 8.5l-2 2"
                  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {extracting ? "Scanning conversations…" : "Extract from conversations"}
            </button>
            {extractMsg && (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{extractMsg}</span>
            )}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)" }}>
              Scans your connected conversations for decision patterns
            </span>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.20)" }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</span>
            </div>
          )}

          {/* Profile summary */}
          {!loading && heuristics.length > 0 && (
            <DecisionProfile heuristics={heuristics} cloneName={primary.display_name} />
          )}

          {/* Empty state */}
          {!loading && heuristics.length === 0 && (
            <div style={{
              padding: "28px 24px", borderRadius: 14, textAlign: "center",
              background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)",
            }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "0 0 6px" }}>
                No decision rules yet
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", margin: 0, lineHeight: 1.6 }}>
                Connect sources and run Extract, or add rules manually below.
                {" "}
                <Link href={`/home?tab=connectors&clone=${primary.handle}`} style={{ color: "rgba(255,255,255,0.40)", textDecoration: "underline" }}>
                  Manage connectors
                </Link>
              </p>
            </div>
          )}

          {/* Heuristics grouped by domain */}
          {!loading && Object.entries(grouped).map(([domain, items]) => (
            <section key={domain}>
              <p style={{
                fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em",
                color: "rgba(255,255,255,0.22)", marginBottom: 10,
              }}>
                {DOMAIN_LABELS[domain] ?? domain}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(h => (
                  <HeuristicCard key={h.id} h={h} onDelete={() => deleteHeuristic(h.id)} />
                ))}
              </div>
            </section>
          ))}

          {/* Manual add */}
          {!loading && (
            <AddHeuristicForm onAdd={addHeuristic} />
          )}

          {/* How extraction works — info box */}
          <div style={{
            padding: "16px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.18)", marginBottom: 10 }}>
              How decisions are extracted
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Stated preferences", "Your own \"I always\" / \"I never\" patterns — the clearest signal"],
                ["Disagreement moments", "When you pushed back and why — reveals your true priorities"],
                ["Repeated trade-offs", "The same call made across different situations — high-confidence rules"],
                ["Risk language", "\"I'd rather\", \"even if\", \"worst case\" — captures your risk posture"],
                ["Attribution patterns", "\"The reason I\" — explicit self-reflection about your own decisions"],
              ].map(([title, desc]) => (
                <div key={title} style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.20)", marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{title} </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
