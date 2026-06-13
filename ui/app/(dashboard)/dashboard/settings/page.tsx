"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClones } from "@/lib/hooks/useClones";
import { ClonePicker } from "@/components/dashboard/ClonePicker";


// ---------------------------------------------------------------------------
// Admin policies panel
// ---------------------------------------------------------------------------

function AdminPoliciesPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  const [escalationThreshold, setEscalationThreshold] = useState<number>(50);
  const [requireHumanReview, setRequireHumanReview] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => {
        const p = d.admin_policies ?? {};
        setBlockedTopics(p.blocked_topics ?? []);
        setEscalationThreshold(p.escalation_threshold ?? 50);
        setRequireHumanReview(p.require_human_review ?? false);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/identity/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policies: { blocked_topics: blockedTopics, escalation_threshold: escalationThreshold, require_human_review: requireHumanReview },
      }),
    });
    setSaving(false);
  }

  function addTopic() {
    const t = topicDraft.trim();
    if (t && !blockedTopics.includes(t)) {
      setBlockedTopics((prev) => [...prev, t]);
      setTopicDraft("");
    }
  }

  if (!loaded) return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, margin: 0 }}>
        Control what your clone will and won&apos;t respond to. These policies apply to all surfaces.
      </p>

      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Blocked topics</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
          Your clone will decline any question touching these topics.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {blockedTopics.map((t) => (
            <span key={t} style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
              color: "rgba(255,255,255,0.55)", background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "4px 10px",
            }}>
              {t}
              <button
                onClick={() => setBlockedTopics((prev) => prev.filter((x) => x !== t))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 0, fontSize: 12, lineHeight: 1 }}
              >×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopic()}
            placeholder="e.g. salary, competitors, legal advice"
            className="input"
            style={{ flex: 1 }}
          />
          <button onClick={addTopic} className="btn btn--sm btn--ghost">Add</button>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", margin: 0 }}>Escalation threshold</p>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "ui-monospace, Menlo, monospace" }}>{escalationThreshold}%</span>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
          Responses below this confidence level will be flagged for human review.
        </p>
        <input
          type="range"
          min={10}
          max={90}
          value={escalationThreshold}
          onChange={(e) => setEscalationThreshold(Number(e.target.value))}
          style={{ width: "100%", accentColor: "rgba(255,255,255,0.50)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.20)", marginTop: 4 }}>
          <span>10% (rarely escalate)</span>
          <span>90% (almost always)</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 3 }}>Require human review for all responses</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>Clone drafts but never auto-sends — you approve every response.</p>
        </div>
        <button
          onClick={() => setRequireHumanReview((v) => !v)}
          style={{
            position: "relative", width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: requireHumanReview ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.08)",
            border: "none", cursor: "pointer", transition: "background 180ms",
          }}
        >
          <span style={{
            position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff",
            transition: "transform 180ms", transform: requireHumanReview ? "translateX(18px)" : "translateX(2px)",
          }} />
        </button>
      </div>

      <button onClick={save} disabled={saving || !cloneHandle} className="btn" style={{ width: "100%", justifyContent: "center" }}>
        {saving ? "Saving…" : "Save policies"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Retention panel
// ---------------------------------------------------------------------------

function DataRetentionPanel({ cloneHandle, cloneId }: { cloneHandle: string | null; cloneId: string | null }) {
  const [episodic, setEpisodic] = useState(730);
  const [traces, setTraces] = useState(365);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const qs = cloneId ? `?clone_id=${cloneId}` : "";
    fetch(`/api/identity${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.retention_days_episodic) setEpisodic(d.retention_days_episodic);
        if (d.retention_days_traces) setTraces(d.retention_days_traces);
      })
      .catch(() => {});
  }, [cloneId]);

  async function save() {
    if (!cloneHandle) return;
    setSaving(true);
    try {
      await fetch(`/api/clones/${cloneHandle}/retention`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retention_days_episodic: episodic, retention_days_traces: traces }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!cloneHandle) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch(`/api/clones/${cloneHandle}/run-retention`, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setResult(`Deleted ${d.deleted_episodic} memories and ${d.deleted_traces} traces.`);
      } else {
        setResult(d.detail || "Error");
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Data retention</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Set how long episodic memories and reasoning traces are kept.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Episodic memory (days)</label>
          <input type="number" min={1} value={episodic} onChange={(e) => setEpisodic(Number(e.target.value))} className="input" />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Reasoning traces (days)</label>
          <input type="number" min={1} value={traces} onChange={(e) => setTraces(Number(e.target.value))} className="input" />
        </div>
      </div>

      {result && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0 }}>{result}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving || !cloneHandle} className="btn" style={{ flex: 1, justifyContent: "center" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={runNow} disabled={running || !cloneHandle} className="btn btn--ghost">
          {running ? "Running…" : "Run now"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone preservation + legal hold panel
// ---------------------------------------------------------------------------

function PreservationPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [isPreserved, setIsPreserved] = useState(false);
  const [holdUntil, setHoldUntil] = useState("");
  const [holdDraft, setHoldDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((d) => {
        setIsPreserved(d.is_preserved ?? false);
        setHoldUntil(d.legal_hold_until ?? "");
      })
      .catch(() => {});
  }, []);

  async function togglePreserve() {
    if (!cloneHandle) return;
    setSaving(true);
    try {
      const endpoint = isPreserved
        ? `/api/clones/${cloneHandle}/unpreserve`
        : `/api/clones/${cloneHandle}/preserve`;
      await fetch(endpoint, { method: "POST" });
      setIsPreserved((v) => !v);
    } finally {
      setSaving(false);
    }
  }

  async function setHold() {
    if (!cloneHandle || !holdDraft) return;
    setSaving(true);
    try {
      await fetch(`/api/clones/${cloneHandle}/legal-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: holdDraft }),
      });
      setHoldUntil(holdDraft);
      setHoldDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function clearHold() {
    if (!cloneHandle) return;
    setSaving(true);
    try {
      await fetch(`/api/clones/${cloneHandle}/legal-hold`, { method: "DELETE" });
      setHoldUntil("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Preservation</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Freeze your clone to prevent any new ingestion or data changes.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 3 }}>Preserve clone</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>
            {isPreserved ? "Clone is read-only. Ingestion and deletion are blocked." : "Clone is active."}
          </p>
        </div>
        <button
          onClick={togglePreserve}
          disabled={saving || !cloneHandle}
          style={{
            position: "relative", width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: isPreserved ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.08)",
            border: "none", cursor: "pointer", transition: "background 180ms",
            opacity: (saving || !cloneHandle) ? 0.4 : 1,
          }}
        >
          <span style={{
            position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff",
            transition: "transform 180ms", transform: isPreserved ? "translateX(18px)" : "translateX(2px)",
          }} />
        </button>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", margin: 0 }}>Legal hold</p>
        {holdUntil ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0 }}>
              Hold active until <span style={{ color: "rgba(255,255,255,0.60)" }}>{holdUntil}</span>. Deletion blocked.
            </p>
            <button onClick={clearHold} disabled={saving} className="btn btn--sm btn--ghost" style={{ color: "rgba(255,255,255,0.30)" }}>
              Clear
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={holdDraft} onChange={(e) => setHoldDraft(e.target.value)} className="input" style={{ flex: 1 }} />
            <button onClick={setHold} disabled={!holdDraft || saving || !cloneHandle} className="btn btn--sm">Set hold</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GDPR export + delete panel
// ---------------------------------------------------------------------------

function GdprPanel({ cloneHandle }: { cloneHandle: string | null }) {
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadExport() {
    window.open("/api/clones/me/export", "_blank");
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await fetch("/api/clones/me", {
        method: "DELETE",
        headers: { "X-Confirm-Delete": "I_UNDERSTAND_THIS_IS_PERMANENT" },
      });
      window.location.href = "/";
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Your data rights</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          GDPR Articles 20 &amp; 17 — export or permanently delete all your data.
        </p>
      </div>

      <button onClick={downloadExport} disabled={!cloneHandle} className="btn" style={{ width: "100%", justifyContent: "flex-start" }}>
        Export all my data →
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>JSON download</span>
      </button>

      <button
        onClick={() => { setShowModal(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        disabled={!cloneHandle}
        className="btn"
        style={{ width: "100%", justifyContent: "center", color: "rgba(248,113,113,0.70)", borderColor: "rgba(248,113,113,0.15)", background: "transparent" }}
      >
        Delete all my data
      </button>

      {showModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.70)", backdropFilter: "blur(8px)",
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 400, margin: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>Are you absolutely sure?</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.6, margin: 0 }}>
              This will permanently delete your clone, all memories, and all reasoning traces. This action cannot be undone.
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              Type <span style={{ color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, Menlo, monospace" }}>DELETE</span> to confirm:
            </p>
            <input
              ref={inputRef}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="input"
              style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowModal(false); setConfirmText(""); }} className="btn btn--ghost" style={{ flex: 1, justifyContent: "center" }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="btn"
                style={{ flex: 1, justifyContent: "center", color: "rgba(248,113,113,0.80)", borderColor: "rgba(248,113,113,0.20)", background: "rgba(248,113,113,0.08)" }}
              >
                {deleting ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Connected Tools (MCP servers) panel
// ---------------------------------------------------------------------------

interface MCPServerRow {
  id: string;
  name: string;
  server_url: string;
  transport: string;
  tool_names: string[];
  enabled: boolean;
}

function ConnectedToolsPanel({ cloneId }: { cloneId: string | null }) {
  const [servers, setServers] = useState<MCPServerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cloneId) return;
    setLoading(true);
    fetch(`/api/tools?clone_id=${cloneId}`)
      .then(r => r.json())
      .then(d => setServers(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cloneId]);

  async function handleAdd() {
    if (!cloneId || !nameDraft.trim() || !urlDraft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clone_id: cloneId,
          name: nameDraft.trim(),
          server_url: urlDraft.trim(),
          api_key: keyDraft.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        const newRow: MCPServerRow = { id: d.id, name: nameDraft.trim(), server_url: urlDraft.trim(), transport: "streamablehttp", tool_names: [], enabled: true };
        setServers(prev => [...prev, newRow]);
        setNameDraft(""); setUrlDraft(""); setKeyDraft(""); setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id: string) {
    if (!cloneId) return;
    setTestingId(id);
    setTestResult(prev => ({ ...prev, [id]: "Testing…" }));
    try {
      const res = await fetch(`/api/tools/${id}/test?clone_id=${cloneId}`, { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setTestResult(prev => ({ ...prev, [id]: `${d.tool_count} tool${d.tool_count !== 1 ? "s" : ""} found` }));
        setServers(prev => prev.map(s => s.id === id ? { ...s, tool_names: d.tools.map((t: { name: string }) => t.name) } : s));
      } else {
        setTestResult(prev => ({ ...prev, [id]: d.detail || "Connection failed" }));
      }
    } catch {
      setTestResult(prev => ({ ...prev, [id]: "Connection failed" }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!cloneId) return;
    setDeletingId(id);
    try {
      await fetch(`/api/tools/${id}?clone_id=${cloneId}`, { method: "DELETE" });
      setServers(prev => prev.filter(s => s.id !== id));
      setTestResult(prev => { const n = { ...prev }; delete n[id]; return n; });
    } finally {
      setDeletingId(null);
    }
  }

  if (!cloneId) return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 4 }}>Connected tools</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Connect MCP servers so your clone can take actions — post to Slack, search Drive, query Notion.
        </p>
      </div>

      {loading && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>Loading…</p>
      )}

      {!loading && servers.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>No tools connected yet.</p>
      )}

      {servers.map(server => (
        <div key={server.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0 }}>{server.name}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 2, marginBottom: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server.server_url}</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => handleTest(server.id)}
                disabled={testingId === server.id}
                className="btn btn--sm btn--ghost"
                style={{ fontSize: 11 }}
              >
                {testingId === server.id ? "…" : "Test"}
              </button>
              <button
                onClick={() => handleDelete(server.id)}
                disabled={deletingId === server.id}
                className="btn btn--sm btn--ghost"
                style={{ fontSize: 11, color: "rgba(248,113,113,0.60)", borderColor: "rgba(248,113,113,0.12)" }}
              >
                {deletingId === server.id ? "…" : "Remove"}
              </button>
            </div>
          </div>

          {server.tool_names.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {server.tool_names.slice(0, 6).map(name => (
                <span key={name} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>
                  {name.split("__")[1] ?? name}
                </span>
              ))}
              {server.tool_names.length > 6 && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>+{server.tool_names.length - 6} more</span>
              )}
            </div>
          )}

          {testResult[server.id] && (
            <p style={{ fontSize: 11, color: testResult[server.id].includes("failed") ? "rgba(248,113,113,0.60)" : "rgba(52,211,153,0.60)", margin: 0 }}>
              {testResult[server.id]}
            </p>
          )}
        </div>
      ))}

      {adding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
          <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Name (e.g. Google Drive)" className="input" />
          <input value={urlDraft} onChange={e => setUrlDraft(e.target.value)} placeholder="MCP server URL" className="input" />
          <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="API key (optional)" className="input" type="password" />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} disabled={saving || !nameDraft.trim() || !urlDraft.trim()} className="btn btn--sm" style={{ flex: 1, justifyContent: "center" }}>
              {saving ? "Adding…" : "Add tool"}
            </button>
            <button onClick={() => { setAdding(false); setNameDraft(""); setUrlDraft(""); setKeyDraft(""); }} className="btn btn--sm btn--ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn--ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
          + Connect a tool
        </button>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main settings page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { clones } = useClones();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clone = clones.find(c => c.clone_id === selectedId) ?? clones[0] ?? null;

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Account</p>
          <h1 className="db-h1">Settings</h1>
        </div>
      </div>

      <div style={{ maxWidth: 640 }}>

        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderRadius: 14, marginBottom: 24,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)", margin: 0 }}>Profile</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: "2px 0 0" }}>
              Name, bio, location, and account deletion.
            </p>
          </div>
          <Link href="/dashboard/profile" className="btn" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            Edit profile →
          </Link>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
          {[
            { label: "Activity", href: "/dashboard/activity" },
            { label: "Billing", href: "/dashboard/billing" },
          ].map(({ label, href }) => (
            <Link key={href} href={href} className="btn" style={{ flex: 1, justifyContent: "center" }}>
              {label} →
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Clone selector for per-clone settings */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 4px" }}>
            <p className="db-eyebrow" style={{ margin: 0 }}>Clone settings</p>
            <ClonePicker clones={clones} selected={clone ?? clones[0]} onSelect={c => setSelectedId(c.clone_id)} />
          </div>

          <p className="db-eyebrow" style={{ padding: "16px 4px 8px", marginBottom: 0 }}>Admin policies</p>
          <AdminPoliciesPanel cloneHandle={clone?.handle ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Data retention</p>
          <DataRetentionPanel cloneHandle={clone?.handle ?? null} cloneId={clone?.clone_id ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Preservation</p>
          <PreservationPanel cloneHandle={clone?.handle ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Connected tools</p>
          <ConnectedToolsPanel cloneId={clone?.clone_id ?? null} />

          <p className="db-eyebrow" style={{ padding: "24px 4px 8px", marginBottom: 0 }}>Your data rights</p>
          <GdprPanel cloneHandle={clone?.handle ?? null} />

        </div>
      </div>
    </div>
  );
}
