"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import {
  motion, AnimatePresence,
  useMotionValue, useTransform, useSpring,
} from "framer-motion";
import useSWR from "swr";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { SchedulePicker } from "@/components/ui/SchedulePicker";

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
        <Link href="/dashboard/my-brain" style={{
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
                      org
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
// Connectors panel (per-clone, used in tab view)
// ---------------------------------------------------------------------------

type ConnectedTool = { id: string; name: string; tool_names: string[]; enabled: boolean; created_at: string };
type AuthFlow = "oauth" | "webhook" | "credentials";
type ConnectorSection = "communication" | "productivity" | "finance";
interface ConnectorDef { id: string; name: string; subtitle: string; description: string; authFlow: AuthFlow; serviceKey?: string; credentialLabel?: string; credentialHint?: string; skills: string[]; section: ConnectorSection; toolNames: string[]; comingSoon?: boolean }

const CONNECTORS: ConnectorDef[] = [
  { id: "gmail", name: "Gmail", subtitle: "Inbox · Drafts · Send · Labels", description: "Read your inbox, draft and send emails, search conversations, apply labels and archive.", authFlow: "oauth", serviceKey: "gmail", skills: ["Email triage", "Reply drafting", "Follow-up execution"], section: "communication", toolNames: ["Gmail"] },
  { id: "gcal", name: "Google Calendar", subtitle: "Events · Invites · Scheduling", description: "Create and reschedule meetings, send invites, read your schedule, and avoid conflicts.", authFlow: "oauth", serviceKey: "gcal", skills: ["Meeting scheduling", "Calendar management"], section: "communication", toolNames: ["Google Calendar"] },
  { id: "slack", name: "Slack", subtitle: "Messages · Channels · DMs", description: "Post to channels, send direct messages, monitor threads, relay updates.", authFlow: "oauth", serviceKey: "slack", skills: ["Team communication", "Status updates", "Channel summaries"], section: "communication", toolNames: ["Slack"] },
  { id: "whatsapp", name: "WhatsApp", subtitle: "Messages · Replies · Customer chats", description: "Reads incoming messages and drafts replies — routed through your approval.", authFlow: "credentials", credentialLabel: "Meta API access token", credentialHint: "EAAxxxxxxxxx…", skills: ["Customer support", "FAQ replies"], section: "communication", toolNames: [] },
  { id: "zoom", name: "Zoom", subtitle: "Meetings · Recordings · Transcripts", description: "Schedule meetings, read transcripts, send post-meeting summaries.", authFlow: "oauth", serviceKey: "zoom", skills: ["Meeting scheduling", "Transcript analysis"], section: "communication", toolNames: [], comingSoon: true },
  { id: "microsoft365", name: "Microsoft 365", subtitle: "Outlook · Teams · OneDrive", description: "Send Outlook email, post in Teams, manage OneDrive files.", authFlow: "oauth", serviceKey: "microsoft365", skills: ["Email triage", "Teams messaging", "File management"], section: "communication", toolNames: [], comingSoon: true },
  { id: "facebook_instagram", name: "Facebook & Instagram", subtitle: "Page DMs · Comments · Posts", description: "Reply to DMs, respond to comments, manage your social inbox.", authFlow: "oauth", serviceKey: "facebook", skills: ["Social inbox", "Comment replies"], section: "communication", toolNames: [], comingSoon: true },
  { id: "gdrive", name: "Google Drive", subtitle: "Files · Docs · Sheets · Slides", description: "Search and read files, create documents and spreadsheets, share and organise your Drive.", authFlow: "oauth", serviceKey: "gdrive", skills: ["File management", "Document writing", "Spreadsheet updates"], section: "productivity", toolNames: ["Google Drive"] },
  { id: "notion", name: "Notion", subtitle: "Pages · Databases · Workspaces", description: "Read and write pages, update database records, create structured documents.", authFlow: "oauth", serviceKey: "notion", skills: ["Knowledge base updates", "Meeting notes", "Project tracking"], section: "productivity", toolNames: ["Notion"] },
  { id: "canva", name: "Canva", subtitle: "Designs · Templates · Brand Kit", description: "Create on-brand designs, update existing designs, export as PDF or PNG.", authFlow: "oauth", serviceKey: "canva", skills: ["Flyer creation", "Presentation design", "Social graphics"], section: "productivity", toolNames: [], comingSoon: true },
  { id: "sql_accounting", name: "SQL Accounting", subtitle: "Invoices · Payments · Cash Flow", description: "Monitor invoices, flag overdue accounts, generate financial summaries.", authFlow: "credentials", credentialLabel: "SQL Account API credentials", credentialHint: "API URL + credentials", skills: ["Invoice tracking", "Financial reporting"], section: "finance", toolNames: [], comingSoon: true },
];

const CONNECTOR_SECTIONS: { id: ConnectorSection; label: string; desc: string }[] = [
  { id: "communication", label: "Communication",       desc: "Email, messaging, and meetings." },
  { id: "productivity",  label: "Files & Productivity", desc: "The apps your delegate reads from and writes to." },
  { id: "finance",       label: "Finance",              desc: "Your accounting system, delegated." },
];

function ConnectorIcon({ id }: { id: string }) {
  const c = "rgba(255,255,255,0.65)";
  const p: React.SVGProps<SVGSVGElement> = { width: 18, height: 18, fill: "none" };
  switch (id) {
    case "gmail":         return <svg {...p} viewBox="0 0 20 20"><rect x="2" y="5" width="16" height="12" rx="2" stroke={c} strokeWidth="1.3"/><path d="M2 7l8 5 8-5" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>;
    case "gcal":          return <svg {...p} viewBox="0 0 20 20"><rect x="2.5" y="4.5" width="15" height="13" rx="2" stroke={c} strokeWidth="1.3"/><path d="M7 2.5v4M13 2.5v4M2.5 8.5h15" stroke={c} strokeWidth="1.3" strokeLinecap="round"/><circle cx="10" cy="13" r="1.5" fill={c} opacity=".6"/></svg>;
    case "slack":         return <svg {...p} viewBox="0 0 20 20"><rect x="7" y="2" width="3" height="9" rx="1.5" fill={c}/><rect x="7" y="13" width="3" height="3" rx="1.5" fill={c} opacity=".4"/><rect x="11" y="9" width="7" height="3" rx="1.5" fill={c}/><rect x="2" y="9" width="3" height="3" rx="1.5" fill={c} opacity=".4"/><rect x="10" y="7" width="3" height="9" rx="1.5" fill={c} opacity=".6"/><rect x="7" y="11" width="9" height="3" rx="1.5" fill={c} opacity=".6"/></svg>;
    case "whatsapp":      return <svg {...p} viewBox="0 0 20 20"><path d="M10 2a8 8 0 0 0-6.93 11.95L2 18l4.17-1.06A8 8 0 1 0 10 2z" stroke={c} strokeWidth="1.3"/><path d="M7.5 8c.4.8 1.2 2 2.5 2.8.3-.3.7-.6 1-.5.5.1 1.2.5 1.2.9 0 .5-.5 1-1 1.2-.9.3-2.4-.3-3.8-1.7S5.8 8.5 6 7.5c.2-.5.7-.9 1.2-.9.3 0 .8.7.8 1z" fill={c}/></svg>;
    case "zoom":          return <svg {...p} viewBox="0 0 20 20"><rect x="2" y="6" width="11" height="9" rx="2" stroke={c} strokeWidth="1.3"/><path d="M13 9l5-3v8l-5-3V9z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/></svg>;
    case "microsoft365":  return <svg {...p} viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="1" fill={c}/><rect x="11" y="2" width="7" height="7" rx="1" fill={c} opacity=".60"/><rect x="2" y="11" width="7" height="7" rx="1" fill={c} opacity=".60"/><rect x="11" y="11" width="7" height="7" rx="1" fill={c} opacity=".30"/></svg>;
    case "facebook_instagram": return <svg {...p} viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="2" stroke={c} strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" fill={c}/><rect x="11" y="2" width="7" height="16" rx="2" stroke={c} strokeWidth="1.2"/><path d="M14.5 9h-1v-1.5A.5.5 0 0 1 14 7h1" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>;
    case "gdrive":        return <svg {...p} viewBox="0 0 20 20"><path d="M10 3L2.5 16h5L10 10l2.5 6h5L10 3z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/><path d="M7 13h6" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity=".5"/></svg>;
    case "notion":        return <svg {...p} viewBox="0 0 20 20"><rect x="3" y="2" width="14" height="16" rx="2" stroke={c} strokeWidth="1.3"/><path d="M7 6.5h6M7 10h6M7 13.5h4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>;
    case "canva":         return <svg {...p} viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.3"/><path d="M7.5 13.5V8l2.5 2.5L12.5 8v5.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "sql_accounting": return <svg {...p} viewBox="0 0 20 20"><ellipse cx="10" cy="5.5" rx="6.5" ry="2.5" stroke={c} strokeWidth="1.3"/><path d="M3.5 5.5v4c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-4" stroke={c} strokeWidth="1.3"/><path d="M3.5 9.5v4c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-4" stroke={c} strokeWidth="1.3"/></svg>;
    default: return <svg {...p} viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.3"/></svg>;
  }
}

function ConnCredentialsModal({ def, cloneId, onClose, onSaved }: { def: ConnectorDef; cloneId: string; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!value.trim()) return;
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, name: def.name, server_url: `native://${def.id}`, transport: "native", api_key: value.trim() }) });
      if (!res.ok) { setErr("Failed to save. Check your key and try again."); return; }
      onSaved(); onClose();
    } catch { setErr("Network error. Please try again."); }
    finally { setSaving(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: "28px 28px 24px", maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", gap: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}><ConnectorIcon id={def.id} /></div>
          <div><p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.90)", margin: 0 }}>Connect {def.name}</p><p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>{def.subtitle}</p></div>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{def.credentialLabel}</label>
          <input type="password" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} placeholder={def.credentialHint ?? ""} autoFocus style={{ width: "100%", padding: "9px 12px", borderRadius: 10, fontSize: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.85)", outline: "none", fontFamily: "monospace", boxSizing: "border-box" as const }} />
          {err && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.80)", margin: "6px 0 0" }}>{err}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.55)", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={saving || !value.trim()} style={{ padding: "7px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", fontFamily: "inherit", opacity: saving || !value.trim() ? 0.4 : 1 }}>{saving ? "Saving…" : "Connect"}</button>
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({ def, tools, cloneId, userId, onRefresh }: { def: ConnectorDef; tools: ConnectedTool[]; cloneId: string; userId: string; onRefresh: () => void }) {
  const matchingTools = tools.filter(t => def.toolNames.includes(t.name) || t.name === def.name);
  const isConnected = matchingTools.length > 0;
  const [disconnecting, setDisconnecting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await Promise.all(matchingTools.map(t => fetch(`/api/tools/${t.id}?clone_id=${cloneId}`, { method: "DELETE" })));
    onRefresh(); setDisconnecting(false);
  }
  function handleConnect() {
    if (def.authFlow === "credentials") setShowModal(true);
    else window.location.href = `/api/oauth-start?service=${def.serviceKey}&clone_id=${cloneId}&user_id=${userId}`;
  }

  return (
    <>
      {showModal && <ConnCredentialsModal def={def} cloneId={cloneId} onClose={() => setShowModal(false)} onSaved={() => { onRefresh(); setShowModal(false); }} />}
      <div style={{ borderRadius: 14, border: `1px solid ${isConnected ? "rgba(52,211,153,0.13)" : "rgba(255,255,255,0.07)"}`, background: isConnected ? "rgba(52,211,153,0.018)" : "rgba(255,255,255,0.018)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, opacity: def.comingSoon ? 0.40 : 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}><ConnectorIcon id={def.id} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.90)" }}>{def.name}</span>
              {def.comingSoon ? <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.09)" }}>Soon</span>
                : isConnected ? <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, color: "rgba(52,211,153,0.85)", background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)" }}>Connected</span>
                : null}
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>{def.subtitle}</p>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.6 }}>{def.description}</p>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
          {def.skills.map(s => <span key={s} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}>{s}</span>)}
        </div>
        {!def.comingSoon && def.authFlow !== "webhook" && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {isConnected
              ? <button onClick={handleDisconnect} disabled={disconnecting} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, background: "transparent", border: "1px solid rgba(248,113,113,0.15)", color: "rgba(248,113,113,0.65)", cursor: "pointer", fontFamily: "inherit", opacity: disconnecting ? 0.4 : 1 }} onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.30)"; e.currentTarget.style.color = "rgba(248,113,113,0.90)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.65)"; }}>{disconnecting ? "Removing…" : "Disconnect"}</button>
              : <button onClick={handleConnect} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.95)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.70)"; }}>Connect →</button>
            }
          </div>
        )}
      </div>
    </>
  );
}

