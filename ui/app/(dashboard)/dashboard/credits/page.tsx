"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BalanceData {
  plan_credits: number;
  bought_credits: number;
  weekly_allowance: number;
  total: number;
}

interface Pack {
  id: string;
  credits: number;
  price_usd: number;
  label: string;
}

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Pro",
  enterprise_max: "Max",
};

const TIER_ALLOWANCE: Record<string, number> = {
  free: 50,
  personal: 100,
  enterprise_pro: 500,
  enterprise_max: 2000,
};

function SuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)",
      borderRadius: 12, padding: "12px 16px", marginBottom: 24,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.4)"/>
        <path d="M5 8l2.5 2.5L11 5" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ fontSize: 13, color: "rgba(52,211,153,0.85)" }}>Credits added to your account.</span>
      <button onClick={onDismiss} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 0 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

function CreditsContent() {
  const searchParams = useSearchParams();
  const [success, setSuccess] = useState(searchParams.get("success") === "1");
  const [buying, setBuying] = useState<string | null>(null);

  const { data: balanceData, mutate: mutateBalance, isLoading: balanceLoading } = useSWR<BalanceData>(
    "/api/credits/balance",
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: packsData } = useSWR<{ packs: Pack[] }>(
    "/api/credits/packs",
    fetcher,
    { revalidateOnFocus: false }
  );

  const balance = balanceData?.total ?? 0;
  const planCredits = balanceData?.plan_credits ?? 0;
  const boughtCredits = balanceData?.bought_credits ?? 0;
  const weeklyAllowance = balanceData?.weekly_allowance ?? 0;
  const packs = packsData?.packs ?? [];

  async function buyPack(packId: string) {
    setBuying(packId);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch {
      // silent — user stays on page
    } finally {
      setBuying(null);
    }
  }

  const planPercent = weeklyAllowance > 0 ? Math.min(100, Math.round((planCredits / weeklyAllowance) * 100)) : 0;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "40px 24px" }}>
      {success && <SuccessBanner onDismiss={() => setSuccess(false)} />}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>
          Account
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.85)" }}>Credits</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          Credits are consumed when your clone answers queries. Top up anytime.
        </p>
      </div>

      {/* Balance overview */}
      <div style={{
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18, padding: "24px 24px 20px", marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total balance</p>
            {balanceLoading ? (
              <div style={{ width: 80, height: 40, background: "rgba(255,255,255,0.04)", borderRadius: 8 }} />
            ) : (
              <p style={{ fontSize: 42, fontWeight: 300, color: "rgba(255,255,255,0.90)", lineHeight: 1 }}>
                {balance.toLocaleString()}
              </p>
            )}
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", paddingBottom: 6 }}>credits remaining</p>
        </div>

        {/* Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "14px 16px",
          }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Weekly plan</p>
            <p style={{ fontSize: 22, fontWeight: 400, color: "rgba(255,255,255,0.80)" }}>{planCredits.toLocaleString()}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginTop: 3 }}>of {weeklyAllowance.toLocaleString()} / week</p>
            {weeklyAllowance > 0 && (
              <div style={{ marginTop: 10, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 999 }}>
                <div style={{ width: `${planPercent}%`, height: "100%", background: "rgba(107,174,255,0.7)", borderRadius: 999, transition: "width 0.4s ease" }} />
              </div>
            )}
          </div>

          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "14px 16px",
          }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Top-up credits</p>
            <p style={{ fontSize: 22, fontWeight: 400, color: "rgba(255,255,255,0.80)" }}>{boughtCredits.toLocaleString()}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginTop: 3 }}>purchased, no expiry</p>
          </div>
        </div>

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 14 }}>
          1 credit ≈ 1 query. Plan credits reset weekly. Top-up credits never expire.
        </p>
      </div>

      {/* Top-up packs */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, fontWeight: 500 }}>Top up</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(packs.length > 0 ? packs : [
            { id: "pack_100",  credits: 100,  price_usd: 5,  label: "Starter" },
            { id: "pack_500",  credits: 500,  price_usd: 23, label: "Standard" },
            { id: "pack_1000", credits: 1000, price_usd: 44, label: "Pro" },
          ] as Pack[]).map((pack) => (
            <div key={pack.id} style={{
              display: "flex", alignItems: "center", gap: 14,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14, padding: "14px 16px",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.80)" }}>{pack.credits.toLocaleString()} credits</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{pack.label}</span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                  ${(pack.price_usd / pack.credits * 100).toFixed(1)}¢ per credit
                </p>
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.70)", marginRight: 4 }}>
                ${pack.price_usd}
              </span>
              <button
                onClick={() => buyPack(pack.id)}
                disabled={buying === pack.id}
                style={{
                  fontSize: 12, padding: "8px 18px", borderRadius: 10,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit",
                  opacity: buying === pack.id ? 0.5 : 1, transition: "all 160ms", flexShrink: 0,
                }}
                onMouseEnter={(e) => { if (buying !== pack.id) { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; e.currentTarget.style.color = "rgba(255,255,255,0.92)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
              >
                {buying === pack.id ? "Redirecting…" : "Buy"}
              </button>
            </div>
          ))
        }
        </div>
      </div>

      {/* Plan note */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 12, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/>
          <path d="M8 7v4M8 5.5v.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
          Upgrade your plan to get more weekly credits.{" "}
          <a href="/dashboard/billing" style={{ color: "rgba(255,255,255,0.45)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            View plans →
          </a>
        </p>
      </div>
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading…</div>}>
      <CreditsContent />
    </Suspense>
  );
}
