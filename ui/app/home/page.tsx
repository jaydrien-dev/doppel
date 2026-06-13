"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import {
  motion, AnimatePresence,
  useMotionValue, useTransform, useSpring,
} from "framer-motion";
import { ChatInterface } from "@/components/chat/ChatInterface";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Conversation {
  clone_id: string;
  session_id: string;
  last_message_at: string | null;
  last_user_message: string | null;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  category: string | null;
  price_per_query: number;
}

interface MarketplaceClone {
  clone_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  category: string | null;
  avg_rating: number;
  listing_description: string | null;
}

interface OrgClone {
  clone_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  category: string | null;
  price_per_query: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PALETTE = ["#1A73E8","#7B1FA2","#E91E63","#F57C00","#2E7D32","#546E7A","#00838F","#8E24AA"];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CAT_COLOR: Record<string, string> = {
  business:"#1A73E8", engineering:"#7B1FA2", design:"#E91E63",
  marketing:"#F57C00", finance:"#2E7D32", legal:"#546E7A",
  healthcare:"#C2185B", education:"#F9A825", science:"#00838F", other:"#8E24AA",
};
function catColor(c: string | null) { return CAT_COLOR[c ?? "other"] ?? "#8E24AA"; }

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Animated DoppelMark (empty state hero)
// ---------------------------------------------------------------------------
function FloatingMark() {
  return (
    <motion.div
      style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      animate={{ y: [0, -12, 0], rotateZ: [0, 1.5, -1.5, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Shadow glow beneath */}
      <motion.div
        style={{
          position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)",
          width: 72, height: 16, borderRadius: "50%",
          background: "rgba(255,255,255,0.07)", filter: "blur(10px)",
          pointerEvents: "none",
        }}
        animate={{ opacity: [0.5, 0.9, 0.5], scaleX: [0.8, 1.1, 0.8] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
        <rect x="1.5" y="1.5" width="85" height="85" rx="24"
          fill="rgba(26,115,232,0.12)" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
        {/* Inner glow */}
        <rect x="1.5" y="1.5" width="85" height="85" rx="24"
          fill="url(#mark-glow)" />
        <defs>
          <radialGradient id="mark-glow" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="rgba(26,115,232,0.22)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx="35.2" cy="35.2" r="18.7" fill="rgba(255,255,255,0.96)" />
        <circle cx="55.4" cy="55.4" r="15.2" fill="rgba(167,139,250,0.72)" />
      </svg>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 3D Tilt card
// ---------------------------------------------------------------------------
function TiltCard({ children, style, onClick }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springCfg = { stiffness: 200, damping: 28 };
  const x = useSpring(rawX, springCfg);
  const y = useSpring(rawY, springCfg);
  const rotateX = useTransform(y, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-8, 8]);
  const glowX = useTransform(x, [-0.5, 0.5], ["15%", "85%"]);
  const glowY = useTransform(y, [-0.5, 0.5], ["15%", "85%"]);

  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    rawX.set((e.clientX - r.left) / r.width - 0.5);
    rawY.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() { rawX.set(0); rawY.set(0); }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        rotateX, rotateY,
        transformStyle: "preserve-3d",
        perspective: 900,
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {/* Specular highlight */}
      <motion.div
        style={{
          position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
          background: `radial-gradient(circle at ${glowX.get()} ${glowY.get()}, rgba(255,255,255,0.06) 0%, transparent 60%)`,
          zIndex: 1,
        }}
      />
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Explore card (empty state)
// ---------------------------------------------------------------------------
function ExploreCard({ clone, onSelect }: { clone: MarketplaceClone; onSelect: () => void }) {
  const color = catColor(clone.category);
  const initial = clone.display_name[0]?.toUpperCase() ?? "?";

  return (
    <TiltCard
      style={{ borderRadius: 18, position: "relative" }}
      onClick={onSelect}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
        whileHover={{ scale: 1.03 }}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 18,
          padding: "20px 18px",
          display: "flex", flexDirection: "column", gap: 12,
          backdropFilter: "blur(20px)",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Subtle top gradient */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 60,
          background: `linear-gradient(180deg, ${color}10 0%, transparent 100%)`,
          pointerEvents: "none",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: clone.avatar_url ? "transparent" : `${color}22`,
            border: `1px solid ${color}33`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 500, color,
            overflow: "hidden",
          }}>
            {clone.avatar_url
              ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.92)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {clone.display_name}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", margin: "2px 0 0" }}>@{clone.handle}</p>
          </div>
        </div>
        {clone.listing_description && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", lineHeight: 1.55, margin: 0,
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
            {clone.listing_description}
          </p>
        )}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 11, color,
          borderTop: `1px solid ${hexToRgba(color, 0.18)}`, paddingTop: 10,
          fontWeight: 500,
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 5h4M7 3l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Start conversation
        </div>
      </motion.div>
    </TiltCard>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({
  onSelectClone,
  featuredClones,
}: {
  onSelectClone: (c: MarketplaceClone) => void;
  featuredClones: MarketplaceClone[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "0 40px 40px",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Ambient orbs */}
      <div style={{
        position: "absolute", top: "8%", left: "12%", width: 420, height: 420,
        borderRadius: "50%", background: "rgba(26,115,232,0.11)", filter: "blur(100px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "12%", right: "8%", width: 340, height: 340,
        borderRadius: "50%", background: "rgba(167,139,250,0.10)", filter: "blur(100px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "45%", left: "50%", transform: "translate(-50%,-50%)", width: 220, height: 220,
        borderRadius: "50%", background: "rgba(233,30,99,0.07)", filter: "blur(70px)",
        pointerEvents: "none",
      }} />

      {/* Dot grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)",
      }} />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }}
        style={{ textAlign: "center", marginBottom: 48 }}
      >
        <div style={{ marginBottom: 28 }}>
          <FloatingMark />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 400, color: "rgba(255,255,255,0.93)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
          Your knowledge network
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.6 }}>
          Query any expert clone. Get answers sourced from real experience.
        </p>
      </motion.div>

      {/* Explore grid */}
      {featuredClones.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
          style={{ width: "100%", maxWidth: 720 }}
        >
          <p style={{
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em",
            color: "rgba(255,255,255,0.42)", marginBottom: 16, textAlign: "center",
          }}>
            Explore clones
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {featuredClones.map((c, i) => (
              <motion.div
                key={c.clone_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.06, duration: 0.4 }}
              >
                <ExploreCard clone={c} onSelect={() => onSelectClone(c)} />
              </motion.div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <Link href="/marketplace" style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}>
              Browse all clones →
            </Link>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Conversation row
// ---------------------------------------------------------------------------
function ConvRow({
  conv,
  active,
  onClick,
  index,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
  index: number;
}) {
  const accentColor = avatarColor(conv.display_name);
  const color = conv.avatar_url ? "transparent" : accentColor;
  const initial = conv.display_name[0]?.toUpperCase() ?? "?";

  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: "easeOut" }}
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: 14, border: "none",
        background: active ? hexToRgba(accentColor, 0.14) : "transparent",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        transition: "background 150ms",
        position: "relative",
      }}
      whileHover={{ background: active ? hexToRgba(accentColor, 0.14) : "rgba(255,255,255,0.05)" } as never}
    >
      {/* Active indicator */}
      {active && (
        <motion.div
          layoutId="conv-indicator"
          style={{
            position: "absolute", left: 0, top: "20%", height: "60%",
            width: 3, borderRadius: 999,
            background: `linear-gradient(180deg, ${accentColor}, ${hexToRgba(accentColor, 0.5)})`,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}

      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: 13, flexShrink: 0,
        background: conv.avatar_url ? "transparent" : color,
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 500, color: "#fff",
        overflow: "hidden",
      }}>
        {conv.avatar_url
          ? <img src={conv.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : initial}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {conv.display_name}
          </span>
          {conv.last_message_at && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", flexShrink: 0 }}>
              {timeAgo(conv.last_message_at)}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {conv.last_user_message ?? "Start a conversation"}
        </p>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function ConvSidebar({
  conversations,
  selectedId,
  onSelect,
  planCredits,
  boughtCredits,
  orgCreditBalance,
  orgClones,
  onSelectOrgClone,
  searchQuery,
  onSearchChange,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (c: Conversation) => void;
  planCredits: number | null;
  boughtCredits: number | null;
  orgCreditBalance: number | null;
  orgClones: OrgClone[];
  onSelectOrgClone: (c: OrgClone) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
}) {
  const { user } = useUser();
  const filtered = conversations.filter((c) =>
    c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.last_user_message ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.aside
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        width: 300, flexShrink: 0, display: "flex", flexDirection: "column",
        height: "100%",
        background: "rgba(255,255,255,0.025)",
        borderRight: "1px solid rgba(255,255,255,0.09)",
      }}
    >
      {/* Colored top accent */}
      <div style={{
        height: 2, flexShrink: 0,
        background: "linear-gradient(90deg, #1A73E8 0%, #A78BFA 50%, #E91E63 100%)",
      }} />

      {/* Brand header */}
      <div style={{ padding: "16px 16px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <div className="sb__brand-mark" style={{ width: 24, height: 24, borderRadius: 7 }} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.93)" }}>
              doppel
            </span>
          </Link>
          <Link href="/marketplace" title="Find new clones"
            style={{
              width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center",
              justifyContent: "center", background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.09)", textDecoration: "none",
              color: "rgba(255,255,255,0.50)", transition: "all 180ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.50)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </Link>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, fontSize: 13, color: "rgba(255,255,255,0.70)",
              outline: "none", fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* My Brain + Org shortcuts */}
      <div style={{ padding: "0 8px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
        <Link href="/consumer/brain" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "11px 16px", borderRadius: 12,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
          color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: 500,
          textDecoration: "none", transition: "all 150ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.90)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.70)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 2C5.2 2 3 4.2 3 7c0 1.7.8 3.2 2 4.1V13h6v-1.9c1.2-.9 2-2.4 2-4.1 0-2.8-2.2-5-5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6 13h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          My Brain
        </Link>
        <Link href="/org" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "11px 16px", borderRadius: 12,
          background: "rgba(26,115,232,0.07)", border: "1px solid rgba(26,115,232,0.18)",
          color: "rgba(107,174,255,0.75)", fontSize: 13, fontWeight: 500,
          textDecoration: "none", transition: "all 150ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,115,232,0.14)"; e.currentTarget.style.color = "rgba(107,174,255,0.95)"; e.currentTarget.style.borderColor = "rgba(26,115,232,0.34)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(26,115,232,0.07)"; e.currentTarget.style.color = "rgba(107,174,255,0.75)"; e.currentTarget.style.borderColor = "rgba(26,115,232,0.18)"; }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="6" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="11.5" cy="5" r="1.6" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
            <path d="M1.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M11.5 8.5c1.9.3 3 1.7 3 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
          </svg>
          My Organisation
        </Link>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px", display: "flex", flexDirection: "column" }}>
        {conversations.length === 0 && !searchQuery && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            style={{ padding: "32px 16px", textAlign: "center" }}
          >
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
              No conversations yet.
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 6 }}>
              Browse the{" "}
              <Link href="/marketplace" style={{ color: "rgba(255,255,255,0.40)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                marketplace
              </Link>
              {" "}to start.
            </p>
          </motion.div>
        )}
        {filtered.length === 0 && searchQuery && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "20px 16px", textAlign: "center" }}>
            No results
          </p>
        )}
        {filtered.map((c, i) => (
          <ConvRow
            key={c.clone_id}
            conv={c}
            active={c.clone_id === selectedId}
            onClick={() => onSelect(c)}
            index={i}
          />
        ))}

        {/* Org clones section */}
        {orgClones.length > 0 && (
          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{
              fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em",
              color: "rgba(107,174,255,0.40)", padding: "8px 14px 4px", margin: 0,
            }}>
              Org Clones
            </p>
            {orgClones.map((c) => {
              const active = c.clone_id === selectedId;
              const color = catColor(c.category);
              const initial = c.display_name[0]?.toUpperCase() ?? "?";
              return (
                <button
                  key={c.clone_id}
                  onClick={() => onSelectOrgClone(c)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", borderRadius: 12, border: "none",
                    background: active ? hexToRgba("#6BAEFF", 0.12) : "transparent",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "background 150ms",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(107,174,255,0.06)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: c.avatar_url ? "transparent" : hexToRgba(color, 0.20),
                    border: `1px solid ${hexToRgba(color, 0.30)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 500, color, overflow: "hidden",
                  }}>
                    {c.avatar_url
                      ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.75)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.display_name}
                    </p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", margin: "1px 0 0" }}>
                      {c.price_per_query > 0 ? `${c.price_per_query} cr` : "Free"} · org
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User footer */}
      <div style={{
        flexShrink: 0, padding: "12px 16px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UserButton appearance={{ elements: { avatarBox: { width: 30, height: 30 } } }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.65)", margin: 0 }}>
              {user?.firstName ?? "You"}
            </p>
            {(planCredits !== null || boughtCredits !== null || orgCreditBalance !== null) && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", margin: "1px 0 0", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0 4px" }}>
                {planCredits !== null && planCredits > 0 && (
                  <span style={{ color: "rgba(96,165,250,0.65)" }}>{planCredits} plan</span>
                )}
                {planCredits !== null && planCredits > 0 && boughtCredits !== null && boughtCredits > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
                )}
                {boughtCredits !== null && boughtCredits > 0 && (
                  <span>{boughtCredits} cr</span>
                )}
                {orgCreditBalance !== null && orgCreditBalance > 0 && (
                  <span style={{ color: "rgba(107,174,255,0.55)" }}>· {orgCreditBalance} org</span>
                )}
                {(planCredits === 0 || planCredits === null) && (boughtCredits === 0 || boughtCredits === null) && (orgCreditBalance === null || orgCreditBalance === 0) && (
                  <Link href="/dashboard/credits" style={{ color: "rgba(255,255,255,0.22)", textDecoration: "none" }}>
                    get credits
                  </Link>
                )}
              </p>
            )}
          </div>
        </div>
        <Link href="/dashboard"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
            color: "rgba(255,255,255,0.40)", transition: "all 180ms",
            fontSize: 11,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; e.currentTarget.style.background = "rgba(255,255,255,0.09)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.40)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4.2" height="4.2" rx="1.2" fill="currentColor" opacity="0.9"/>
            <rect x="6.8" y="1" width="4.2" height="4.2" rx="1.2" fill="currentColor" opacity="0.5"/>
            <rect x="1" y="6.8" width="4.2" height="4.2" rx="1.2" fill="currentColor" opacity="0.5"/>
            <rect x="6.8" y="6.8" width="4.2" height="4.2" rx="1.2" fill="currentColor" opacity="0.3"/>
          </svg>
          Dashboard
        </Link>
      </div>
    </motion.aside>
  );
}

// ---------------------------------------------------------------------------
// Chat view (right panel when a conversation is selected)
// ---------------------------------------------------------------------------
function ConvChatView({
  conv,
  onBack,
}: {
  conv: Conversation;
  onBack: () => void;
}) {
  const color = catColor(conv.category);
  const initial = conv.display_name[0]?.toUpperCase() ?? "?";

  return (
    <motion.div
      key={conv.clone_id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 320, damping: 36 }}
      style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px",
        borderBottom: `1px solid ${hexToRgba(catColor(conv.category), 0.28)}`,
        background: "rgba(8,8,8,0.80)", backdropFilter: "blur(20px)",
        flexShrink: 0,
        position: "relative",
      }}>
        {/* Subtle category-color glow behind header */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(90deg, ${hexToRgba(catColor(conv.category), 0.06)} 0%, transparent 60%)`,
        }} />
        <button
          onClick={onBack}
          style={{
            width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
            color: "rgba(255,255,255,0.45)", transition: "all 180ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          background: conv.avatar_url ? "transparent" : catColor(conv.category),
          border: `1px solid ${hexToRgba(catColor(conv.category), 0.45)}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 500, color: "#fff", overflow: "hidden",
          position: "relative", zIndex: 1,
        }}>
          {conv.avatar_url
            ? <img src={conv.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initial}
        </div>

        <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.93)", margin: 0 }}>
            {conv.display_name}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", margin: "1px 0 0" }}>
            @{conv.handle}
          </p>
        </div>

        <Link
          href={`/marketplace/${conv.handle}`}
          title="View profile"
          style={{
            width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)",
            textDecoration: "none", transition: "all 180ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.40)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M2 10.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </Link>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatInterface
          key={conv.session_id}
          cloneId={conv.clone_id}
          cloneName={conv.display_name}
          cloneColor={color}
          contextType="chat"
          ownerMode={false}
          placeholder={`Ask ${conv.display_name} anything…`}
          pricePerQuery={conv.price_per_query ?? 0}
          sessionId={conv.session_id}
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneParam = searchParams.get("clone");
  const { isSignedIn, isLoaded } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [featured, setFeatured] = useState<MarketplaceClone[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [planCredits, setPlanCredits] = useState<number | null>(null);
  const [boughtCredits, setBoughtCredits] = useState<number | null>(null);
  const [orgCreditBalance, setOrgCreditBalance] = useState<number | null>(null);
  const [orgClones, setOrgClones] = useState<OrgClone[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in?redirect_url=/home");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/consumer/conversations")
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations ?? []))
      .catch(() => {});
    fetch("/api/marketplace?limit=4&sort=most_queries")
      .then((r) => r.json())
      .then((d) => setFeatured(d.clones ?? []))
      .catch(() => {});
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((d) => { setPlanCredits(d.plan_credits ?? 0); setBoughtCredits(d.bought_credits ?? 0); })
      .catch(() => {});
    fetch("/api/org/credits")
      .then((r) => r.json())
      .then((d) => { if (d.org_id) setOrgCreditBalance(d.credits ?? 0); })
      .catch(() => {});
    fetch("/api/org/clones")
      .then((r) => r.json())
      .then((d) => setOrgClones(d.clones ?? []))
      .catch(() => {});
  }, [isSignedIn]);

  // Helper: add a clone to conversations (persists to backend) then select it.
  // Uses a stable localStorage session_id per clone so history survives page reloads.
  const addAndSelect = useCallback((data: { clone_id: string; display_name: string; handle: string; avatar_url: string | null; category: string | null; price_per_query?: number }) => {
    // Stable session key persisted in localStorage — avoids a new session every reload
    const lsKey = `doppel_home_session:${data.clone_id}`;
    const storedSession = localStorage.getItem(lsKey);

    setConversations((prev) => {
      // If already loaded in conversations, use the DB's authoritative session_id
      const existing = prev.find((x) => x.clone_id === data.clone_id);
      if (existing) {
        // Sync localStorage to DB session so future reloads are consistent
        try { localStorage.setItem(lsKey, existing.session_id); } catch { /* ignore */ }
        setSelected(existing);
        return prev;
      }

      // Not loaded yet: use localStorage-cached session or generate a new stable one
      const sessionId = storedSession ?? crypto.randomUUID();
      if (!storedSession) {
        try { localStorage.setItem(lsKey, sessionId); } catch { /* ignore */ }
      }

      const conv: Conversation = {
        clone_id: data.clone_id,
        session_id: sessionId,
        last_message_at: null,
        last_user_message: null,
        display_name: data.display_name,
        handle: data.handle,
        avatar_url: data.avatar_url,
        category: data.category,
        price_per_query: data.price_per_query ?? 0,
      };
      setSelected(conv);
      return [conv, ...prev];
    });

    // Persist add in background (fire-and-forget)
    fetch(`/api/clones/${data.handle}/add`, { method: "POST" }).catch(() => {});
  }, []);

  // Auto-open clone from ?clone=handle (e.g. from My Clones chat button)
  useEffect(() => {
    if (!isSignedIn || !cloneParam) return;
    // Try marketplace first; fall back to direct clone lookup for private/unlisted clones
    fetch(`/api/marketplace/${cloneParam}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) { addAndSelect(data); return; }
        return fetch(`/api/clones/${cloneParam}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) addAndSelect(d); });
      })
      .catch(() => {});
  }, [isSignedIn, cloneParam, addAndSelect]);

  function handleSelectExplore(c: MarketplaceClone) {
    addAndSelect(c);
  }

  function handleSelectOrgClone(c: OrgClone) {
    addAndSelect(c);
  }

  if (!isLoaded || !isSignedIn) return null;

  return (
    <div style={{
      height: "100dvh", overflow: "hidden",
      display: "flex", background: "#080808",
      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
    }}>
      <ConvSidebar
        conversations={conversations}
        selectedId={selected?.clone_id ?? null}
        onSelect={setSelected}
        planCredits={planCredits}
        boughtCredits={boughtCredits}
        orgCreditBalance={orgCreditBalance}
        orgClones={orgClones}
        onSelectOrgClone={handleSelectOrgClone}
        searchQuery={search}
        onSearchChange={setSearch}
      />

      {/* Main panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        <AnimatePresence mode="wait">
          {selected ? (
            <ConvChatView
              key={selected.session_id}
              conv={selected}
              onBack={() => setSelected(null)}
            />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <EmptyState
                featuredClones={featured}
                onSelectClone={handleSelectExplore}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
