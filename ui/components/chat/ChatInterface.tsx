"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/hooks/useChat";
import type { ContextType } from "@/lib/types";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      setOverlay: (val: boolean) => void;
      onOverlayChanged: (cb: (val: boolean) => void) => () => void;
    };
  }
}
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface KnowledgeArea {
  area: string;
  depth: string;
  fact_count?: number;
}

interface ChatInterfaceProps {
  cloneId: string;
  cloneHandle?: string;
  cloneName?: string;
  cloneColor?: string;
  cloneAvatarUrl?: string | null;
  contextType?: ContextType;
  ownerMode?: boolean;
  knowledgeAreas?: KnowledgeArea[];
  placeholder?: string;
  onFirstMessage?: () => void;
  initialInput?: string;
  pricePerQuery?: number;
  sessionId?: string;
}

const COLOR_PALETTE = [
  "#1A73E8", "#7B1FA2", "#E91E63", "#F57C00",
  "#2E7D32", "#546E7A", "#00838F", "#8E24AA",
];
function deriveColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const IPaperclip = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M11 7L7 11a2 2 0 11-3-3l5-5a3 3 0 014 4L7 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ISend = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/>
  </svg>
);
const IBolt = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor"/>
  </svg>
);
const IMsg = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M2 4a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0112 4v4a1.5 1.5 0 01-1.5 1.5H6L3 12V9.5H2.5A.5.5 0 012 9V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const ISparkle = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/>
  </svg>
);
const IDownload = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
    <path d="M6 1v7M3 6l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IMic = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M3 8a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IMicOff = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M1 1l14 14M6.5 6.5A2.5 2.5 0 0010.5 10M5.5 4A2.5 2.5 0 0110.5 6.5v1.5M3 8a5 5 0 008.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IVolume = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 5.5h2.5L9 2v12L4.5 10.5H2v-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M11.5 5.5a3 3 0 010 5M13.5 3.5a6 6 0 010 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IVolumeMute = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 5.5h2.5L9 2v12L4.5 10.5H2v-5zM13 5l-4 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IPhone = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M2 4a2 2 0 012-2h1l2 4-1.5 1a8 8 0 003.5 3.5L10.5 9l4 2v1a2 2 0 01-2 2A12 12 0 012 4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" opacity="0.7"/>
  </svg>
);
const IPin = ({ active }: { active?: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M10 2l4 4-2 2-1-1-3 3v2l-1 1-3-3 1-1h2L10 6l-1-1 1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill={active ? "currentColor" : "none"} opacity={active ? 0.7 : 1}/>
    <line x1="3" y1="13" x2="6" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IBook = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M4 4h7a4 4 0 014 4v12H5a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M20 4h-5a4 4 0 00-4 4v12h8a1 1 0 001-1V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M8 9h4M8 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const ISearchIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 11h6M11 8v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IImageIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="8.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ---------------------------------------------------------------------------
// Summary modal
// ---------------------------------------------------------------------------
function SummaryModal({ summary, cloneName, onClose }: { summary: string; cloneName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([summary], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cloneName.replace(/\s+/g, "-").toLowerCase()}-summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copy() {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lines = summary.split("\n");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 520, borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", background: "#111", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "80vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-dark-1)", margin: 0 }}>Session Summary</p>
            <p style={{ fontSize: 12, color: "var(--fg-dark-3)", margin: "2px 0 0" }}>From your conversation with {cloneName}</p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-dark-elev-1)", border: "1px solid var(--border-dark)", color: "var(--fg-dark-2)", cursor: "pointer", flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
          {lines.map((line, i) => {
            if (line.startsWith("## ")) return <p key={i} style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.14em", marginTop: i === 0 ? 0 : 16, marginBottom: 4, color: "var(--fg-dark-3)" }}>{line.slice(3)}</p>;
            if (line.startsWith("- ")) return <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--fg-dark-1)" }}><span style={{ marginTop: 6, width: 4, height: 4, borderRadius: "50%", background: "var(--fg-dark-3)", flexShrink: 0 }} /><span>{line.slice(2)}</span></div>;
            if (/^\d+\. /.test(line)) return <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--fg-dark-1)" }}><span style={{ flexShrink: 0, color: "var(--fg-dark-3)" }}>{line.match(/^(\d+)\./)?.[1]}.</span><span>{line.replace(/^\d+\. /, "")}</span></div>;
            if (line.trim()) return <p key={i} style={{ fontSize: 13, color: "var(--fg-dark-2)", margin: 0 }}>{line}</p>;
            return <div key={i} style={{ height: 4 }} />;
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={copy} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", background: "var(--bg-dark-elev-2)", color: "var(--fg-dark-2)", border: "1px solid var(--border-dark)", fontFamily: "inherit" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 4V2.5A1.5 1.5 0 006.5 1H2.5A1.5 1.5 0 001 2.5v4A1.5 1.5 0 002.5 8H4" stroke="currentColor" strokeWidth="1.2"/></svg>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={download} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", background: "var(--bg-dark-elev-2)", color: "var(--fg-dark-2)", border: "1px solid var(--border-dark)", fontFamily: "inherit" }}>
            <IDownload /> Download .md
          </button>
          <button onClick={onClose} style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", background: "transparent", border: "1px solid var(--border-dark)", color: "var(--fg-dark-3)", fontFamily: "inherit" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature Menu popup
// ---------------------------------------------------------------------------
// Feature Menu popup
// ---------------------------------------------------------------------------
function FeatureMenu({
  voiceEnabled,
  canExport,
  summaryLoading,
  onTraining,
  onConversation,
  onToggleVoice,
  onExport,
  onTeaching,
  onFindExpert,
  onShareImage,
  onClose,
}: {
  voiceEnabled: boolean;
  canExport: boolean;
  summaryLoading: boolean;
  onTraining: () => void;
  onConversation: () => void;
  onToggleVoice: () => void;
  onExport: () => void;
  onTeaching: () => void;
  onFindExpert: () => void;
  onShareImage: () => void;
  onClose: () => void;
}) {
  // Close on outside click
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const items: {
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    activeColor: string;
    activeBg: string;
    activeBorder: string;
    isActive?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }[] = [
    {
      label: "Training",
      sublabel: "Clone learns from you",
      activeColor: "rgba(52,211,153,0.85)",
      activeBg: "rgba(52,211,153,0.10)",
      activeBorder: "rgba(52,211,153,0.22)",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 7v1M12 16v1M7 12h1M16 12h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      onClick: () => { onTraining(); onClose(); },
    },
    {
      label: "Conversation",
      sublabel: "Full voice call mode",
      activeColor: "rgba(255,255,255,0.80)",
      activeBg: "rgba(255,255,255,0.07)",
      activeBorder: "rgba(255,255,255,0.16)",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 21h8M12 16v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M9 9l1.5 1.5L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          {[0,1,2].map((i) => (
            <rect key={i} x={8 + i * 2.8} y={10} width="1.4" height={1.5 + i} rx="0.7"
              fill="currentColor" opacity={0.5 + i * 0.2} transform={`translate(0, ${-(i * 0.5)})`}/>
          ))}
        </svg>
      ),
      onClick: () => { onConversation(); onClose(); },
    },
    {
      label: voiceEnabled ? "Voice on" : "Voice",
      sublabel: "Hear clone speak",
      activeColor: voiceEnabled ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.80)",
      activeBg: voiceEnabled ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.07)",
      activeBorder: voiceEnabled ? "rgba(52,211,153,0.22)" : "rgba(255,255,255,0.16)",
      isActive: voiceEnabled,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 11a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      onClick: () => { onToggleVoice(); onClose(); },
    },
    {
      label: "Export",
      sublabel: canExport ? "Summary of this chat" : "4+ messages needed",
      activeColor: canExport ? "rgba(107,174,255,0.85)" : "rgba(255,255,255,0.30)",
      activeBg: canExport ? "rgba(107,174,255,0.08)" : "rgba(255,255,255,0.03)",
      activeBorder: canExport ? "rgba(107,174,255,0.20)" : "rgba(255,255,255,0.07)",
      disabled: !canExport || summaryLoading,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M19 15v4a1 1 0 01-1 1H6a1 1 0 01-1-1v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M12 18v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M9 15l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      onClick: () => { if (canExport) { onExport(); onClose(); } },
    },
    {
      label: "Teaching",
      sublabel: "5-lesson curriculum",
      activeColor: "rgba(251,191,36,0.85)",
      activeBg: "rgba(251,191,36,0.08)",
      activeBorder: "rgba(251,191,36,0.20)",
      icon: <IBook />,
      onClick: () => { onTeaching(); onClose(); },
    },
    {
      label: "Find Expert",
      sublabel: "Best clone for your Q",
      activeColor: "rgba(96,165,250,0.85)",
      activeBg: "rgba(96,165,250,0.08)",
      activeBorder: "rgba(96,165,250,0.20)",
      icon: <ISearchIcon />,
      onClick: () => { onFindExpert(); onClose(); },
    },
    {
      label: "Share Image",
      sublabel: "Attach a screenshot",
      activeColor: "rgba(34,211,238,0.85)",
      activeBg: "rgba(34,211,238,0.08)",
      activeBorder: "rgba(34,211,238,0.20)",
      icon: <IImageIcon />,
      onClick: () => { onShareImage(); onClose(); },
    },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: 0,
        zIndex: 40,
        background: "rgba(14,14,14,0.96)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 16,
        padding: "10px 8px",
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        maxWidth: 400,
        backdropFilter: "blur(20px)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.50)",
        animation: "feature-menu-in 120ms ease-out",
      }}
    >
      <style>{`@keyframes feature-menu-in { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }`}</style>
      {/* Arrow */}
      <div style={{
        position: "absolute", bottom: -5, left: 14,
        width: 10, height: 10,
        background: "rgba(14,14,14,0.96)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderTop: "none", borderLeft: "none",
        transform: "rotate(45deg)",
        borderRadius: "0 0 3px 0",
      }} />

      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          disabled={item.disabled}
          title={item.sublabel}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 8, padding: "12px 14px", borderRadius: 12,
            border: `1px solid ${item.disabled ? "rgba(255,255,255,0.07)" : item.activeBorder}`,
            background: item.disabled ? "rgba(255,255,255,0.02)" : item.activeBg,
            color: item.disabled ? "rgba(255,255,255,0.22)" : item.activeColor,
            cursor: item.disabled ? "not-allowed" : "pointer",
            minWidth: 70,
            fontFamily: "inherit",
            transition: "all 130ms",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) {
              e.currentTarget.style.filter = "brightness(1.15)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          <div style={{ opacity: item.disabled ? 0.4 : 1 }}>{item.icon}</div>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "inherit", whiteSpace: "nowrap" }}>
              {summaryLoading && item.label === "Export" ? "Generating…" : item.label}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
              {item.sublabel}
            </p>
          </div>
          {item.isActive && (
            <div style={{
              position: "absolute", top: 8, right: 8,
              width: 6, height: 6, borderRadius: "50%",
              background: item.activeColor,
              boxShadow: `0 0 6px ${item.activeColor}`,
            }} />
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation Mode Overlay
// ---------------------------------------------------------------------------
type ConvState = "idle" | "listening" | "thinking" | "speaking";

function ConversationOverlay({
  cloneName,
  cloneInitial,
  avatarColor,
  convState,
  muted,
  speakerOff,
  onMicTap,
  onToggleMute,
  onToggleSpeaker,
  onExit,
}: {
  cloneName: string;
  cloneInitial: string;
  avatarColor: string;
  convState: ConvState;
  muted: boolean;
  speakerOff: boolean;
  onMicTap: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onExit: () => void;
}) {
  const statusMap: Record<ConvState, { text: string; color: string }> = {
    idle:      { text: "Tap to speak",  color: "rgba(255,255,255,0.35)" },
    listening: { text: "Listening…",    color: "rgba(248,113,113,0.80)" },
    thinking:  { text: "Thinking…",     color: "rgba(255,255,255,0.55)" },
    speaking:  { text: "Speaking",      color: "rgba(52,211,153,0.80)" },
  };

  const status = statusMap[convState];

  // Ring style per state
  const ringStyle = (): React.CSSProperties => {
    if (convState === "listening") return {
      boxShadow: "0 0 0 3px rgba(248,113,113,0.30), 0 0 0 8px rgba(248,113,113,0.10)",
      animation: "conv-ring-pulse 1.2s ease-in-out infinite",
    };
    if (convState === "thinking") return {
      boxShadow: "0 0 0 3px rgba(255,255,255,0.12)",
      animation: "conv-spin 1.4s linear infinite",
      background: `conic-gradient(rgba(255,255,255,0.25) 0deg, transparent 270deg, transparent 360deg), ${avatarColor}`,
    };
    if (convState === "speaking") return {
      boxShadow: "0 0 0 3px rgba(52,211,153,0.35), 0 0 0 10px rgba(52,211,153,0.08)",
      animation: "conv-ring-pulse 0.8s ease-in-out infinite",
    };
    return { boxShadow: "0 0 0 2px rgba(255,255,255,0.08)" };
  };

  // Waveform bars
  const WaveBars = ({ color, count = 5 }: { color: string; count?: number }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 28 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          background: color,
          height: "100%",
          animation: `voice-bar 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
          transformOrigin: "bottom",
        }} />
      ))}
    </div>
  );

  const bigMicActive = convState === "listening";

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      background: "#080808",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "space-between",
      padding: "0 0 40px",
      overflow: "hidden",
    }}>
      {/* Ambient glow behind avatar */}
      <div style={{
        position: "absolute",
        top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 320, height: 320,
        borderRadius: "50%",
        background: convState === "listening"
          ? "rgba(248,113,113,0.04)"
          : convState === "speaking"
          ? "rgba(52,211,153,0.04)"
          : "rgba(255,255,255,0.02)",
        filter: "blur(60px)",
        transition: "background 600ms",
        pointerEvents: "none",
      }} />

      {/* Top bar: exit */}
      <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", padding: "16px 20px" }}>
        <button
          onClick={onExit}
          title="Back to chat"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.40)",
            fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          End call
        </button>
      </div>

      {/* Center: avatar + status */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, flex: 1, justifyContent: "center" }}>

        {/* Avatar with animated ring */}
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: avatarColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, fontWeight: 400, color: "rgba(255,255,255,0.92)",
          position: "relative",
          transition: "box-shadow 400ms",
          ...ringStyle(),
        }}>
          {cloneInitial}
        </div>

        {/* Clone name */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 22, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            {cloneName}
          </p>

          {/* Status + waveform */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minHeight: 50 }}>
            {(convState === "listening" || convState === "speaking") && (
              <WaveBars
                color={convState === "listening" ? "rgba(248,113,113,0.65)" : "rgba(52,211,153,0.65)"}
                count={convState === "speaking" ? 7 : 5}
              />
            )}
            {convState === "thinking" && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "rgba(255,255,255,0.35)",
                    animation: `conv-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <p style={{ margin: 0, fontSize: 14, fontWeight: 400, color: status.color, transition: "color 300ms" }}>
              {status.text}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32, width: "100%", paddingBottom: 8 }}>

        {/* Mute toggle */}
        <button
          onClick={onToggleMute}
          title={muted ? "Unmute" : "Mute"}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.10)",
            background: muted ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)",
            color: muted ? "rgba(248,113,113,0.75)" : "rgba(255,255,255,0.50)",
            cursor: "pointer", transition: "all 150ms",
          }}
        >
          {muted ? <IMicOff /> : <IMic />}
        </button>

        {/* Big mic button — tap to speak */}
        <button
          onClick={onMicTap}
          disabled={convState === "thinking" || convState === "speaking"}
          style={{
            width: 76, height: 76, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: bigMicActive
              ? "1.5px solid rgba(248,113,113,0.35)"
              : "1.5px solid rgba(255,255,255,0.14)",
            background: bigMicActive
              ? "rgba(248,113,113,0.15)"
              : convState === "thinking" || convState === "speaking"
              ? "rgba(255,255,255,0.03)"
              : "rgba(255,255,255,0.08)",
            color: bigMicActive
              ? "rgba(248,113,113,0.90)"
              : convState === "thinking" || convState === "speaking"
              ? "rgba(255,255,255,0.20)"
              : "rgba(255,255,255,0.75)",
            cursor: convState === "thinking" || convState === "speaking" ? "not-allowed" : "pointer",
            transition: "all 200ms",
            boxShadow: bigMicActive ? "0 0 0 12px rgba(248,113,113,0.06)" : "none",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M3 8a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Speaker toggle */}
        <button
          onClick={onToggleSpeaker}
          title={speakerOff ? "Unmute speaker" : "Mute speaker"}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.10)",
            background: speakerOff ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)",
            color: speakerOff ? "rgba(248,113,113,0.75)" : "rgba(255,255,255,0.50)",
            cursor: "pointer", transition: "all 150ms",
          }}
        >
          {speakerOff ? <IVolumeMute /> : <IVolume />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teaching Mode Overlay
// ---------------------------------------------------------------------------
interface TeachingLesson { title: string; description: string; difficulty: string; }

function TeachingOverlay({
  cloneId,
  cloneName,
  cloneInitial,
  avatarColor,
  onClose,
  onSelectLesson,
}: {
  cloneId: string;
  cloneName: string;
  cloneInitial: string;
  avatarColor: string;
  onClose: () => void;
  onSelectLesson: (lesson: TeachingLesson) => void;
}) {
  const [step, setStep] = useState<"loading" | "plan">("loading");
  const [lessons, setLessons] = useState<TeachingLesson[]>([]);
  const [calibrated, setCalibrated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/consumer/teaching/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clone_id: cloneId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.lessons?.length) {
          setLessons(data.lessons);
          setCalibrated(data.calibrated ?? false);
          setStep("plan");
        } else {
          setErr(data.error ?? data.detail ?? "Couldn't generate curriculum");
        }
      })
      .catch(() => setErr("Failed to connect to backend"));
  }, [cloneId]);

  const difficultyColor: Record<string, string> = {
    beginner: "rgba(52,211,153,0.75)",
    intermediate: "rgba(251,191,36,0.75)",
    advanced: "rgba(248,113,113,0.75)",
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "#080808", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.90)", flexShrink: 0 }}>
            {cloneInitial}
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>{cloneName} · Teaching Mode</span>
        </div>
        <button onClick={onClose} style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>Close</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {step === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginTop: 40 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.20)", borderTopColor: "rgba(255,255,255,0.60)", animation: "spin 0.8s linear infinite" }} />
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: 0 }}>{cloneName} is building your curriculum…</p>
          </div>
        )}

        {step === "plan" && (
          <>
            <div style={{ marginBottom: 4 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(251,191,36,0.55)", margin: "0 0 4px" }}>Your curriculum</p>
              <p style={{ fontSize: 20, fontWeight: 300, color: "rgba(255,255,255,0.85)", margin: "0 0 4px", letterSpacing: "-0.01em" }}>Pick a lesson to start</p>
              {calibrated && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", margin: 0 }}>Calibrated to your brain — content matches your level.</p>
              )}
            </div>
            {err && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: 0 }}>{err}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lessons.map((lesson, i) => {
                const dc = difficultyColor[lesson.difficulty] ?? "rgba(255,255,255,0.50)";
                return (
                  <button
                    key={i}
                    onClick={() => { onSelectLesson(lesson); onClose(); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 12, width: "100%", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 150ms" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 500, color: "rgba(251,191,36,0.70)" }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.80)" }}>{lesson.title}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>{lesson.description}</p>
                      <span style={{ display: "inline-block", fontSize: 10, textTransform: "capitalize", color: dc, background: dc.replace("0.75)", "0.08)"), border: `1px solid ${dc.replace("0.75)", "0.18)")}`, borderRadius: 6, padding: "2px 7px" }}>
                        {lesson.difficulty}
                      </span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expert Match Modal
// ---------------------------------------------------------------------------
function ExpertMatchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ clone_id: string; name: string; handle: string; description: string; score: number }[]>([]);
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function search() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/marketplace/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query.trim() }),
      });
      const data = await res.json();
      if (data.matches) {
        setResults(data.matches);
        setSearched(true);
      } else {
        setErr(data.error ?? data.detail ?? "No results");
      }
    } catch {
      setErr("Failed to search");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 520, borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", background: "#111", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "80vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0 }}>Find the Right Expert</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>Describe your question — we&apos;ll match you to the best clone</p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)", cursor: "pointer", flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="e.g. How do I raise a seed round?"
              style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "rgba(255,255,255,0.75)", outline: "none", fontFamily: "inherit" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
            />
            <button
              onClick={search}
              disabled={!query.trim() || loading}
              style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: query.trim() ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)", color: query.trim() ? "rgba(96,165,250,0.80)" : "rgba(255,255,255,0.25)", fontSize: 12, fontWeight: 500, cursor: query.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 130ms" }}
            >
              {loading ? "…" : "Search"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {err && <p style={{ fontSize: 12, color: "rgba(248,113,113,0.70)", margin: "8px 0" }}>{err}</p>}
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(96,165,250,0.20)", borderTopColor: "rgba(96,165,250,0.70)", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {!loading && searched && results.length === 0 && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", textAlign: "center", marginTop: 20 }}>No experts found for this question.</p>
          )}
          {!loading && results.map((r) => (
            <button
              key={r.clone_id}
              onClick={() => { window.location.href = `/c/${r.handle}`; }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, width: "100%", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 130ms" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
            >
              <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: `hsl(${(r.handle.charCodeAt(0) * 37) % 360}, 45%, 35%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
                {r.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)" }}>{r.name}</p>
                  <span style={{ fontSize: 10, color: "rgba(96,165,250,0.60)", background: "rgba(96,165,250,0.08)", borderRadius: 4, padding: "1px 5px" }}>{Math.round(r.score * 100)}% match</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description ?? `@${r.handle}`}</p>
              </div>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "rgba(255,255,255,0.22)" }}>
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ))}
          {!searched && !loading && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", textAlign: "center", marginTop: 20, lineHeight: 1.6 }}>
              Type your question to find the expert most likely to give the best answer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatInterface
// ---------------------------------------------------------------------------
type ResponseMode = "fast" | "pro" | "extended";

const MULTIPLIERS: Record<ResponseMode, number> = { fast: 1, pro: 3, extended: 8 };

const MODES: { value: ResponseMode; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    value: "fast",
    label: "Fast",
    hint: "Quick answer · <1s",
    icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" opacity="0.9"/></svg>,
  },
  {
    value: "pro",
    label: "Pro",
    hint: "Scratchpad reasoning · ~4s",
    icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" fill="currentColor" opacity="0.9"/><circle cx="3" cy="4.5" r="1.4" fill="currentColor" opacity="0.4"/><circle cx="13" cy="4.5" r="1.4" fill="currentColor" opacity="0.4"/><circle cx="3" cy="11.5" r="1.4" fill="currentColor" opacity="0.4"/><circle cx="13" cy="11.5" r="1.4" fill="currentColor" opacity="0.4"/><path d="M4.5 5L6.2 6.8M9.8 9.2L11.5 11M11.5 5L9.8 6.8M6.2 9.2L4.5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35"/></svg>,
  },
  {
    value: "extended",
    label: "Extended",
    hint: "Deep thinking · ~15s",
    icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.9"/></svg>,
  },
];

export function ChatInterface({
  cloneId,
  cloneHandle,
  cloneName = "Clone",
  cloneColor,
  cloneAvatarUrl,
  contextType = "chat",
  ownerMode = false,
  knowledgeAreas,
  placeholder = "Ask anything…",
  onFirstMessage,
  initialInput,
  pricePerQuery = 0,
  sessionId: sessionIdProp,
}: ChatInterfaceProps) {
  const { messages, isLoading, isThinking, historyLoading, error, sendMessage, clearMessages, sessionId } = useChat({ cloneId, contextType, sessionId: sessionIdProp, ownerMode });
  const [input, setInput] = useState(initialInput ?? "");

  // Live autocomplete state
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const autoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEmpty = messages.length === 0;

  // Fetch live autocomplete suggestions, debounced 300ms
  useEffect(() => {
    if (!cloneHandle) return;
    // Only show popup on empty state OR when actively typing
    if (!isEmpty && input.trim().length === 0) {
      setAutoSuggestions([]);
      return;
    }
    if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current);
    autoDebounceRef.current = setTimeout(async () => {
      setAutoLoading(true);
      try {
        const res = await fetch(`/api/clones/${cloneHandle}/autocomplete?q=${encodeURIComponent(input.trim())}`);
        const data = await res.json();
        setAutoSuggestions(data.suggestions ?? []);
      } catch {
        setAutoSuggestions([]);
      } finally {
        setAutoLoading(false);
      }
    }, 300);
    return () => { if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current); };
  }, [input, cloneHandle, isEmpty]);

  // Consumer feedback callback — only active when cloneHandle is provided and not owner
  function makeConsFeedback(traceId?: string) {
    if (!cloneHandle || ownerMode) return undefined;
    return (helpful: boolean) => {
      fetch(`/api/clones/${cloneHandle}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trace_id: traceId ?? null, session_id: sessionId ?? null, helpful }),
      }).catch(() => {});
    };
  }
  const [responseMode, setResponseMode] = useState<ResponseMode>("fast");
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "done">("idle");
  const [summaryText, setSummaryText] = useState("");

  // Inline voice (toggle in composer)
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenMsgId = useRef<string | null>(null);

  // Feature menu
  const [featureMenuOpen, setFeatureMenuOpen] = useState(false);

  // Training mode — auto-enable when contextType is "training"
  const [trainingMode, setTrainingMode] = useState(() => contextType === "training");
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [trainingSaved, setTrainingSaved] = useState(false);

  // Conversation mode
  const [convMode, setConvMode] = useState(false);
  const [convState, setConvState] = useState<ConvState>("idle");
  const [convMuted, setConvMuted] = useState(false);   // mic input muted
  const [convSpeakerOff, setConvSpeakerOff] = useState(false); // speaker output muted
  const convLastMsgId = useRef<string | null>(null);
  const convIsLoading = useRef(false);

  // Electron desktop integration
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [isOverlayMode, setIsOverlayMode] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsElectronApp(true);
      // Sync overlay state when changed via hotkey or tray
      const cleanup = window.electronAPI.onOverlayChanged((val) => setIsOverlayMode(val));
      return cleanup;
    }
  }, []);

  // Teaching mode
  const [teachingMode, setTeachingMode] = useState(false);

  // Expert match
  const [expertMatchOpen, setExpertMatchOpen] = useState(false);

  // Image attachment
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const firstMessageFired = useRef(false);

  const avatarColor = cloneColor ?? deriveColor(cloneName);
  const cloneInitial = cloneName[0]?.toUpperCase() ?? "A";
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const showExportButton = userMessageCount >= 4;

  // Scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  // ── Voice helpers ─────────────────────────────────────────────────────────

  async function playVoice(text: string, onEnd?: () => void) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const snippet = text.length > 600 ? text.slice(0, 597) + "…" : text;
    setSpeaking(true);
    try {
      const res = await fetch("/api/consumer/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: snippet, clone_id: cloneId }),
      });
      if (!res.ok) { setSpeaking(false); onEnd?.(); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; onEnd?.(); };
      audio.onerror  = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; onEnd?.(); };
      await audio.play();
    } catch {
      setSpeaking(false);
      onEnd?.();
    }
  }

  function stopAudio() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
  }

  // ── Inline voice (from composer toggle) ───────────────────────────────────

  useEffect(() => {
    if (!voiceEnabled || isLoading || convMode) return;
    const lastMsg = [...messages].reverse().find((m) => m.role === "clone");
    if (!lastMsg?.content || lastMsg.id === lastSpokenMsgId.current) return;
    lastSpokenMsgId.current = lastMsg.id;
    playVoice(lastMsg.content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, voiceEnabled]);

  function startListening(onResult: (transcript: string) => void) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    stopAudio();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend   = () => setListening(false);
    rec.onerror = () => setListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.trim();
      if (transcript) onResult(transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function handleMicClick() {
    if (listening) {
      stopListening();
    } else {
      startListening((transcript) => {
        sendMessage(transcript, responseMode);
        if (!firstMessageFired.current) { firstMessageFired.current = true; onFirstMessage?.(); }
      });
    }
  }

  function toggleVoice() {
    if (voiceEnabled) { stopAudio(); stopListening(); }
    setVoiceEnabled((v) => !v);
  }

  // ── Conversation mode logic ────────────────────────────────────────────────

  // Detect when isLoading transitions false → new assistant message → play it
  useEffect(() => {
    if (!convMode) return;

    if (isLoading) {
      convIsLoading.current = true;
      setConvState("thinking");
      return;
    }

    if (!convIsLoading.current) return; // wasn't loading, skip
    convIsLoading.current = false;

    const lastMsg = [...messages].reverse().find((m) => m.role === "clone");
    if (!lastMsg?.content || lastMsg.id === convLastMsgId.current) {
      setConvState("idle");
      return;
    }
    convLastMsgId.current = lastMsg.id;

    if (convSpeakerOff) {
      setConvState("idle");
      return;
    }

    setConvState("speaking");
    playVoice(lastMsg.content, () => setConvState("idle"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, convMode]);

  function handleConvMicTap() {
    if (convState === "listening") {
      // Stop early — send whatever was heard so far (or nothing)
      stopListening();
      setConvState("idle");
      return;
    }
    if (convState !== "idle") return;
    if (convMuted) return;

    stopAudio();
    setConvState("listening");

    startListening((transcript) => {
      setConvState("thinking");
      sendMessage(transcript, responseMode);
      if (!firstMessageFired.current) { firstMessageFired.current = true; onFirstMessage?.(); }
    });
  }

  function enterConvMode() {
    stopAudio();
    stopListening();
    setConvState("idle");
    setConvMode(true);
  }

  function exitConvMode() {
    stopAudio();
    stopListening();
    setConvState("idle");
    setConvMode(false);
  }

  // ── Normal chat handlers ───────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:image/png;base64,XXXX" — extract base64 part
      const base64 = result.split(",")[1] ?? "";
      setAttachedImage({ base64, mimeType: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  function handleSend() {
    if (!input.trim() && !attachedImage) return;
    if (isLoading) return;
    const meta: Record<string, unknown> = {};
    if (attachedImage) {
      meta.image_base64 = attachedImage.base64;
      meta.image_media_type = attachedImage.mimeType;
    }
    if (trainingMode) {
      meta.training_mode = true;
      meta.training_owner = ownerMode ?? false;
    }
    sendMessage(input || "What do you see in this image?", responseMode, Object.keys(meta).length ? meta : undefined);
    setInput("");
    setAttachedImage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (!firstMessageFired.current) { firstMessageFired.current = true; onFirstMessage?.(); }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (input.trim() || attachedImage) handleSend(); }
  }

  function handleSuggest(q: string) {
    sendMessage(q);
    if (!firstMessageFired.current) { firstMessageFired.current = true; onFirstMessage?.(); }
  }

  async function saveTrainingSession() {
    if (trainingSaving || trainingSaved) return;
    setTrainingSaving(true);
    try {
      await fetch("/api/brain/training/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, session_id: sessionId, is_owner: ownerMode ?? false }),
      });
      setTrainingSaved(true);
      setTimeout(() => { setTrainingSaved(false); setTrainingMode(false); }, 2500);
    } finally {
      setTrainingSaving(false);
    }
  }

  async function exportSummary() {
    if (summaryState === "loading") return;
    setSummaryState("loading");
    try {
      const res = await fetch("/api/brain/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clone_id: cloneId, session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to generate summary");
      setSummaryText(data.summary);
      setSummaryState("done");
    } catch (e) {
      setSummaryState("idle");
      alert(e instanceof Error ? e.message : "Failed to generate summary");
    }
  }


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-dark)", position: "relative" }}>
      {/* Global keyframes */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes voice-bar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
        @keyframes conv-ring-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        @keyframes conv-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes conv-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%           { transform: scale(1);   opacity: 0.8; }
        }
      `}</style>

      {/* Summary modal */}
      {summaryState === "done" && summaryText && (
        <SummaryModal summary={summaryText} cloneName={cloneName}
          onClose={() => { setSummaryState("idle"); setSummaryText(""); }} />
      )}

      {/* Training mode banner */}
      {trainingMode && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 16px", background: "rgba(52,211,153,0.06)",
          borderBottom: "1px solid rgba(52,211,153,0.12)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(52,211,153,0.70)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "rgba(52,211,153,0.70)", fontWeight: 500 }}>
              Training mode
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
              · {ownerMode ? "Clone is filling knowledge gaps" : "Clone is learning about you"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {messages.length >= 4 && (
              <button
                onClick={saveTrainingSession}
                disabled={trainingSaving || trainingSaved}
                style={{
                  padding: "4px 12px", borderRadius: 7, border: "1px solid rgba(52,211,153,0.25)",
                  background: trainingSaved ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.07)",
                  color: "rgba(52,211,153,0.80)", fontSize: 11, fontWeight: 500,
                  cursor: trainingSaving || trainingSaved ? "default" : "pointer",
                  fontFamily: "inherit", transition: "all 150ms",
                }}
              >
                {trainingSaved ? "Saved to brain ✓" : trainingSaving ? "Saving…" : "Save to brain"}
              </button>
            )}
            <button
              onClick={() => setTrainingMode(false)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "inherit", padding: "2px 4px" }}
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Teaching overlay */}
      {teachingMode && (
        <TeachingOverlay
          cloneId={cloneId}
          cloneName={cloneName}
          cloneInitial={cloneInitial}
          avatarColor={avatarColor}
          onClose={() => setTeachingMode(false)}
          onSelectLesson={(lesson) => {
            sendMessage(`Teach me about: ${lesson.title}`, responseMode, { lesson_topic: lesson.title });
            if (!firstMessageFired.current) { firstMessageFired.current = true; onFirstMessage?.(); }
          }}
        />
      )}

      {/* Expert match modal */}
      {expertMatchOpen && <ExpertMatchModal onClose={() => setExpertMatchOpen(false)} />}

      {/* Conversation Mode overlay */}
      {convMode && (
        <ConversationOverlay
          cloneName={cloneName}
          cloneInitial={cloneInitial}
          avatarColor={avatarColor}
          convState={convState}
          muted={convMuted}
          speakerOff={convSpeakerOff}
          onMicTap={handleConvMicTap}
          onToggleMute={() => {
            setConvMuted((m) => !m);
            if (convState === "listening") { stopListening(); setConvState("idle"); }
          }}
          onToggleSpeaker={() => {
            setConvSpeakerOff((s) => !s);
            if (convState === "speaking") { stopAudio(); setConvState("idle"); }
          }}
          onExit={exitConvMode}
        />
      )}

      {/* Normal chat — hidden during conv mode but kept mounted so messages stay */}
      <div style={{ display: convMode ? "none" : "contents" }}>
        {/* Messages scroll area */}
        <div className="chat-scroll" ref={scrollRef}>
          {historyLoading && isEmpty ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 20px" }}>
              {[80, 55, 90, 65].map((w, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: i % 2 === 0 ? "row-reverse" : "row" }}>
                  <div style={{ height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", width: `${w}%`, maxWidth: 320, animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="chat-intro">
              <div className="chat-intro__hdr">
                <div className="chat-intro__av" style={{ background: avatarColor, overflow: "hidden", padding: 0 }}>
                  {cloneAvatarUrl
                    ? <img src={cloneAvatarUrl} alt={cloneName} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : cloneInitial}
                </div>
                <div>
                  <p className="chat-intro__greeting">Hi, I&apos;m {cloneName}</p>
                  <p className="chat-intro__sub">Ask me anything — I&apos;ll answer in their voice.</p>
                </div>
              </div>

              {/* Knowledge areas */}
              {knowledgeAreas && knowledgeAreas.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", margin: "0 0 8px" }}>
                    Knows well
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {knowledgeAreas.map((a, i) => {
                      const opacity =
                        a.depth === "deep" ? 0.75
                        : a.depth === "solid" ? 0.50
                        : 0.32;
                      const bgOpacity =
                        a.depth === "deep" ? 0.10
                        : a.depth === "solid" ? 0.06
                        : 0.03;
                      const borderOpacity =
                        a.depth === "deep" ? 0.18
                        : a.depth === "solid" ? 0.11
                        : 0.06;
                      return (
                        <span key={i} style={{
                          fontSize: 11, fontWeight: 500,
                          padding: "3px 9px", borderRadius: 20,
                          background: `rgba(255,255,255,${bgOpacity})`,
                          border: `1px solid rgba(255,255,255,${borderOpacity})`,
                          color: `rgba(255,255,255,${opacity})`,
                        }}>
                          {a.area}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Training mode prompt */}
              <button
                onClick={() => setTrainingMode(true)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "12px 14px", borderRadius: 12, width: "100%",
                  border: "1px solid rgba(52,211,153,0.14)",
                  background: "rgba(52,211,153,0.04)",
                  cursor: "pointer", textAlign: "left",
                  marginTop: 14, transition: "all 150ms",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(52,211,153,0.08)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.22)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(52,211,153,0.04)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.14)"; }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="rgba(52,211,153,0.80)" strokeWidth="1.2"/>
                    <path d="M5 7l1.5 1.5L9 5.5" stroke="rgba(52,211,153,0.80)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "rgba(52,211,153,0.80)" }}>
                    {ownerMode ? `Train ${cloneName}` : `Let ${cloneName} learn about you`}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.45 }}>
                    {ownerMode
                      ? "Clone asks structured questions to fill its knowledge gaps"
                      : "Clone learns your context · every future response calibrated to you"}
                  </p>
                </div>
              </button>
            </div>
          ) : null}

          {messages.map((msg) => {
            if (msg.isStreaming && !msg.content) return null;
            return (
              <MessageBubble key={msg.id} message={msg}
                cloneId={ownerMode ? cloneId : undefined}
                cloneName={cloneName}
                ownerMode={ownerMode} cloneInitial={cloneInitial} cloneColor={avatarColor}
                onFeedback={makeConsFeedback(msg.trace_id)} />
            );
          })}

          {isLoading && messages.every((m) => !m.isStreaming || !m.content) && (
            isThinking ? (
              <div className="msg msg--ai">
                <div className="msg__av" style={{ background: avatarColor, overflow: "hidden", padding: 0 }}>
                  {cloneAvatarUrl
                    ? <img src={cloneAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : cloneInitial}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
                  <div className="typing"><span className="typing__dot" /><span className="typing__dot" /><span className="typing__dot" /></div>
                  <span style={{ fontSize: 12, color: "var(--fg-dark-3)" }}>Thinking…</span>
                </div>
              </div>
            ) : (
              <TypingIndicator cloneInitial={cloneInitial} cloneColor={avatarColor} />
            )
          )}

          {error && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p style={{ fontSize: 12, color: (error.toLowerCase().includes("credit") || error.toLowerCase().includes("login required")) ? "rgba(248,113,113,0.70)" : "var(--fg-dark-3)" }}>
                {error}
                {error.toLowerCase().includes("credit") && (
                  <a href="/dashboard/billing" style={{ marginLeft: 8, color: "rgba(255,255,255,0.50)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                    Buy credits →
                  </a>
                )}
                {error.toLowerCase().includes("login required") && (
                  <a href="/sign-in" style={{ marginLeft: 8, color: "rgba(255,255,255,0.50)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                    Sign in →
                  </a>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Composer area */}
        <div className="composer-wrap">
          {/* Inline voice status bar */}
          {voiceEnabled && (listening || speaking) && (
            <div style={{ maxWidth: 920, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {listening && (
                <>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[0,1,2,3].map((i) => <div key={i} style={{ width: 3, height: 14, borderRadius: 2, background: "rgba(248,113,113,0.70)", animation: `voice-bar 0.8s ease-in-out ${i*0.12}s infinite alternate` }} />)}
                  </div>
                  <span style={{ fontSize: 12, color: "rgba(248,113,113,0.70)" }}>Listening…</span>
                  <button onClick={stopListening} style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>cancel</button>
                </>
              )}
              {speaking && !listening && (
                <>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[0,1,2,3,4].map((i) => <div key={i} style={{ width: 3, height: 14, borderRadius: 2, background: "rgba(52,211,153,0.70)", animation: `voice-bar 0.6s ease-in-out ${i*0.1}s infinite alternate` }} />)}
                  </div>
                  <span style={{ fontSize: 12, color: "rgba(52,211,153,0.70)" }}>Speaking…</span>
                  <button onClick={stopAudio} style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>stop</button>
                </>
              )}
            </div>
          )}

          {/* Image preview strip */}
          {attachedImage && (
            <div style={{ maxWidth: 920, margin: "0 auto 6px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(34,211,238,0.70)", flexShrink: 0 }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: 12, color: "rgba(34,211,238,0.75)" }}>{attachedImage.filename}</span>
                <button
                  onClick={() => setAttachedImage(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.30)", padding: 0, display: "flex", alignItems: "center" }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          <div style={{ position: "relative", maxWidth: 920, margin: "0 auto" }}>
            {/* Live autocomplete popup */}
            {(autoLoading || autoSuggestions.length > 0) && cloneHandle && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0,
                background: "rgba(14,14,14,0.97)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 14,
                overflow: "hidden",
                zIndex: 20,
                boxShadow: "0 -8px 32px rgba(0,0,0,0.50)",
              } as React.CSSProperties}>
                {autoLoading && autoSuggestions.length === 0 ? (
                  <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.25)", animation: `typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />
                    ))}
                  </div>
                ) : autoSuggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggest(q)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "10px 14px",
                      background: "none", border: "none",
                      borderBottom: i < autoSuggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      transition: "background 100ms",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ color: "rgba(255,255,255,0.22)", flexShrink: 0 }}>
                      <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z"/>
                    </svg>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q}</span>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          <div className="composer" style={{ margin: 0 }}>
            <button className="composer__tool" aria-label="Attach image" title="Attach image" onClick={() => fileInputRef.current?.click()}><IPaperclip /></button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceEnabled && !listening ? "Tap mic to speak, or type…" : placeholder}
              rows={1}
            />
            {voiceEnabled && (
              <button
                className="composer__tool"
                onClick={handleMicClick}
                disabled={isLoading}
                aria-label={listening ? "Stop listening" : "Start speaking"}
                style={{
                  color: listening ? "rgba(248,113,113,0.80)" : "rgba(255,255,255,0.45)",
                  background: listening ? "rgba(248,113,113,0.08)" : "transparent",
                  border: listening ? "1px solid rgba(248,113,113,0.20)" : "1px solid transparent",
                  borderRadius: 8, transition: "all 150ms",
                }}
              >
                <IMic />
              </button>
            )}
            <button className="composer__send" onClick={handleSend} disabled={(!input.trim() && !attachedImage) || isLoading} aria-label="Send">
              <ISend />
            </button>
          </div>
          </div>{/* end relative wrapper */}

          <div className="composer-meta">
            {/* Mode selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
              {MODES.map((m) => {
                const active = responseMode === m.value;
                return (
                  <button key={m.value} onClick={() => setResponseMode(m.value)} title={m.hint}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: active ? "rgba(255,255,255,0.09)" : "transparent", color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", transition: "all 120ms", whiteSpace: "nowrap" }}>
                    {m.icon}{m.label}
                  </button>
                );
              })}
            </div>

            {/* Clear history — only shown when there are messages */}
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                title="Clear chat history"
                disabled={isLoading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 8px", borderRadius: 7, border: "1px solid transparent",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit",
                  background: "transparent",
                  color: "rgba(248,113,113,0.40)",
                  transition: "all 130ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(248,113,113,0.06)";
                  e.currentTarget.style.borderColor = "rgba(248,113,113,0.15)";
                  e.currentTarget.style.color = "rgba(248,113,113,0.70)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.color = "rgba(248,113,113,0.40)";
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M5 3V2h2v1M4.5 9.5V5M7.5 9.5V5M2.5 3l.6 7h5.8l.6-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Clear
              </button>
            )}

            {pricePerQuery > 0 ? (
              <span className="composer-meta__cost">
                <IBolt /> <strong>{Math.ceil(pricePerQuery * MULTIPLIERS[responseMode])} cr</strong> this message
              </span>
            ) : (
              <span className="composer-meta__cost" style={{ opacity: 0.4 }}>Free</span>
            )}

            {/* Feature menu trigger */}
            <div style={{ position: "relative" }}>
              {featureMenuOpen && (
                <FeatureMenu
                  voiceEnabled={voiceEnabled}
                  canExport={showExportButton}
                  summaryLoading={summaryState === "loading"}
                  onTraining={() => setTrainingMode(true)}
                  onConversation={enterConvMode}
                  onToggleVoice={toggleVoice}
                  onExport={exportSummary}
                  onTeaching={() => setTeachingMode(true)}
                  onFindExpert={() => setExpertMatchOpen(true)}
                  onShareImage={() => fileInputRef.current?.click()}
                  onClose={() => setFeatureMenuOpen(false)}
                />
              )}
              <button
                onClick={() => setFeatureMenuOpen((v) => !v)}
                title="Features"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 9px", borderRadius: 7, border: "none",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit",
                  background: featureMenuOpen
                    ? "rgba(255,255,255,0.09)"
                    : voiceEnabled ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
                  color: featureMenuOpen
                    ? "rgba(255,255,255,0.70)"
                    : voiceEnabled ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.35)",
                  transition: "all 130ms",
                }}
              >
                {/* 3×2 grid of dots — "features" icon */}
                <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                  <circle cx="2.5" cy="2.5" r="1.5"/>
                  <circle cx="6.5" cy="2.5" r="1.5"/>
                  <circle cx="10.5" cy="2.5" r="1.5"/>
                  <circle cx="2.5" cy="7.5" r="1.5"/>
                  <circle cx="6.5" cy="7.5" r="1.5"/>
                  <circle cx="10.5" cy="7.5" r="1.5"/>
                </svg>
                Features
                {voiceEnabled && (
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.80)", flexShrink: 0 }} />
                )}
              </button>
            </div>

            {/* Overlay mode button — only rendered inside the Electron desktop app */}
            {isElectronApp && (
              <button
                onClick={() => {
                  const next = !isOverlayMode;
                  setIsOverlayMode(next);
                  window.electronAPI!.setOverlay(next);
                }}
                title={isOverlayMode ? "Exit overlay (Ctrl+Shift+Space)" : "Overlay mode (Ctrl+Shift+Space)"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 7, border: "none",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit",
                  background: isOverlayMode ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
                  color: isOverlayMode ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.30)",
                  transition: "all 130ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.60)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isOverlayMode ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)"; e.currentTarget.style.color = isOverlayMode ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.30)"; }}
              >
                <IPin active={isOverlayMode} />
                {isOverlayMode ? "Overlay on" : "Overlay"}
              </button>
            )}

            <span className="composer-meta__right">Enter · Shift+Enter new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}