function ConnectorsPanel({ cloneId }: { cloneId: string }) {
  const { user } = useUser();
  const { data, mutate } = useSWR(`/api/tools?clone_id=${cloneId}`, swrFetcher, { refreshInterval: 30_000 });
  const tools: ConnectedTool[] = Array.isArray(data) ? data : [];
  const userId = user?.id ?? "";
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 300, color: "rgba(255,255,255,0.92)", margin: 0 }}>Connectors</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginTop: 4 }}>Connect the tools your clone acts in. Every action routes through your approval.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {CONNECTOR_SECTIONS.map(sec => {
            const connectors = CONNECTORS.filter(c => c.section === sec.id);
            return (
              <div key={sec.id}>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.09em", color: "rgba(255,255,255,0.40)", margin: "0 0 2px" }}>{sec.label}</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0 }}>{sec.desc}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {connectors.map(def => <ConnectorCard key={def.id} def={def} tools={tools} cloneId={cloneId} userId={userId} onRefresh={() => mutate()} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks + Automations panels (per-clone, used in tab view)
// ---------------------------------------------------------------------------

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

interface TaskStep { step: number; description: string; requires_approval: boolean; status: string; result?: string }
interface Task { id: string; title: string; instruction: string; status: string; plan_steps: TaskStep[]; current_step: number; result?: string; error?: string; created_at: string }
interface Automation { id: string; name: string; instruction: string; schedule: string; status: "active" | "paused" | "disabled"; run_count: number; last_run_at?: string; next_run_at?: string; created_at: string }

const TASK_COLOR: Record<string, string> = { pending: "rgba(255,255,255,0.3)", planning: "rgba(255,255,255,0.5)", running: "#6BAEFF", waiting_approval: "#FCD34D", completed: "#34D399", failed: "#F87171", cancelled: "rgba(255,255,255,0.2)" };
const TASK_LABEL: Record<string, string> = { pending: "Queued", planning: "Planning", running: "Running", waiting_approval: "Needs approval", completed: "Done", failed: "Failed", cancelled: "Cancelled" };

function TaskStepIcon({ status }: { status: string }) {
  if (status === "completed") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.4)"/><path d="M4 7l2 2 4-4" stroke="#34D399" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (status === "running") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" fill="rgba(107,174,255,0.15)" stroke="rgba(107,174,255,0.4)"/><circle cx="7" cy="7" r="2.5" fill="#6BAEFF" opacity="0.8"/></svg>;
  if (status === "waiting_approval") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" fill="rgba(252,211,77,0.12)" stroke="rgba(252,211,77,0.35)"/><path d="M7 4v3M7 9.5v.5" stroke="#FCD34D" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  if (status === "failed") return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" fill="rgba(248,113,113,0.12)" stroke="rgba(248,113,113,0.3)"/><path d="M5 5l4 4M9 5l-4 4" stroke="#F87171" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" stroke="rgba(255,255,255,0.12)"/></svg>;
}

function TaskCard({ task, cloneId, onRefresh }: { task: Task; cloneId: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(task.status === "waiting_approval");
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const completed = task.plan_steps.filter(s => s.status === "completed").length;
  const total = task.plan_steps.length;
  const statusColor = TASK_COLOR[task.status] || "rgba(255,255,255,0.3)";
  const isActive = ["pending", "planning", "running", "waiting_approval"].includes(task.status);
  async function approveStep() { setResuming(true); try { await fetch(`/api/tasks/${task.id}?clone_id=${cloneId}&action=resume`, { method: "POST" }); onRefresh(); } finally { setResuming(false); } }
  async function cancelTask() { setCancelling(true); try { await fetch(`/api/tasks/${task.id}?clone_id=${cloneId}`, { method: "DELETE" }); onRefresh(); } finally { setCancelling(false); } }
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${task.status === "waiting_approval" ? "rgba(252,211,77,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>{task.title || task.instruction.slice(0, 80)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: `${statusColor}18`, border: `1px solid ${statusColor}35`, color: statusColor }}>{TASK_LABEL[task.status] || task.status}</span>
            {total > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{completed}/{total} steps</span>}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>{new Date(task.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        {total > 0 && <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 999, flexShrink: 0 }}><div style={{ width: `${(completed/total)*100}%`, height: "100%", background: task.status === "completed" ? "#34D399" : "#6BAEFF", borderRadius: 999 }} /></div>}
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0, opacity: 0.35 }}><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {task.plan_steps.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {task.plan_steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 9px", background: step.status === "running" ? "rgba(107,174,255,0.04)" : "transparent", border: `1px solid ${step.status === "running" ? "rgba(107,174,255,0.12)" : step.status === "waiting_approval" ? "rgba(252,211,77,0.12)" : "transparent"}`, borderRadius: 8 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}><TaskStepIcon status={step.status} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>{step.description}</div>
                    {step.result && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 3 }}>{step.result.slice(0, 200)}{step.result.length > 200 ? "…" : ""}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginBottom: 10 }}>{task.status === "planning" ? "Planning…" : task.instruction}</p>}
          {task.result && <div style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}><p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Result</p><p style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.6 }}>{task.result}</p></div>}
          {task.error && <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}><p style={{ fontSize: 12, color: "#F87171" }}>{task.error}</p></div>}
          <div style={{ display: "flex", gap: 8 }}>
            {task.status === "waiting_approval" && <button onClick={approveStep} disabled={resuming} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 9, background: "rgba(252,211,77,0.12)", border: "1px solid rgba(252,211,77,0.25)", color: "#FCD34D", cursor: "pointer", fontFamily: "inherit", opacity: resuming ? 0.5 : 1 }}>{resuming ? "Approving…" : "Approve & continue"}</button>}
            {isActive && <button onClick={cancelTask} disabled={cancelling} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 9, background: "transparent", border: "1px solid rgba(248,113,113,0.15)", color: "rgba(248,113,113,0.6)", cursor: "pointer", fontFamily: "inherit", opacity: cancelling ? 0.5 : 1 }}>Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function NewTaskModal({ cloneId, onCreated, onClose }: { cloneId: string; onCreated: () => void; onClose: () => void }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit() { if (!instruction.trim()) return; setLoading(true); try { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, instruction: instruction.trim() }) }); onCreated(); onClose(); } finally { setLoading(false); } }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: 28, width: 520, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>New task</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>Describe what your clone should do. It will plan and execute step-by-step.</p>
        <textarea autoFocus value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="e.g. Search my Gmail for investor emails this week and summarise the key asks." style={{ width: "100%", minHeight: 100, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "rgba(255,255,255,0.8)", resize: "vertical" as const, fontFamily: "inherit", lineHeight: 1.6, outline: "none", boxSizing: "border-box" as const }} onFocus={e => { e.target.style.borderColor = "rgba(255,255,255,0.22)"; }} onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "8px 18px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={loading || !instruction.trim()} style={{ fontSize: 13, padding: "8px 20px", borderRadius: 10, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)", cursor: "pointer", fontFamily: "inherit", opacity: (!instruction.trim() || loading) ? 0.4 : 1 }}>{loading ? "Starting…" : "Start task"}</button>
        </div>
      </div>
    </div>
  );
}

