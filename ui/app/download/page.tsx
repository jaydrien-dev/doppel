"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Placeholder download page — swap these hrefs for actual GitHub Release / CDN URLs
const RELEASES = {
  mac:     "/releases/doppel-latest.dmg",
  windows: "/releases/doppel-latest-setup.exe",
};

export default function DownloadPage() {
  const [platform, setPlatform] = useState<"mac" | "win" | "other">("other");

  useEffect(() => {
    if (navigator.userAgent.includes("Win")) setPlatform("win");
    else if (navigator.userAgent.includes("Mac")) setPlatform("mac");
  }, []);

  const primary   = platform === "win"  ? "windows" : "mac";
  const secondary = platform === "win"  ? "mac"      : "windows";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-sans)",
      gap: 0, padding: "40px 24px",
    }}>
      <Link href="/" style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", textDecoration: "none", marginBottom: 48, letterSpacing: "-0.01em" }}>
        ← doppel
      </Link>

      <p style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
        Desktop app
      </p>
      <h1 style={{ margin: "0 0 12px", fontSize: "clamp(32px,5vw,52px)", fontWeight: 300, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.85)", textAlign: "center" }}>
        Download Screenwatch
      </h1>
      <p style={{ margin: "0 0 48px", fontSize: 15, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.6, maxWidth: 400 }}>
        The overlay that watches your screen, hears your voice, and responds in real time.
      </p>

      {/* Primary platform */}
      <a
        href={primary === "windows" ? RELEASES.windows : RELEASES.mac}
        download
        style={{
          display: "inline-flex", alignItems: "center", gap: 12,
          padding: "16px 32px", borderRadius: 14,
          background: "rgba(255,255,255,0.09)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "rgba(255,255,255,0.88)",
          fontSize: 15, fontWeight: 500, textDecoration: "none",
          marginBottom: 12,
          transition: "all 200ms ease",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.13)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
      >
        {primary === "mac" ? (
          <svg width="18" height="18" viewBox="0 0 14 14" fill="currentColor" opacity="0.8">
            <path d="M10.2 0c.07.9-.26 1.8-.77 2.45-.52.66-1.35 1.17-2.18 1.1-.1-.85.3-1.75.78-2.37C8.54.53 9.43.05 10.2 0zM13 9.6c-.34.76-.5 1.1-.94 1.77-.6.91-1.45 2.04-2.5 2.06-.94.01-1.18-.6-2.45-.59-1.27.01-1.53.6-2.48.59-1.04-.02-1.85-1.04-2.46-1.96C.76 9.7.5 7.2 1.35 5.56c.6-1.18 1.68-1.87 2.82-1.87 1.05 0 1.71.61 2.58.61.84 0 1.35-.61 2.56-.61 1.02 0 1.98.56 2.58 1.52-.2.12-2.23 1.3-2 3.79.2 2.06 1.97 2.74 2.11 2.8-.02.03 0 .02 0 0z"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" opacity="0.8">
            <path d="M0 2.1L5.7 1.3v5.4H0V2.1zM6.4 1.2L14 0v6.7H6.4V1.2zM0 7.3h5.7V12.7L0 11.9V7.3zM6.4 7.3H14V14l-7.6-1.1V7.3z"/>
          </svg>
        )}
        Download for {primary === "mac" ? "macOS" : "Windows"}
        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(52,211,153,0.14)", color: "rgba(52,211,153,0.80)", border: "1px solid rgba(52,211,153,0.20)" }}>
          Recommended
        </span>
      </a>

      {/* Secondary platform */}
      <a
        href={secondary === "windows" ? RELEASES.windows : RELEASES.mac}
        download
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "10px 20px", borderRadius: 10,
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.40)",
          fontSize: 13, fontWeight: 500, textDecoration: "none",
          marginBottom: 40,
          transition: "all 200ms ease",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.40)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
      >
        Also available for {secondary === "mac" ? "macOS" : "Windows"}
      </a>

      <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.20)", textAlign: "center" }}>
        Requires macOS 12+ or Windows 10 · Free · No account needed to try
      </p>
    </div>
  );
}
