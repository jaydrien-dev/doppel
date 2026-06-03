"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ChatInterface } from "@/components/chat/ChatInterface";
import type { ClonePublicInfo } from "@/lib/types";

const SUGGESTED_DEFAULT: string[] = [
  "What are you working on right now?",
  "How do you make decisions under pressure?",
  "What's your biggest priority this quarter?",
];

const SUGGESTED_ONBOARDING: string[] = [
  "What's the most important thing I should know about your domain?",
  "How do decisions get made on your team?",
  "What trips up new people most often?",
];

// Deterministic avatar color from name
const COLOR_PALETTE = [
  "#1A73E8", "#7B1FA2", "#E91E63", "#F57C00",
  "#2E7D32", "#546E7A", "#00838F", "#8E24AA",
];
function deriveColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

// Icon SVGs
const IBack = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IShare = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 11V2M8 2L5 5M8 2l3 3M3 9v4a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IMore = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/>
  </svg>
);
const INewChat = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const ISparkle = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/>
  </svg>
);

interface ConsumerProfile {
  exists: boolean;
  total_sessions?: number;
  summary?: string;
}

export function PublicChatClient({
  clone,
  isOnboardingResource,
}: {
  clone: ClonePublicInfo;
  isOnboardingResource?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useUser();
  const prefillQ = searchParams.get("q") ?? undefined;
  const [profile, setProfile] = useState<ConsumerProfile | null>(null);
  const suggested = isOnboardingResource ? SUGGESTED_ONBOARDING : SUGGESTED_DEFAULT;

  // Persist session ID per clone so history survives page refreshes
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const key = `doppel_session:${clone.handle}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  });

  function startNewConversation() {
    const fresh = crypto.randomUUID();
    localStorage.setItem(`doppel_session:${clone.handle}`, fresh);
    // Clear stored messages for old session
    try { localStorage.removeItem(`doppel_msgs:${clone.clone_id}:${sessionId}`); } catch { /* non-fatal */ }
    setSessionId(fresh);
  }

  const cloneColor = deriveColor(clone.display_name);
  const cloneInitial = clone.display_name[0]?.toUpperCase() ?? "A";

  useEffect(() => {
    if (!isSignedIn) return;
    fetch(`/api/clones/${clone.handle}/my-profile`)
      .then((r) => r.json())
      .then((d) => setProfile(d))
      .catch(() => {});
  }, [isSignedIn, clone.handle]);

  const isReturning = profile?.exists && (profile.total_sessions ?? 0) > 1;

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: clone.display_name, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Chat header */}
      <header className="chat-hdr">
        <div className="chat-hdr__inner">
          <button className="chat-hdr__back" onClick={() => router.back()} aria-label="Back">
            <IBack />
          </button>
          <div className="chat-hdr__av" style={{ background: cloneColor }}>
            {cloneInitial}
          </div>
          <div className="chat-hdr__id">
            <div className="chat-hdr__name">{clone.display_name}</div>
            <div className="chat-hdr__meta">
              <span>@{clone.handle}</span>
              {isOnboardingResource && (
                <>
                  <span className="chat-hdr__meta__sep">·</span>
                  <span>Knowledge clone</span>
                </>
              )}
            </div>
          </div>
          <div className="chat-hdr__actions">
            <button className="chat-hdr__act" onClick={startNewConversation} aria-label="New conversation" title="New conversation">
              <INewChat />
            </button>
            <button className="chat-hdr__act" onClick={handleShare} aria-label="Share">
              <IShare />
            </button>
            <button className="chat-hdr__act" aria-label="More options">
              <IMore />
            </button>
          </div>
        </div>
      </header>

      {/* Returning consumer banner */}
      {isReturning && (
        <div className="chat-banner">
          <span className="chat-banner__pill">
            <ISparkle />
            {clone.display_name} remembers you from {profile!.total_sessions} previous conversation{profile!.total_sessions !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Chat interface */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatInterface
          key={sessionId}
          cloneId={clone.clone_id}
          cloneName={clone.display_name}
          cloneColor={cloneColor}
          contextType="chat"
          ownerMode={false}
          suggestedQuestions={suggested}
          placeholder={`Ask ${clone.display_name} anything…`}
          initialInput={prefillQ}
          pricePerQuery={clone.price_per_query ?? 0}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}
