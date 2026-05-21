"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { motion } from "framer-motion";

interface CloneInfo {
  clone_id: string;
  display_name: string;
  handle: string;
  category: string | null;
  avatar_url: string | null;
  listing_description: string | null;
  is_verified: boolean;
  access_mode: string;
}

const CAT_COLOR: Record<string, string> = {
  business: "#1A73E8", engineering: "#7B1FA2", design: "#E91E63",
  marketing: "#F57C00", finance: "#2E7D32", legal: "#546E7A",
  healthcare: "#C2185B", education: "#F9A825", science: "#00838F", other: "#8E24AA",
};
function catColor(c: string | null) { return CAT_COLOR[c ?? "other"] ?? "#8E24AA"; }

// ---------------------------------------------------------------------------
// DoppelMark
// ---------------------------------------------------------------------------
function DoppelMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="21" height="21" rx="6.5"
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.14)" />
      <circle cx="8.88" cy="8.88" r="4.65" fill="rgba(255,255,255,0.95)" />
      <circle cx="13.96" cy="13.96" r="3.80" fill="rgba(167,139,250,0.70)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AddClonePage() {
  const params = useParams();
  const handle = params.handle as string;
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  const [clone, setClone] = useState<CloneInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error">("idle");

  // Load clone info
  useEffect(() => {
    fetch(`/api/marketplace/${handle}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setClone(d); })
      .catch(() => setNotFound(true));
  }, [handle]);

  // If not signed in, redirect to sign-in with return URL
  function handleAdd() {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=/add/${handle}`);
      return;
    }
    setStatus("adding");
    fetch(`/api/clones/${handle}/add`, { method: "POST" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => {
        setStatus("added");
        setTimeout(() => router.push("/home"), 1200);
      })
      .catch(() => setStatus("error"));
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <Bg />
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>Clone not found.</p>
          <Link href="/marketplace" style={ghostLinkStyle}>Browse marketplace →</Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (!clone) {
    return (
      <div style={pageStyle}>
        <Bg />
        <div style={{ ...cardStyle, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.30)", animation: "pulse-glow 1.4s ease-in-out infinite" }} />
        </div>
        <Footer />
      </div>
    );
  }

  const color = catColor(clone.category);
  const initial = clone.display_name[0]?.toUpperCase() ?? "?";
  const isPrivate = clone.access_mode === "private";

  return (
    <div style={pageStyle}>
      <Bg color={color} />

      {/* Nav */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10, padding: "16px 24px", display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <DoppelMark />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.85)" }}>doppel</span>
        </Link>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={cardStyle}
      >
        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, flexShrink: 0,
            background: clone.avatar_url ? "transparent" : color,
            border: `1.5px solid ${color}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 500, color: "#fff",
            overflow: "hidden",
            boxShadow: `0 12px 40px ${color}30`,
          }}>
            {clone.avatar_url
              ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initial}
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.93)", margin: 0, letterSpacing: "-0.01em" }}>
                {clone.display_name}
              </h1>
              {clone.is_verified && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999,
                  background: "rgba(52,211,153,0.12)", color: "#34D399",
                  border: "1px solid rgba(52,211,153,0.22)",
                }}>
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Verified
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", margin: "4px 0 0" }}>@{clone.handle}</p>
          </div>
        </div>

        {/* Description */}
        {clone.listing_description && (
          <p style={{
            fontSize: 14, color: "rgba(255,255,255,0.62)", lineHeight: 1.6,
            textAlign: "center", margin: "0 0 24px", maxWidth: 320,
          }}>
            {clone.listing_description}
          </p>
        )}

        {/* Divider */}
        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.08)", margin: "0 0 24px" }} />

        {/* Invite context */}
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", textAlign: "center", margin: "0 0 20px", lineHeight: 1.55 }}>
          {isPrivate
            ? "This clone is private and can't be added."
            : "Add this clone to your messages to start a conversation anytime."}
        </p>

        {/* CTA */}
        {!isPrivate && (
          status === "added" ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "12px 24px", borderRadius: 14,
                background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.28)",
                color: "#34D399", fontSize: 14, fontWeight: 500,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5 6.5-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Added — taking you home
            </motion.div>
          ) : (
            <button
              onClick={handleAdd}
              disabled={status === "adding"}
              style={{
                width: "100%", padding: "13px 24px", borderRadius: 14,
                background: status === "adding" ? "rgba(255,255,255,0.07)" : `linear-gradient(135deg, ${color}, ${color}cc)`,
                border: "none", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: status === "adding" ? "not-allowed" : "pointer",
                fontFamily: "inherit", letterSpacing: "-0.01em",
                boxShadow: status === "adding" ? "none" : `0 4px 20px ${color}40`,
                transition: "all 200ms ease",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {status === "adding" ? (
                <>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />
                  Adding…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  {isSignedIn ? `Add ${clone.display_name}` : "Sign in to add"}
                </>
              )}
            </button>
          )
        )}

        {status === "error" && (
          <p style={{ fontSize: 12, color: "#F87171", textAlign: "center", marginTop: 12 }}>
            Something went wrong. Try again.
          </p>
        )}

        {/* Secondary links */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 20 }}>
          <Link href={`/marketplace/${clone.handle}`} style={ghostLinkStyle}>View profile</Link>
          <Link href="/marketplace" style={ghostLinkStyle}>Browse all</Link>
        </div>
      </motion.div>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient background
// ---------------------------------------------------------------------------
function Bg({ color }: { color?: string }) {
  return (
    <>
      <div style={{
        position: "fixed", inset: 0, background: "#080808", zIndex: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }} />
      <div style={{
        position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)",
        width: 480, height: 480, borderRadius: "50%",
        background: color ? `${color}18` : "rgba(26,115,232,0.12)",
        filter: "blur(100px)", pointerEvents: "none", zIndex: 0,
      }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function Footer() {
  return (
    <div style={{ position: "fixed", bottom: 24, left: 0, right: 0, textAlign: "center", zIndex: 10 }}>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", margin: 0 }}>
        Powered by{" "}
        <span style={{ color: "rgba(255,255,255,0.38)", fontWeight: 500 }}>doppel</span>
        {" · "}
        <a href="/sign-up" style={{ color: "rgba(255,255,255,0.38)", textDecoration: "none" }}>
          Create your own →
        </a>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------
const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  padding: "80px 16px 64px",
  fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
  position: "relative",
};

const cardStyle: React.CSSProperties = {
  position: "relative", zIndex: 1,
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 24,
  padding: "32px 28px",
  width: "100%", maxWidth: 400,
  display: "flex", flexDirection: "column", alignItems: "center",
};

const ghostLinkStyle: React.CSSProperties = {
  fontSize: 12, color: "rgba(255,255,255,0.35)",
  textDecoration: "none",
  transition: "color 150ms",
};
