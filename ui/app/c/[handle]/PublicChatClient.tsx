"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ChatInterface } from "@/components/chat/ChatInterface";
import type { ClonePublicInfo } from "@/lib/types";


type KnowledgeArea = { area: string; depth: string; fact_count: number };

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

// Consent values: null = not yet asked, true = accepted, false = declined (anonymous)
type ConsentState = null | boolean;

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
  const [knowledgeAreas, setKnowledgeAreas] = useState<KnowledgeArea[] | null>(null);

  // Consent gate — null means we're still loading
  const [consent, setConsent] = useState<ConsentState | "loading">("loading");

  // Persist session ID per clone so history survives page refreshes.
  const [sessionId, setSessionId] = useState<string>("");

  // Load consent status on mount
  useEffect(() => {
    if (!isSignedIn) {
      setConsent(null); // not signed in — skip consent, no memory built
      return;
    }
    fetch(`/api/clones/${clone.handle}/consent`)
      .then((r) => r.json())
      .then((d) => setConsent(d.consent ?? null))
      .catch(() => setConsent(null));
  }, [isSignedIn, clone.handle]);

  // Resolve session ID
  useEffect(() => {
    const key = `doppel_session:${clone.handle}`;

    async function resolveSession() {
      if (isSignedIn) {
        try {
          const res = await fetch(`/api/consumer/session?clone_handle=${encodeURIComponent(clone.handle)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.session_id) {
              localStorage.setItem(key, data.session_id);
              setSessionId(data.session_id);
              return;
            }
          }
        } catch { /* non-fatal */ }
      }

      const existing = localStorage.getItem(key);
      if (existing) {
        setSessionId(existing);
      } else {
        const fresh = crypto.randomUUID();
        localStorage.setItem(key, fresh);
        setSessionId(fresh);
      }
    }

    resolveSession();
  }, [clone.handle, isSignedIn]);

  function startNewConversation() {
    const fresh = crypto.randomUUID();
    localStorage.setItem(`doppel_session:${clone.handle}`, fresh);
    try { localStorage.removeItem(`doppel_chat:${clone.clone_id}`); } catch { /* non-fatal */ }
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

  useEffect(() => {
    fetch(`/api/clones/${clone.handle}/knowledge-map`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.areas?.length) setKnowledgeAreas(d.areas); })
      .catch(() => {});
  }, [clone.handle]);

  async function handleConsent(accepted: boolean) {
    setConsent(accepted);
    try {
      await fetch(`/api/clones/${clone.handle}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: accepted }),
      });
    } catch { /* non-fatal */ }
  }

  const isReturning = profile?.exists && (profile.total_sessions ?? 0) > 1;
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [profileDeleted, setProfileDeleted] = useState(false);

  async function handleDeleteProfile() {
    if (deletingProfile) return;
    setDeletingProfile(true);
    try {
      await fetch(`/api/clones/${clone.handle}/my-profile`, { method: "DELETE" });
      // Also reset consent so the prompt shows again on next visit
      await fetch(`/api/clones/${clone.handle}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: false }),
      });
      setProfile(null);
      setProfileDeleted(true);
      setShowPrivacy(false);
      setConsent(false);
    } catch { /* non-fatal */ } finally { setDeletingProfile(false); }
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: clone.display_name, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  // Show consent prompt for signed-in users who haven't answered yet
  const showConsentPrompt = isSignedIn && consent === null;

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

      {/* First-chat consent prompt */}
      {showConsentPrompt && (
        <div style={{
          margin: "10px 14px 0",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "12px 14px",
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 4px", fontWeight: 500 }}>
            Can {clone.display_name} remember you?
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.55, margin: "0 0 10px" }}>
            After a few chats, the clone can remember who you are and give you more relevant answers.
            Your conversations are never shared with other users.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleConsent(true)}
              style={{
                fontSize: 11, fontWeight: 500, padding: "5px 14px",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Yes, remember me
            </button>
            <button
              onClick={() => handleConsent(false)}
              style={{
                fontSize: 11, padding: "5px 14px",
                background: "none", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8, color: "rgba(255,255,255,0.30)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Stay anonymous
            </button>
          </div>
        </div>
      )}

      {/* Returning consumer banner */}
      {isReturning && !showConsentPrompt && (
        <div className="chat-banner">
          <span className="chat-banner__pill">
            <ISparkle />
            {clone.display_name} remembers you from {profile!.total_sessions} previous conversation{profile!.total_sessions !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Chat interface — only mount once sessionId is resolved from localStorage */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {sessionId && consent !== "loading" && (
          <ChatInterface
            key={sessionId}
            cloneId={clone.clone_id}
            cloneHandle={clone.handle}
            cloneName={clone.display_name}
            cloneColor={cloneColor}
            contextType="chat"
            ownerMode={false}
            knowledgeAreas={knowledgeAreas ?? undefined}
            placeholder={`Ask ${clone.display_name} anything…`}
            initialInput={prefillQ}
            pricePerQuery={clone.price_per_query ?? 0}
            sessionId={sessionId}
          />
        )}
      </div>

      {/* Consumer data transparency footer */}
      {isSignedIn && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 16px", flexShrink: 0 }}>
          {!showPrivacy ? (
            <button
              onClick={() => setShowPrivacy(true)}
              style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5 }}
              onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.22)"; }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L2 3v3.5c0 2.3 1.7 4.4 4 5 2.3-.6 4-2.7 4-5V3L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              What does {clone.display_name} know about me?
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", margin: 0 }}>What this clone knows about you</p>
                <button onClick={() => setShowPrivacy(false)} style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
              </div>
              {profileDeleted ? (
                <p style={{ fontSize: 11, color: "rgba(52,211,153,0.65)", margin: 0 }}>All memory deleted. The clone no longer recognises you.</p>
              ) : profile?.exists ? (
                <>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.55, margin: 0 }}>
                    {profile.summary
                      ? profile.summary
                      : `${clone.display_name} has spoken with you ${profile.total_sessions ?? 1} time${(profile.total_sessions ?? 1) !== 1 ? "s" : ""}. No detailed notes yet.`}
                  </p>
                  <button
                    onClick={handleDeleteProfile}
                    disabled={deletingProfile}
                    style={{ alignSelf: "flex-start", fontSize: 10, color: "rgba(248,113,113,0.55)", background: "none", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "rgba(248,113,113,0.80)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.35)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(248,113,113,0.55)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.18)"; }}
                  >
                    {deletingProfile ? "Deleting…" : "Delete all memory"}
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0, lineHeight: 1.55 }}>
                  {clone.display_name} doesn&apos;t have notes about you yet. This builds up over a few conversations.
                  Your chats are never shared with other users.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
