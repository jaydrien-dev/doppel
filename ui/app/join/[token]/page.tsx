"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

interface OrgInfo {
  org_id: string;
  name: string;
  slug: string;
  member_count: number;
}

export default function JoinOrgPage() {
  const { token } = useParams<{ token: string }>();
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/org/by-token/${token}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setOrg)
      .catch(() => setLoadErr(true));
  }, [token]);

  async function handleJoin() {
    if (!isSignedIn || !token) return;
    setJoining(true); setErr(null);
    try {
      const res = await fetch("/api/org/join-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "Failed to join");
      setJoined(true);
      setTimeout(() => router.push("/org"), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
    }}>
      {/* Brand */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", marginBottom: 40 }}>
        <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
          <rect x="0.5" y="0.5" width="21" height="21" rx="6.5" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" />
          <circle cx="8.88" cy="8.88" r="4.65" fill="rgba(255,255,255,0.80)" />
          <circle cx="13.96" cy="13.96" r="3.80" fill="rgba(255,255,255,0.35)" />
        </svg>
        <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.02em" }}>doppel</span>
      </Link>

      <div style={{
        width: "100%", maxWidth: 400,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 20, padding: "36px 32px",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 0,
      }}>
        {!isLoaded || (!org && !loadErr) ? (
          /* Loading */
          <div style={{ padding: "24px 0" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", margin: "0 auto",
              border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.45)",
              animation: "join-spin 0.8s linear infinite",
            }} />
          </div>
        ) : loadErr ? (
          /* Invalid link */
          <>
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 20,
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7.5" stroke="rgba(248,113,113,0.70)" strokeWidth="1.4"/>
                <path d="M6 6l6 6M12 6l-6 6" stroke="rgba(248,113,113,0.70)" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.70)", marginBottom: 8 }}>Invalid invite link</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
              This link may have been revoked or doesn&apos;t exist. Ask your admin for a new one.
            </p>
          </>
        ) : joined ? (
          /* Joined */
          <>
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 20,
              background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7.5" stroke="rgba(52,211,153,0.70)" strokeWidth="1.4"/>
                <path d="M5.5 9l3 3 4-5" stroke="rgba(52,211,153,0.70)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>You&apos;ve joined {org!.name}</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Redirecting…</p>
          </>
        ) : (
          /* Main join card */
          <>
            {/* Org avatar */}
            <div style={{
              width: 52, height: 52, borderRadius: 14, marginBottom: 20,
              background: "rgba(26,115,232,0.10)", border: "1px solid rgba(26,115,232,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 500, color: "rgba(107,174,255,0.80)",
            }}>
              {org!.name.charAt(0).toUpperCase()}
            </div>

            <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
              You&apos;re invited to join
            </p>
            <p style={{ fontSize: 22, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6, letterSpacing: "-0.01em" }}>
              {org!.name}
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 28 }}>
              {org!.member_count} member{org!.member_count !== 1 ? "s" : ""}
            </p>

            {!isSignedIn ? (
              <SignInButton mode="modal" forceRedirectUrl={`/join/${token}`}>
                <button style={{
                  width: "100%", padding: "11px 0", borderRadius: 12, fontSize: 14, fontWeight: 500,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,255,255,0.80)", cursor: "pointer", fontFamily: "inherit",
                  transition: "all 150ms",
                }}>
                  Sign in to join
                </button>
              </SignInButton>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 12, fontSize: 14, fontWeight: 500,
                  background: joining ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: joining ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.80)",
                  cursor: joining ? "not-allowed" : "pointer", fontFamily: "inherit",
                  transition: "all 150ms",
                }}
              >
                {joining ? "Joining…" : `Join ${org!.name}`}
              </button>
            )}

            {err && (
              <p style={{ fontSize: 12, color: "rgba(248,113,113,0.75)", marginTop: 12 }}>{err}</p>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes join-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
