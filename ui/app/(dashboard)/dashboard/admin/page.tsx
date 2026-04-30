"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Tier = "free" | "personal" | "enterprise_pro" | "enterprise_max";

interface UserRow {
  user_id: string;
  display_name: string;
  handle: string;
  subscription_tier: Tier;
  stripe_customer_id?: string;
  created_at: string | null;
  clerk_name: string | null;
  clerk_email: string | null;
}

const TIERS: Tier[] = ["free", "personal", "enterprise_pro", "enterprise_max"];

const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Ent. Pro",
  enterprise_max: "Ent. Max",
};

const TIER_COLORS: Record<Tier, string> = {
  free: "text-white/30 bg-white/[0.05] border-white/[0.06]",
  personal: "text-emerald-400/60 bg-emerald-400/[0.07] border-emerald-400/[0.12]",
  enterprise_pro: "text-violet-400/60 bg-violet-400/[0.07] border-violet-400/[0.12]",
  enterprise_max: "text-violet-400/70 bg-violet-400/[0.09] border-violet-400/[0.15]",
};

export default function AdminPage() {
  return <AdminContent />;
}

function AdminContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?limit=200");
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setTier(userId: string, tier: Tier) {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.user_id === userId ? { ...u, subscription_tier: tier } : u))
        );
      }
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
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-1">Developer</p>
        <h1 className="text-2xl font-light text-white/85">Admin</h1>
        <p className="text-sm text-white/35 mt-1">Manage user plans directly.</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, handle, or user ID…"
          className="w-full max-w-md bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20"
        />
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/25">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/25">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-white/25 font-medium">User</th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-white/25 font-medium">Handle</th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-white/25 font-medium">Plan</th>
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-white/25 font-medium">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr
                  key={u.user_id}
                  className={`${i !== filtered.length - 1 ? "border-b border-white/[0.04]" : ""} hover:bg-white/[0.02] transition-colors`}
                >
                  <td className="px-5 py-3">
                    <p className="text-white/70">{u.clerk_name ?? u.display_name}</p>
                    {u.clerk_email && (
                      <p className="text-xs text-white/35 mt-0.5">{u.clerk_email}</p>
                    )}
                    <p className="text-[10px] text-white/20 font-mono mt-0.5 truncate max-w-[180px]">{u.user_id}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-white/40 font-mono text-xs">@{u.handle}</p>
                    <p className="text-[11px] text-white/25 mt-0.5">{u.display_name}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs border rounded-full px-2 py-0.5 ${TIER_COLORS[u.subscription_tier]}`}>
                      {TIER_LABELS[u.subscription_tier] ?? u.subscription_tier}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/30 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      {TIERS.filter((t) => t !== u.subscription_tier).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTier(u.user_id, t)}
                          disabled={updating === u.user_id}
                          className="glass hover:glass-md rounded-lg px-2.5 py-1 text-xs text-white/40 hover:text-white/70 transition-all disabled:opacity-30 capitalize"
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

      <p className="mt-3 text-xs text-white/20">
        {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </p>
    </div>
  );
}
