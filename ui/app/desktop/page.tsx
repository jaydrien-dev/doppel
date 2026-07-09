"use client";

import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { useClones } from "@/lib/hooks/useClones";
import type { CloneOwnerInfo } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PALETTE = [
  "#1A73E8","#7B1FA2","#E91E63","#F57C00",
  "#2E7D32","#546E7A","#00838F","#8E24AA",
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function ISignOut() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M10 3h3a1 1 0 011 1v8a1 1 0 01-1 1h-3M7 11l3-3-3-3M10 8H2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Clone avatar ──────────────────────────────────────────────────────────────

function CloneAvatar({
  clone, size = 32,
}: {
  clone: Pick<CloneOwnerInfo, "display_name" | "avatar_url">;
  size?: number;
}) {
  const color = avatarColor(clone.display_name);
  const initial = clone.display_name[0]?.toUpperCase() ?? "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.34, flexShrink: 0,
      background: clone.avatar_url ? "transparent" : color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 500, color: "#fff",
      overflow: "hidden",
    }}>
      {clone.avatar_url
        ? <img src={clone.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initial}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function DesktopSidebar({
  open,
  clones,
  active,
  onSelect,
  onToggle,
}: {
  open: boolean;
  clones: CloneOwnerInfo[];
  active: CloneOwnerInfo | null;
  onSelect: (c: CloneOwnerInfo) => void;
  onToggle: () => void;
}) {
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <div style={{
      position: "relative",
      width: open ? 240 : 0,
      flexShrink: 0,
      transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
      borderRight: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* Inner — fixed-width so content doesn't wrap during collapse */}
      <div style={{
        width: 240, height: "100%", display: "flex", flexDirection: "column",
        background: "rgba(255,255,255,0.02)",
      }}>

        {/* Header */}
        <div style={{
          padding: "16px 14px 10px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.85)" }}>
            doppel
          </span>
          {/* New clone button */}
          <a
            href="/dashboard/clones"
            title="Manage clones"
            style={{
              width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center",
              justifyContent: "center", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
              color: "rgba(255,255,255,0.45)", cursor: "pointer", transition: "all 150ms",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            <IPlus />
          </a>
        </div>

        {/* Section label */}
        <div style={{ padding: "0 14px 6px" }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: 0 }}>
            Your Clones
          </p>
        </div>

        {/* Clone list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
          {clones.length === 0 && (
            <div style={{ padding: "20px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: 0 }}>No clones yet</p>
              <a href="/dashboard/clones" style={{
                display: "inline-block", marginTop: 10, fontSize: 12,
                color: "rgba(255,255,255,0.55)", textDecoration: "none",
              }}>Create one →</a>
            </div>
          )}
          {clones.map(clone => {
            const isActive = active?.clone_id === clone.clone_id;
            return (
              <button
                key={clone.clone_id}
                onClick={() => onSelect(clone)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: isActive ? "rgba(255,255,255,0.07)" : "transparent",
                  transition: "background 150ms",
                  textAlign: "left",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <CloneAvatar clone={clone} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: isActive ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.70)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {clone.display_name}
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    @{clone.handle}
                  </p>
                </div>
                {isActive && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.45)", flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: "10px 10px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {/* User avatar */}
          {user?.imageUrl
            ? <img src={user.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
            : (
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.70)",
              }}>
                {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?"}
              </div>
            )
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.70)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? ""}
            </p>
          </div>
          <button
            onClick={() => signOut()}
            title="Sign out"
            style={{
              width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center",
              justifyContent: "center", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer",
              color: "rgba(255,255,255,0.35)", transition: "all 150ms", flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          >
            <ISignOut />
          </button>
        </div>
      </div>

      {/* Collapse toggle — pinned to the right edge of the sidebar */}
      <button
        onClick={onToggle}
        title={open ? "Collapse sidebar" : "Expand sidebar"}
        style={{
          position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)",
          width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
          color: "rgba(255,255,255,0.50)", zIndex: 10, transition: "all 150ms",
          boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.85)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.50)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
      >
        {open ? <IChevronLeft /> : <IChevronRight />}
      </button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function NoCloneSelected() {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="8" r="3.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4"/>
          <path d="M4 19c0-3.866 3.134-7 7-7h.5c3.866 0 7 3.134 7 7" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.55)", margin: "0 0 6px" }}>
          Select a clone
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: 0 }}>
          Choose a clone from the sidebar to start chatting
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DesktopPage() {
  const { clones, isLoading } = useClones();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [active, setActive] = useState<CloneOwnerInfo | null>(null);

  // Auto-select first clone once loaded
  useEffect(() => {
    if (clones.length > 0 && !active) {
      setActive(clones[0]);
    }
  }, [clones, active]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Collapsed-sidebar trigger strip (visible when sidebar is closed) */}
      {!sidebarOpen && (
        <div style={{ width: 0, position: "relative", flexShrink: 0 }}>
          {/* The toggle button is rendered by the sidebar itself, absolutely positioned */}
        </div>
      )}

      <DesktopSidebar
        open={sidebarOpen}
        clones={clones}
        active={active}
        onSelect={setActive}
        onToggle={() => setSidebarOpen(o => !o)}
      />

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Loading…</p>
          </div>
        ) : active ? (
          <ChatInterface
            key={active.clone_id}
            cloneId={active.clone_id}
            cloneHandle={active.handle}
            cloneName={active.display_name}
            cloneAvatarUrl={active.avatar_url ?? null}
            ownerMode={true}
          />
        ) : (
          <NoCloneSelected />
        )}
      </div>
    </div>
  );
}
