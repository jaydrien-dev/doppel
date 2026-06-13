"use client";

import { useEffect, useState } from "react";

type Tier = "free" | "personal" | "enterprise_pro" | "enterprise_max";

// ---------------------------------------------------------------------------
// Grant Credits panel
// ---------------------------------------------------------------------------
function GrantCreditsPanel({ prefillUserId, onGranted }: { prefillUserId?: string; onGranted?: () => void }) {
  const [userId, setUserId] = useState(prefillUserId ?? "");
  const [credits, setCredits] = useState("");
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefillUserId) setUserId(prefillUserId);
  }, [prefillUserId]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(credits, 10);
    if (!userId.trim() || isNaN(amt) || amt <= 0) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/credits/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId.trim(), credits: amt }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ ok: true, msg: `Granted ${amt} credits. New balance: ${data.new_balance}` });
        setCredits("");
      } else {
        setStatus({ ok: false, msg: data.detail ?? data.error ?? `Error ${res.status}` });
      }
    } catch (e) {
      setStatus({ ok: false, msg: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <p className="card-title">Grant credits</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
        Add credits to any user&apos;s account directly.
      </p>
      <form onSubmit={grant} style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>User ID</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user_xxxxxxxxxxxxxxxxxxxx"
            className="input"
            style={{ width: 260, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Credits</label>
          <input
            type="number"
            min={1}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            placeholder="100"
            className="input"
            style={{ width: 100 }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !userId.trim() || !credits}
          className="btn btn--primary"
        >
          {loading ? "Granting…" : "Grant"}
        </button>
        {status && (
          <p style={{ fontSize: 12, color: status.ok ? "#34D399" : "#F87171", margin: 0 }}>
            {status.msg}
          </p>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help Clone panel
// ---------------------------------------------------------------------------
function HelpClonePanel() {
  const [handle, setHandle] = useState("");
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);
  const [loading, setLoading] = useState<"set" | "remove" | "fetch" | null>(null);

  // Load current help clone on mount
  useEffect(() => {
    setLoading("fetch");
    fetch("/api/help/clone")
      .then((r) => r.json())
      .then((data) => {
        if (data.clone) setCurrentHandle(data.clone.handle);
      })
      .catch(() => {})
      .finally(() => setLoading(null));
  }, []);

  async function act(action: "set" | "remove") {
    const h = action === "set" ? handle.trim() : (currentHandle ?? handle.trim());
    if (!h) return;
    setLoading(action);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/help-clone/${h}`, {
        method: action === "set" ? "POST" : "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ ok: true, msg: action === "set" ? `@${h} is now the help clone` : `Help clone removed` });
        setCurrentHandle(action === "set" ? h : null);
        setHandle("");
      } else {
        setStatus({ ok: false, msg: data.detail ?? data.error ?? `Error ${res.status}` });
      }
    } catch (e) {
      setStatus({ ok: false, msg: String(e) });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <p className="card-title">Help clone</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
        The help widget on every page will chat using this clone. Only you can set it.
        {currentHandle && (
          <span style={{ color: "rgba(52,211,153,0.70)", marginLeft: 6 }}>
            Currently: @{currentHandle}
          </span>
        )}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Clone handle</label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={currentHandle ?? "your-handle"}
            className="input"
            style={{ width: 200, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}
          />
        </div>
        <button
          onClick={() => act("set")}
          disabled={loading !== null || !handle.trim()}
          className="btn"
          style={{ color: "rgba(52,211,153,0.70)", borderColor: "rgba(52,211,153,0.15)" }}
        >
          {loading === "set" ? "Setting…" : "Set as help clone"}
        </button>
        {currentHandle && (
          <button
            onClick={() => act("remove")}
            disabled={loading !== null}
            className="btn"
            style={{ color: "rgba(248,113,113,0.60)", borderColor: "rgba(248,113,113,0.15)" }}
          >
            {loading === "remove" ? "Removing…" : "Remove"}
          </button>
        )}
        {status && (
          <p style={{ fontSize: 12, color: status.ok ? "rgba(52,211,153,0.70)" : "rgba(248,113,113,0.60)", margin: 0 }}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verify Clone panel
// ---------------------------------------------------------------------------
function VerifyClonePanel() {
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);
  const [loading, setLoading] = useState<"verify" | "revoke" | null>(null);

  async function act(action: "verify" | "revoke") {
    if (!handle.trim()) return;
    setLoading(action);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/clones/${handle.trim()}/verify`, {
        method: action === "verify" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: action === "verify" ? JSON.stringify({ note }) : undefined,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ ok: true, msg: action === "verify" ? `Verified @${handle}` : `Revoked @${handle}` });
        setHandle(""); setNote("");
      } else {
        setStatus({ ok: false, msg: data.detail ?? data.error ?? `Error ${res.status}` });
      }
    } catch (e) {
      setStatus({ ok: false, msg: String(e) });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <p className="card-title">Verify clone</p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
        Grant or revoke the verified badge on a marketplace clone.
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Clone handle</label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="jane-smith"
            className="input"
            style={{ width: 180, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Verified personal knowledge"
            className="input"
            style={{ width: 220 }}
          />
        </div>
        <button
          onClick={() => act("verify")}
          disabled={loading !== null || !handle.trim()}
          className="btn"
          style={{ color: "rgba(52,211,153,0.70)", borderColor: "rgba(52,211,153,0.15)" }}
        >
          {loading === "verify" ? "Verifying…" : "Verify"}
        </button>
        <button
          onClick={() => act("revoke")}
          disabled={loading !== null || !handle.trim()}
          className="btn"
          style={{ color: "rgba(248,113,113,0.60)", borderColor: "rgba(248,113,113,0.15)" }}
        >
          {loading === "revoke" ? "Revoking…" : "Revoke"}
        </button>
        {status && (
          <p style={{ fontSize: 12, color: status.ok ? "rgba(52,211,153,0.70)" : "rgba(248,113,113,0.60)", margin: 0 }}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}

interface UserRow {
  user_id: string;
  display_name: string;
  handle: string;
  subscription_tier: Tier;
  stripe_customer_id?: string;
  created_at: string | null;
  clerk_name: string | null;
  clerk_email: string | null;
  credits_remaining: number;
}

const TIERS: Tier[] = ["free", "personal", "enterprise_pro", "enterprise_max"];

const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Ent. Pro",
  enterprise_max: "Ent. Max",
};

function tierBadge(tier: Tier) {
  if (tier === "free") return <span className="badge badge--neutral">{TIER_LABELS[tier]}</span>;
  if (tier === "personal") return <span className="badge badge--pos"><span className="badge__dot" />{TIER_LABELS[tier]}</span>;
  return <span className="badge badge--ent"><span className="badge__dot" />{TIER_LABELS[tier]}</span>;
}

export default function AdminPage() {
  return <AdminContent />;
}

function AdminContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [prefillUserId, setPrefillUserId] = useState<string | undefined>(undefined);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users?limit=200");
      const data = await res.json();
      if (!res.ok) {
        const backend = data._backend ? ` [backend: ${data._backend}]` : "";
        setError(`${res.status}: ${data.detail ?? data.error ?? JSON.stringify(data)}${backend}`);
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setTier(userId: string, tier: Tier) {
    setUpdating(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.user_id === userId ? { ...u, subscription_tier: tier } : u))
        );
      } else {
        setError(`Plan update failed: ${data.detail ?? data.error ?? res.status}`);
      }
    } catch (e) {
      setError(`Plan update failed: ${String(e)}`);
    } finally {
      setUpdating(null);
    }
  }

  const q = search.toLowerCase();
  const filtered = users.filter(
    (u) =>
      (u.clerk_name ?? u.display_name).toLowerCase().includes(q) ||
      (u.clerk_email ?? "").toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(q) ||
      u.user_id.toLowerCase().includes(q)
  );

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Developer</p>
          <h1 className="db-h1">Admin</h1>
        </div>
      </div>

      <GrantCreditsPanel prefillUserId={prefillUserId} onGranted={load} />
      <HelpClonePanel />
      <VerifyClonePanel />

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, handle, or user ID…"
          className="input"
          style={{ maxWidth: 380 }}
        />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "rgba(248,113,113,0.60)", fontFamily: "ui-monospace, Menlo, monospace", margin: "0 0 12px" }}>{error}</p>
            <button onClick={load} className="btn btn--ghost btn--sm">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.25)" }}>No users found.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["User", "Handle", "Plan", "Credits", "Joined", ""].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 20px",
                    fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
                    fontWeight: 500, color: "rgba(255,255,255,0.25)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr
                  key={u.user_id}
                  style={{
                    borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    transition: "background 180ms",
                    cursor: "pointer",
                  }}
                  onClick={() => setPrefillUserId(u.user_id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px 20px" }}>
                    <p style={{ color: "rgba(255,255,255,0.70)", margin: "0 0 2px" }}>{u.clerk_name ?? u.display_name}</p>
                    {u.clerk_email && (
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 2px" }}>{u.clerk_email}</p>
                    )}
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "ui-monospace, Menlo, monospace", margin: 0, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.user_id}
                    </p>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <p style={{ color: "rgba(255,255,255,0.40)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, margin: "0 0 2px" }}>@{u.handle}</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>{u.display_name}</p>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    {tierBadge(u.subscription_tier)}
                  </td>
                  <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {u.credits_remaining.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 20px", color: "rgba(255,255,255,0.30)", fontSize: 12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "12px 20px" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      {TIERS.filter((t) => t !== u.subscription_tier).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTier(u.user_id, t)}
                          disabled={updating === u.user_id}
                          className="btn btn--ghost btn--sm"
                        >
                          {updating === u.user_id ? "…" : `→ ${TIER_LABELS[t]}`}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.20)" }}>
        {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </p>
    </div>
  );
}
