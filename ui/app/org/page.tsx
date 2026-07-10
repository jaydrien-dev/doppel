"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { motion, useInView } from "framer-motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OrgClone {
  clone_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  category: string | null;
  description: string;
  price_per_query: number;
  total_queries: number;
  is_verified: boolean;
  member_role: "admin" | "member";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CAT_COLOR: Record<string, string> = {
  business: "#1A73E8", engineering: "#7B1FA2", design: "#E91E63",
  marketing: "#F57C00", finance: "#2E7D32", legal: "#546E7A",
  healthcare: "#C2185B", education: "#F9A825", science: "#00838F", other: "#8E24AA",
};
function catColor(c: string | null) { return CAT_COLOR[c ?? "other"] ?? "#8E24AA"; }

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// 3D Tilt Clone Card
// ---------------------------------------------------------------------------
function CloneCard({ clone, index }: { clone: OrgClone; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const color = catColor(clone.category);
  const initial = clone.display_name[0]?.toUpperCase() ?? "?";

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;   // 0→1
    const ny = (e.clientY - rect.top) / rect.height;   // 0→1
    setMousePos({ x: nx, y: ny });
    setTilt({
      x: (ny - 0.5) * -18,  // tilt up/down
      y: (nx - 0.5) * 18,   // tilt left/right
    });
  }

  function onMouseLeave() {
    setHovered(false);
    setTilt({ x: 0, y: 0 });
    setMousePos({ x: 0.5, y: 0.5 });
  }

  const shimmerX = mousePos.x * 100;
  const shimmerY = mousePos.y * 100;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: "1000px" }}
    >
      <div
        onMouseMove={onMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={onMouseLeave}
        style={{
          position: "relative",
          borderRadius: 20,
          overflow: "hidden",
          background: "rgba(255,255,255,0.035)",
          border: `1px solid ${hovered ? hexToRgba(color, 0.35) : "rgba(255,255,255,0.08)"}`,
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${hovered ? 1.025 : 1})`,
          transformStyle: "preserve-3d",
          transition: hovered
            ? "transform 80ms linear, border-color 200ms ease, box-shadow 200ms ease"
            : "transform 500ms cubic-bezier(.22,1,.36,1), border-color 300ms ease, box-shadow 300ms ease",
          boxShadow: hovered
            ? `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${hexToRgba(color, 0.15)}`
            : "0 4px 20px rgba(0,0,0,0.25)",
          cursor: "default",
        }}
      >
        {/* Shimmer layer — follows mouse */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            opacity: hovered ? 1 : 0,
            background: `radial-gradient(circle at ${shimmerX}% ${shimmerY}%, ${hexToRgba(color, 0.18)} 0%, transparent 60%)`,
            transition: "opacity 200ms ease",
            zIndex: 1,
          }}
        />

        {/* Top color accent strip */}
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, ${hexToRgba(color, 0.9)}, ${hexToRgba(color, 0.3)})`,
          transform: "translateZ(2px)",
        }} />

        <div style={{ padding: "22px 22px 20px", position: "relative", zIndex: 2 }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            {/* Avatar */}
            <div style={{
              width: 52, height: 52, borderRadius: 16, flexShrink: 0,
              background: clone.avatar_url ? "transparent" : hexToRgba(color, 0.2),
              border: `1.5px solid ${hexToRgba(color, 0.4)}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 500, color: "#fff",
              overflow: "hidden",
              transform: "translateZ(8px)",
              boxShadow: `0 4px 16px ${hexToRgba(color, 0.25)}`,
            }}>
              {clone.avatar_url
                ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initial}
            </div>

            {/* Badges */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, transform: "translateZ(6px)" }}>
              {clone.is_verified && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 500, padding: "3px 8px",
                  borderRadius: 999, letterSpacing: "0.04em",
                  background: "rgba(52,211,153,0.10)",
                  border: "1px solid rgba(52,211,153,0.25)",
                  color: "rgba(52,211,153,0.85)",
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4l2 2 3-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Verified
                </span>
              )}
              {clone.member_role === "admin" && (
                <span style={{
                  fontSize: 10, fontWeight: 500, padding: "3px 8px",
                  borderRadius: 999, letterSpacing: "0.04em",
                  background: "rgba(167,139,250,0.10)",
                  border: "1px solid rgba(167,139,250,0.25)",
                  color: "rgba(167,139,250,0.80)",
                }}>
                  Admin
                </span>
              )}
              {clone.category && (
                <span style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 999,
                  background: hexToRgba(color, 0.10),
                  border: `1px solid ${hexToRgba(color, 0.22)}`,
                  color: hexToRgba(color, 0.80),
                  textTransform: "capitalize",
                }}>
                  {clone.category}
                </span>
              )}
            </div>
          </div>

          {/* Name + handle */}
          <div style={{ marginBottom: 10, transform: "translateZ(4px)" }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.90)", margin: 0, letterSpacing: "-0.01em" }}>
              {clone.display_name}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>
              @{clone.handle}
            </p>
          </div>

          {/* Description */}
          <p style={{
            fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6,
            margin: "0 0 18px", minHeight: 38,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
            transform: "translateZ(3px)",
          }}>
            {clone.description || "No description."}
          </p>

          {/* Stats row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            marginBottom: 18, transform: "translateZ(3px)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M1 9.5C1 7.3 2.8 5.5 5 5.5h2c2.2 0 4 1.8 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="6" cy="3" r="2" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {clone.total_queries.toLocaleString()} queries
            </span>
          </div>

        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 20, overflow: "hidden",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      padding: "22px 22px 20px",
    }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.06)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 12, width: "60%", borderRadius: 6, background: "rgba(255,255,255,0.06)", marginBottom: 8 }} />
          <div style={{ height: 10, width: "40%", borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
        </div>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.05)", marginBottom: 6 }} />
      <div style={{ height: 10, width: "75%", borderRadius: 6, background: "rgba(255,255,255,0.04)", marginBottom: 20 }} />
      <div style={{ height: 36, borderRadius: 12, background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyOrg() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ textAlign: "center", padding: "80px 40px" }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: 20, margin: "0 auto 20px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
          <path d="M3 21c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="17" cy="7" r="3" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        </svg>
      </div>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.50)", fontWeight: 500, marginBottom: 8 }}>
        No org clones yet
      </p>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
        Your org admin hasn&apos;t shared any clones yet, or you&apos;re not part of an org.
        Ask your admin to set a clone&apos;s access to org-scoped.
      </p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OrgPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [clones, setClones] = useState<OrgClone[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in?redirect_url=/org");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/org/clones")
      .then((r) => r.json())
      .then((d) => {
        setClones(d.clones ?? []);
        setOrgName(d.org_name ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  const filtered = clones.filter((c) =>
    !search ||
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  if (!isLoaded || !isSignedIn) return null;

  return (
    <div style={{
      minHeight: "100dvh", background: "#080808",
      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
    }}>
      {/* Dotted grid background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.042) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)",
      }} />

      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: "-10%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 300, borderRadius: "50%",
        background: "rgba(26,115,232,0.04)", filter: "blur(120px)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Sticky breadcrumb nav */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 24px", height: 52,
        display: "flex", alignItems: "center", gap: 16,
        position: "sticky", top: 0,
        background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)", zIndex: 10,
      }}>
        <Link href="/dashboard" style={{
          display: "flex", alignItems: "center", gap: 6,
          textDecoration: "none", color: "rgba(255,255,255,0.38)",
          fontSize: 12, transition: "color 150ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.38)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Home
        </Link>
        <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
          {orgName ?? "Organisation"}
        </span>
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "0 32px 80px" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "28px 0 40px",
          }}
        >
          {/* Title */}
          <div>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 5px" }}>
              {orgName ?? "Organisation"}
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 300, color: "rgba(255,255,255,0.88)", margin: 0, letterSpacing: "-0.02em" }}>
              Team Clones
            </h1>
          </div>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clones…"
              style={{
                width: 220, padding: "9px 14px 9px 34px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 12, fontSize: 13,
                color: "rgba(255,255,255,0.70)",
                outline: "none", fontFamily: "inherit",
              }}
            />
          </div>
        </motion.div>

        {/* Count */}
        {!loading && clones.length > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 28 }}
          >
            {filtered.length} clone{filtered.length !== 1 ? "s" : ""} available to your team
          </motion.p>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyOrg />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {filtered.map((clone, i) => (
              <CloneCard key={clone.clone_id} clone={clone} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
