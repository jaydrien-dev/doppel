"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "Bundles",     href: "/marketplace/bundles" },
];

function pillStyle(active: boolean) {
  return {
    padding: "7px 16px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)",
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
    transition: "all 180ms cubic-bezier(0.25,0.46,0.45,0.94)",
    display: "inline-block",
  };
}

export function MarketplaceActionBar() {
  const pathname = usePathname();
  const [lastHandle, setLastHandle] = useState<string | null>(null);

  useEffect(() => {
    // Track last-viewed clone for the Clone detail + Chat pills
    const match = pathname.match(/^\/marketplace\/([^/]+)$/);
    if (match && match[1] !== "bundles") {
      setLastHandle(match[1]);
      try { localStorage.setItem("doppel_last_handle", match[1]); } catch { /* ignore */ }
    } else {
      try {
        const stored = localStorage.getItem("doppel_last_handle");
        if (stored) setLastHandle(stored);
      } catch { /* ignore */ }
    }
  }, [pathname]);

  const chatHref = lastHandle ? `/home?clone=${lastHandle}` : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "rgba(8,8,8,0.92)",
        backdropFilter: "blur(16px) saturate(140%)",
        WebkitBackdropFilter: "blur(16px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 999,
        padding: 4,
        display: "flex",
        alignItems: "center",
        gap: 2,
        boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
      }}
    >
      {/* Static nav pills */}
      {NAV_ITEMS.map(({ label, href }) => {
        const active =
          href === "/marketplace"
            ? pathname === "/marketplace"
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href} style={pillStyle(active)}>{label}</Link>
        );
      })}

      {/* Chat CTA — appears once a clone has been viewed */}
      {chatHref && (
        <>
          <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)", margin: "0 2px", flexShrink: 0 }} />
          <Link
            href={chatHref}
            style={{
              padding: "7px 18px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.90)",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.14)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "all 180ms cubic-bezier(0.25,0.46,0.45,0.94)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M10 1H2a1 1 0 00-1 1v6a1 1 0 001 1h1v2l3-2h4a1 1 0 001-1V2a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Chat
          </Link>
        </>
      )}
    </div>
  );
}