function TasksPanel({ cloneId }: { cloneId: string }) {
  const [showModal, setShowModal] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ tasks: Task[] }>(`/api/tasks?clone_id=${cloneId}`, swrFetcher, { refreshInterval: 5000 });
  const tasks = data?.tasks ?? [];
  const active = tasks.filter(t => ["pending", "planning", "running", "waiting_approval"].includes(t.status));
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: 0 }}>Tasks</h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 4 }}>Long-running work your clone handles end-to-end.</p>
          </div>
          <button onClick={() => setShowModal(true)} style={{ fontSize: 12, padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>New task
          </button>
        </div>
        {active.length > 0 && <div style={{ background: "rgba(107,174,255,0.06)", border: "1px solid rgba(107,174,255,0.14)", borderRadius: 10, padding: "8px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}><div style={{ width: 6, height: 6, borderRadius: 999, background: "#6BAEFF" }} /><span style={{ fontSize: 12, color: "rgba(107,174,255,0.8)" }}>{active.length} task{active.length !== 1 ? "s" : ""} running</span></div>}
        {isLoading ? <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
          : tasks.length === 0 ? <div style={{ textAlign: "center", padding: "50px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}><p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12 }}>No tasks yet.</p><button onClick={() => setShowModal(true)} style={{ fontSize: 13, padding: "8px 18px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.55)", cursor: "pointer", fontFamily: "inherit" }}>Start first task</button></div>
          : tasks.map(task => <TaskCard key={task.id} task={task} cloneId={cloneId} onRefresh={() => mutate()} />)}
      </div>
      {showModal && <NewTaskModal cloneId={cloneId} onCreated={() => mutate()} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function scheduleLabel(value: string): string {
  if (value === "hourly") return "Every hour";
  const p = value.split(":");
  const pad = (v: string) => v.padStart(2, "0");
  const fmtTime = (h: string, m: string) => { const hh = parseInt(h, 10); return `${hh === 0 ? 12 : hh > 12 ? hh - 12 : hh}:${pad(m)} ${hh >= 12 ? "PM" : "AM"}`; };
  const DAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  if (p[0] === "daily")    return `Every day at ${fmtTime(p[1], p[2])}`;
  if (p[0] === "weekdays") return `Every weekday at ${fmtTime(p[1], p[2])}`;
  if (p[0] === "weekly")   return `Every ${DAY[p[1]] ?? p[1]} at ${fmtTime(p[2], p[3])}`;
  if (p[0] === "monthly") { const d = parseInt(p[1], 10); return `${d}${d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"} of each month at ${fmtTime(p[2], p[3])}`; }
  return value;
}

function AutomationRow({ auto, cloneId, onRefresh }: { auto: Automation; cloneId: string; onRefresh: () => void }) {
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isActive = auto.status === "active";
  const diff = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 2 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m/60)}h ago` : `${Math.floor(m/1440)}d ago`; };
  async function toggleStatus() { setToggling(true); try { await fetch(`/api/automations/${auto.id}?clone_id=${cloneId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: isActive ? "paused" : "active" }) }); onRefresh(); } finally { setToggling(false); } }
  async function runNow() { setRunning(true); try { await fetch(`/api/automations/${auto.id}?clone_id=${cloneId}`, { method: "POST" }); onRefresh(); } finally { setRunning(false); } }
  async function deleteAuto() { if (!confirm(`Delete "${auto.name}"?`)) return; setDeleting(true); try { await fetch(`/api/automations/${auto.id}?clone_id=${cloneId}`, { method: "DELETE" }); onRefresh(); } finally { setDeleting(false); } }
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isActive ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 7, display: "flex", alignItems: "flex-start", gap: 12, opacity: auto.status === "paused" ? 0.65 : 1 }}>
      <div style={{ marginTop: 4, flexShrink: 0 }}><div style={{ width: 7, height: 7, borderRadius: 999, background: isActive ? "#34D399" : "rgba(255,255,255,0.2)" }} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" as const }}><span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>{auto.name}</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{scheduleLabel(auto.schedule)}</span></div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 3, lineHeight: 1.5 }}>{auto.instruction.slice(0, 100)}{auto.instruction.length > 100 ? "…" : ""}</p>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>{auto.last_run_at && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>Last: {diff(auto.last_run_at)}</span>}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>{auto.run_count} run{auto.run_count !== 1 ? "s" : ""}</span></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <button onClick={runNow} disabled={running} title="Run now" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", color: "rgba(255,255,255,0.42)", opacity: running ? 0.4 : 1 }}><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 4-8 4V2z" fill="currentColor"/></svg></button>
        <button onClick={toggleStatus} disabled={toggling} title={isActive ? "Pause" : "Resume"} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", color: "rgba(255,255,255,0.42)", opacity: toggling ? 0.4 : 1 }}>{isActive ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="3" height="8" rx="1" fill="currentColor"/><rect x="7" y="2" width="3" height="8" rx="1" fill="currentColor"/></svg> : <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 4-8 4V2z" fill="currentColor" opacity="0.5"/></svg>}</button>
        <button onClick={deleteAuto} disabled={deleting} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(248,113,113,0.1)", cursor: "pointer", color: "rgba(248,113,113,0.45)", opacity: deleting ? 0.4 : 1 }}><svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></button>
      </div>
    </div>
  );
}

