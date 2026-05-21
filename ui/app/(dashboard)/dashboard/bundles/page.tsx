"use client";

import { useEffect, useState, useCallback } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
interface Bundle {
  id: string;
  title: string;
  description: string | null;
  price_usd: number;
  is_published: boolean;
  created_at: string;
  queries_included: number;
  clone_count?: number;
}

interface BundleCloneMember {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
  position: number;
}

interface ConsumerBundleItem {
  id: string;
  clone_id: string;
  clone_name: string;
  clone_handle: string;
  topic: string;
  position: number;
  status: "pending" | "generating" | "ready" | "failed";
  credits_used: number;
}

interface ConsumerBundle {
  id: string;
  title: string;
  description: string | null;
  price_usd: number;
  is_public: boolean;
  created_at: string;
  item_count: number;
  ready_count: number;
}

interface MarketplaceClone {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
}

// ---------------------------------------------------------------------------
// Status chip (used by consumer bundle items)
// ---------------------------------------------------------------------------
function StatusChip({ status }: { status: ConsumerBundleItem["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Pending",    cls: "badge badge--neutral" },
    generating: { label: "Generating", cls: "badge badge--warn" },
    ready:      { label: "Ready",      cls: "badge badge--pos" },
    failed:     { label: "Failed",     cls: "badge badge--neg" },
  };
  const { label, cls } = map[status] ?? map.pending;
  return (
    <span className={cls} style={{ fontSize: 10 }}>
      {status === "generating" && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block", animation: "pulse-glow 1.2s ease-in-out infinite" }} />
      )}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Creator bundle editor (multi-clone + queries model)
// ---------------------------------------------------------------------------
function BundleEditor({ bundle, onRefresh, onClose }: {
  bundle: Bundle;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(bundle.title);
  const [description, setDescription] = useState(bundle.description ?? "");
  const [price, setPrice] = useState(Number(bundle.price_usd).toFixed(2));
  const [queriesIncluded, setQueriesIncluded] = useState(String(bundle.queries_included || 0));
  const [members, setMembers] = useState<BundleCloneMember[]>([]);
  const [allClones, setAllClones] = useState<MarketplaceClone[]>([]);
  const [cloneSearch, setCloneSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bundles/${bundle.id}/clones`)
      .then((r) => r.json())
      .then((d) => setMembers(d.clones ?? []))
      .catch(() => {});
    fetch("/api/marketplace?limit=48&sort=most_queries")
      .then((r) => r.json())
      .then((d) => setAllClones(d.clones ?? []))
      .catch(() => {});
  }, [bundle.id]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/bundles/${bundle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          price_usd: parseFloat(price) || 0,
          queries_included: parseInt(queriesIncluded) || 0,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail ?? "Save failed"); }
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function addClone(cloneId: string) {
    const res = await fetch(`/api/bundles/${bundle.id}/clones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clone_id: cloneId }),
    });
    if (res.ok) {
      const clone = allClones.find((c) => c.clone_id === cloneId);
      if (clone) setMembers((prev) => [...prev, { clone_id: clone.clone_id, display_name: clone.display_name, handle: clone.handle, category: clone.category, position: prev.length }]);
    }
  }

  async function removeClone(cloneId: string) {
    await fetch(`/api/bundles/${bundle.id}/clones/${cloneId}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.clone_id !== cloneId));
  }

  async function togglePublish() {
    if (!bundle.is_published && members.length < 1) { setError("Add at least one clone before publishing"); return; }
    const res = await fetch(`/api/bundles/${bundle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: !bundle.is_published }),
    });
    if (res.ok) onRefresh();
    else { const d = await res.json(); setError(d.detail ?? "Update failed"); }
  }

  const memberIds = new Set(members.map((m) => m.clone_id));
  const filteredClones = allClones.filter(
    (c) => !memberIds.has(c.clone_id) && c.display_name.toLowerCase().includes(cloneSearch.toLowerCase())
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.30)", cursor: "pointer", padding: 2 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>{bundle.title}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={bundle.is_published ? "badge badge--pos" : "badge badge--neutral"} style={{ fontSize: 10 }}>
            {bundle.is_published ? "Live" : "Draft"}
          </span>
          <button onClick={togglePublish} className="btn btn--sm">{bundle.is_published ? "Unpublish" : "Publish"}</button>
        </div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Core fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input" style={{ resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Price (USD)</label>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Queries included</label>
              <input type="number" min="0" step="1" value={queriesIncluded} onChange={(e) => setQueriesIncluded(e.target.value)} className="input" placeholder="e.g. 100" />
            </div>
          </div>
        </div>
        <div><button onClick={save} disabled={saving} className="btn btn--primary btn--sm">{saving ? "Saving…" : "Save changes"}</button></div>

        {/* Clone members */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 10 }}>
            Clones in bundle <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.25)" }}>({members.length})</span>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => (
              <div key={m.clone_id} className="act-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.display_name}</p>
                  {m.category && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>{m.category}</p>}
                </div>
                <button onClick={() => removeClone(m.clone_id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.20)", cursor: "pointer", padding: 2, flexShrink: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.60)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.20)"; }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
            {members.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "6px 0" }}>No clones yet. Add from the marketplace below.</p>}
          </div>

          {/* Clone search picker */}
          <div style={{ marginTop: 10 }}>
            <input
              value={cloneSearch}
              onChange={(e) => setCloneSearch(e.target.value)}
              placeholder="Search marketplace clones to add…"
              className="input"
              style={{ width: "100%", marginBottom: 8 }}
            />
            {cloneSearch && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                {filteredClones.slice(0, 8).map((c) => (
                  <button
                    key={c.clone_id}
                    onClick={() => { addClone(c.clone_id); setCloneSearch(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.03)", cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(255,255,255,0.10)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.60)",
                    }}>{c.display_name.charAt(0).toUpperCase()}</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", flex: 1 }}>{c.display_name}</span>
                    {c.category && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{c.category}</span>}
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.20)", flexShrink: 0 }}><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                ))}
                {filteredClones.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "4px 0" }}>No matching clones</p>}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)" }}>
            <p style={{ fontSize: 12, color: "rgba(248,113,113,0.80)" }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consumer bundle editor
// ---------------------------------------------------------------------------
function ConsumerBundleEditor({ bundle, onRefresh, onClose }: {
  bundle: ConsumerBundle;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(bundle.title);
  const [description, setDescription] = useState(bundle.description ?? "");
  const [price, setPrice] = useState(Number(bundle.price_usd).toFixed(2));
  const [isPublic, setIsPublic] = useState(bundle.is_public);
  const [items, setItems] = useState<ConsumerBundleItem[]>([]);
  const [clones, setClones] = useState<MarketplaceClone[]>([]);
  const [selectedClone, setSelectedClone] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/consumer-bundles/${bundle.id}/items`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
    fetch("/api/marketplace?limit=48&sort=most_queries")
      .then((r) => r.json())
      .then((d) => setClones(d.clones ?? []))
      .catch(() => {});
  }, [bundle.id]);

  useEffect(() => {
    if (!items.some((i) => i.status === "generating")) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/consumer-bundles/${bundle.id}/items`);
      const d = await res.json();
      if (d.items) setItems(d.items);
    }, 3000);
    return () => clearInterval(t);
  }, [items, bundle.id]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/consumer-bundles/${bundle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || null, price_usd: parseFloat(price) || 0, is_public: isPublic }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail ?? "Save failed"); }
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function addItem() {
    if (!selectedClone || !newTopic.trim()) return;
    const res = await fetch(`/api/consumer-bundles/${bundle.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clone_id: selectedClone, topic: newTopic.trim() }),
    });
    const d = await res.json();
    if (res.ok) { setItems((prev) => [...prev, d]); setNewTopic(""); }
    else { setError(d.detail ?? "Failed to add item"); }
  }

  async function removeItem(itemId: string) {
    await fetch(`/api/consumer-bundles/${bundle.id}/items/${itemId}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function generate() {
    setGenerating(true); setError(null);
    try {
      const res = await fetch(`/api/consumer-bundles/${bundle.id}/generate`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail ?? "Generation failed"); }
      setItems((prev) => prev.map((i) => i.status === "pending" ? { ...i, status: "generating" } : i));
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed"); }
    finally { setGenerating(false); }
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const readyCount = items.filter((i) => i.status === "ready").length;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.30)", cursor: "pointer", padding: 2 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>{bundle.title}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={isPublic ? "badge badge--pos" : "badge badge--neutral"} style={{ fontSize: 10 }}>
            {isPublic ? "Public" : "Private"}
          </span>
          <button onClick={() => setIsPublic((v) => !v)} className="btn btn--sm">
            {isPublic ? "Make private" : "Make public"}
          </button>
        </div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input" style={{ resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ maxWidth: 200 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>Resale price (USD · 0 = free)</label>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
            </div>
          </div>
        </div>
        <div><button onClick={save} disabled={saving} className="btn btn--primary btn--sm">{saving ? "Saving…" : "Save changes"}</button></div>

        {/* Items */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)" }}>
              Items <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.25)" }}>({readyCount}/{items.length} ready)</span>
            </p>
            {pendingCount > 0 && (
              <button onClick={generate} disabled={generating} className="btn btn--sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {generating ? <span style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.30)", borderTopColor: "rgba(255,255,255,0.70)", display: "inline-block", animation: "spin-slow 0.7s linear infinite" }} /> : (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v4l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M10.5 6a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/></svg>
                )}
                Generate {pendingCount}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>({pendingCount} credit{pendingCount !== 1 ? "s" : ""})</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => (
              <div key={item.id} className="act-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.topic}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>{item.clone_name}</p>
                </div>
                <div className="act-row__meta">
                  <StatusChip status={item.status} />
                  <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.20)", cursor: "pointer", padding: 2, flexShrink: 0 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.60)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.20)"; }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "6px 0" }}>No items yet. Add a clone + topic below.</p>}
          </div>

          {/* Add item row */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <select
              value={selectedClone}
              onChange={(e) => setSelectedClone(e.target.value)}
              className="input"
              style={{ width: 160, flexShrink: 0 }}
            >
              <option value="">Pick clone…</option>
              {clones.map((c) => (
                <option key={c.clone_id} value={c.clone_id}>{c.display_name}</option>
              ))}
            </select>
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
              placeholder="Topic to brief on…"
              className="input"
              style={{ flex: 1 }}
            />
            <button onClick={addItem} disabled={!selectedClone || !newTopic.trim()} className="btn btn--sm">Add</button>
          </div>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)" }}>
            <p style={{ fontSize: 12, color: "rgba(248,113,113,0.80)" }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator bundles tab
// ---------------------------------------------------------------------------
function CreatorBundlesTab({ cloneHandle, onEdit, editing }: {
  cloneHandle: string;
  onEdit: (id: string | null) => void;
  editing: string | null;
}) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clones/${cloneHandle}/bundles`);
      const d = await res.json();
      setBundles(d.bundles ?? []);
    } finally { setLoading(false); }
  }, [cloneHandle]);

  useEffect(() => { fetchBundles(); }, [fetchBundles]);

  async function createBundle() {
    if (!newTitle.trim()) return;
    setCreateError(null);
    const res = await fetch(`/api/clones/${cloneHandle}/bundles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setCreateError(d.detail ?? "Create failed"); return; }
    setBundles((prev) => [{ ...d, queries_included: d.queries_included ?? 0, clone_count: 0 }, ...prev]);
    onEdit(d.id);
    setNewTitle(""); setCreating(false);
  }

  const editingBundle = bundles.find((b) => b.id === editing);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!editing && !creating && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setCreating(true)} className="btn btn--primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            New bundle
          </button>
        </div>
      )}

      {creating && (
        <div className="card">
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.60)", marginBottom: 12 }}>New bundle</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createBundle(); }}
              placeholder="e.g. My Complete Fundraising Playbook" autoFocus className="input" style={{ flex: 1 }} />
            <button onClick={createBundle} disabled={!newTitle.trim()} className="btn btn--primary">Create</button>
            <button onClick={() => { setCreating(false); setNewTitle(""); }} className="btn">Cancel</button>
          </div>
          {createError && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.60)", marginTop: 8 }}>{createError}</p>}
        </div>
      )}

      {editing && editingBundle && (
        <BundleEditor bundle={editingBundle} onRefresh={fetchBundles} onClose={() => onEdit(null)} />
      )}

      {!editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <LoadingSpinner />}
          {!loading && bundles.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.25)" }}>
              <p style={{ fontSize: 13 }}>No bundles yet.</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Create your first knowledge bundle above.</p>
            </div>
          )}
          {bundles.map((b) => (
            <div key={b.id} className="act-row" style={{ cursor: "pointer", padding: "14px 20px", borderRadius: 14 }} onClick={() => onEdit(b.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</p>
                  <span className={b.is_published ? "badge badge--pos" : "badge badge--neutral"} style={{ fontSize: 10, flexShrink: 0 }}>
                    {b.is_published ? "Live" : "Draft"}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
                  {b.clone_count ?? 0} clone{(b.clone_count ?? 0) !== 1 ? "s" : ""} · {b.queries_included ?? 0} queries
                  {Number(b.price_usd) > 0 ? ` · $${Number(b.price_usd).toFixed(2)}` : " · Free"}
                </p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consumer bundles tab
// ---------------------------------------------------------------------------
function ConsumerBundlesTab({ onEdit, editing }: {
  onEdit: (id: string | null) => void;
  editing: string | null;
}) {
  const [bundles, setBundles] = useState<ConsumerBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/consumer-bundles");
      const d = await res.json();
      setBundles(d.bundles ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBundles(); }, [fetchBundles]);

  async function createBundle() {
    if (!newTitle.trim()) return;
    setCreateError(null);
    const res = await fetch("/api/consumer-bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setCreateError(d.detail ?? "Create failed"); return; }
    setBundles((prev) => [d, ...prev]);
    onEdit(d.id);
    setNewTitle(""); setCreating(false);
  }

  const editingBundle = bundles.find((b) => b.id === editing);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: "12px 16px", background: "rgba(52,168,83,0.05)", borderColor: "rgba(52,168,83,0.15)" }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
          Curate your own briefing pack from any clones on the marketplace. Each item costs 1 credit to generate. Publish publicly or keep it private. Set a price to resell it.
        </p>
      </div>

      {!editing && !creating && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setCreating(true)} className="btn btn--primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            New bundle
          </button>
        </div>
      )}

      {creating && (
        <div className="card">
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.60)", marginBottom: 12 }}>New bundle</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createBundle(); }}
              placeholder="e.g. My Fundraising Research Pack" autoFocus className="input" style={{ flex: 1 }} />
            <button onClick={createBundle} disabled={!newTitle.trim()} className="btn btn--primary">Create</button>
            <button onClick={() => { setCreating(false); setNewTitle(""); }} className="btn">Cancel</button>
          </div>
          {createError && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.60)", marginTop: 8 }}>{createError}</p>}
        </div>
      )}

      {editing && editingBundle && (
        <ConsumerBundleEditor bundle={editingBundle} onRefresh={fetchBundles} onClose={() => onEdit(null)} />
      )}

      {!editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <LoadingSpinner />}
          {!loading && bundles.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.25)" }}>
              <p style={{ fontSize: 13 }}>No bundles yet.</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Create a bundle to query multiple clones on a topic.</p>
            </div>
          )}
          {bundles.map((b) => (
            <div key={b.id} className="act-row" style={{ cursor: "pointer", padding: "14px 20px", borderRadius: 14 }} onClick={() => onEdit(b.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</p>
                  <span className={b.is_public ? "badge badge--pos" : "badge badge--neutral"} style={{ fontSize: 10, flexShrink: 0 }}>
                    {b.is_public ? "Public" : "Private"}
                  </span>
                  {Number(b.price_usd) > 0 && (
                    <span className="badge badge--warn" style={{ fontSize: 10, flexShrink: 0 }}>${Number(b.price_usd).toFixed(2)}</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
                  {b.ready_count}/{b.item_count} items ready
                </p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BundlesPage() {
  const { clone, isLoading } = useClone();
  const [tab, setTab] = useState<"creator" | "consumer">("creator");
  const [creatorEditing, setCreatorEditing] = useState<string | null>(null);
  const [consumerEditing, setConsumerEditing] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="db-page" style={{ "--page-accent": "#34A853" } as React.CSSProperties}>
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Marketplace</p>
          <h1 className="db-h1">Bundles</h1>
        </div>
        <a
          href="/marketplace?tab=bundles"
          className="btn btn--sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 2h8v8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          View on Marketplace
        </a>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, padding: 4, background: "rgba(255,255,255,0.04)", borderRadius: 14, width: "fit-content", marginBottom: 4 }}>
        {(["creator", "consumer"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 13, fontFamily: "inherit", fontWeight: 500, transition: "all 180ms",
              background: tab === t ? "rgba(255,255,255,0.09)" : "transparent",
              color: tab === t ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
            }}
          >
            {t === "creator" ? "My bundles" : "Consumer bundles"}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 680 }}>
        {tab === "creator" ? (
          clone ? (
            <CreatorBundlesTab
              cloneHandle={clone.handle}
              onEdit={setCreatorEditing}
              editing={creatorEditing}
            />
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
              Create your clone first to package your knowledge into bundles.{" "}
              <a href="/onboarding" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>Get started →</a>
            </p>
          )
        ) : (
          <ConsumerBundlesTab onEdit={setConsumerEditing} editing={consumerEditing} />
        )}
      </div>
    </div>
  );
}