function NewAutomationModal({ cloneId, onCreated, onClose }: { cloneId: string; onCreated: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [schedule, setSchedule] = useState("daily:09:00");
  const [loading, setLoading] = useState(false);
  const inp: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  async function submit() { if (!name.trim() || !instruction.trim()) return; setLoading(true); try { await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, name: name.trim(), instruction: instruction.trim(), schedule }) }); onCreated(); onClose(); } finally { setLoading(false); } }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: 28, width: 520, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>New automation</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>Schedule a recurring task your clone runs automatically.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Weekly digest" style={inp} /></div>
          <div><label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 5 }}>Instruction</label><textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Summarise emails received this week and identify any action items." style={{ ...inp, minHeight: 80, resize: "vertical" as const, lineHeight: 1.6 }} /></div>
          <div><label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 8 }}>Schedule</label><SchedulePicker value={schedule} onChange={setSchedule} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "8px 18px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={loading || !name.trim() || !instruction.trim()} style={{ fontSize: 13, padding: "8px 20px", borderRadius: 10, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)", cursor: "pointer", fontFamily: "inherit", opacity: (!name.trim() || !instruction.trim() || loading) ? 0.4 : 1 }}>{loading ? "Saving…" : "Create automation"}</button>
        </div>
      </div>
    </div>
  );
}

function AutomationsPanel({ cloneId }: { cloneId: string }) {
  const [showModal, setShowModal] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ automations: Automation[] }>(`/api/automations?clone_id=${cloneId}`, swrFetcher, { revalidateOnFocus: false });
  const automations = data?.automations ?? [];
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: 0 }}>Automations</h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 4 }}>Recurring tasks your clone runs on a schedule.</p>
          </div>
          <button onClick={() => setShowModal(true)} style={{ fontSize: 12, padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>New automation
          </button>
        </div>
        {isLoading ? <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
          : automations.length === 0 ? <div style={{ textAlign: "center", padding: "50px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}><p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12 }}>No automations yet.</p><button onClick={() => setShowModal(true)} style={{ fontSize: 13, padding: "8px 18px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.55)", cursor: "pointer", fontFamily: "inherit" }}>Create first automation</button></div>
          : automations.map(auto => <AutomationRow key={auto.id} auto={auto} cloneId={cloneId} onRefresh={() => mutate()} />)}
      </div>
      {showModal && <NewAutomationModal cloneId={cloneId} onCreated={() => mutate()} onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat view (right panel when a conversation is selected)
// ---------------------------------------------------------------------------
type HomeTab = "chat" | "tasks" | "automations" | "connectors";

function ConvChatView({
  conv,
  onBack,
}: {
  conv: Conversation;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<HomeTab>("chat");
  const color = catColor(conv.category);
  const initial = conv.display_name[0]?.toUpperCase() ?? "?";

  // Reset to chat when clone changes
  useEffect(() => { setActiveTab("chat"); }, [conv.clone_id]);

  return (
    <motion.div
      key={conv.clone_id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 320, damping: 36 }}
      style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}
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

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", flexShrink: 0 }}>
        {(["chat", "tasks", "automations", "connectors"] as HomeTab[]).map(tab => {
          const isActive = activeTab === tab;
          const label = tab === "chat" ? "Chat" : tab === "tasks" ? "Tasks" : tab === "automations" ? "Automations" : "Connectors";
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, color: isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: "10px 14px", fontFamily: "inherit", borderBottom: `2px solid ${isActive ? "rgba(255,255,255,0.50)" : "transparent"}`, marginBottom: -1, transition: "all 200ms" }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
            >{label}</button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeTab === "chat" ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
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
        ) : activeTab === "tasks" ? (
          <TasksPanel cloneId={conv.clone_id} />
        ) : activeTab === "automations" ? (
          <AutomationsPanel cloneId={conv.clone_id} />
        ) : (
          <ConnectorsPanel cloneId={conv.clone_id} />
        )}
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", overflow: "hidden" }}>
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
