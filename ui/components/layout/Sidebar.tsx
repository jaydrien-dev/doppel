"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
import { useClone } from "@/lib/hooks/useClone";
import { useTour } from "@/components/tour/TourProvider";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const CLONE: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.9"/>
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.5"/>
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.5"/>
        <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.3"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/activity",
    label: "Activity",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M1.5 8h2.5l2-5 3 10 2-5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/clones",
    label: "My Clones",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5.5" r="2" fill="currentColor" opacity="0.8"/>
        <circle cx="11" cy="5.5" r="1.6" fill="currentColor" opacity="0.45"/>
        <path d="M1.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
        <path d="M11 9c1.8.3 3 1.7 3 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/train",
    label: "Train",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.5"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/identity",
    label: "Identity",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.5" r="2.5" fill="currentColor" opacity="0.7"/>
        <path d="M2.5 14c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/brain",
    label: "Brain",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.2" fill="currentColor" opacity="0.9"/>
        <circle cx="3" cy="4.5" r="1.5" fill="currentColor" opacity="0.4"/>
        <circle cx="13" cy="4.5" r="1.5" fill="currentColor" opacity="0.4"/>
        <circle cx="3" cy="11.5" r="1.5" fill="currentColor" opacity="0.4"/>
        <circle cx="13" cy="11.5" r="1.5" fill="currentColor" opacity="0.4"/>
        <path d="M4.5 5L6.2 6.8M9.8 9.2L11.5 11M11.5 5L9.8 6.8M6.2 9.2L4.5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/test",
    label: "Test",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M5 13.5L7 9.5M9 9.5L11 13.5M4 5H12L10 9.5H6L4 5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
        <path d="M6.5 2.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/deploy",
    label: "Deploy",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L13 7L8 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
        <path d="M3 7H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/>
      </svg>
    ),
  },
];

const MARKETPLACE: NavItem[] = [
  {
    href: "/marketplace",
    label: "Browse",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.7"/>
        <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.8"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/earnings",
    label: "Earnings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12L5.5 8l3 2 3-5 2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
        <path d="M2 14.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.35"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/credits",
    label: "Credits",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.6"/>
        <path d="M8 5v6M5.5 7h4a1 1 0 010 2H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/bundles",
    label: "Bundles",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.65"/>
        <path d="M5 5V4a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
        <path d="M5.5 10h5M5.5 12h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
      </svg>
    ),
  },
  {
    href: "/marketplace/bundles",
    label: "Browse Bundles",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.65"/>
      </svg>
    ),
  },
];

const SURFACES: NavItem[] = [
  {
    href: "/dashboard/email",
    label: "Email",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/>
        <path d="M1.5 6l6.5 4.5L14.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      </svg>
    ),
  },
];

const ACCOUNT: NavItem[] = [
  {
    href: "/dashboard/billing",
    label: "Billing",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/>
        <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" opacity="0.5"/>
        <rect x="3.5" y="9" width="3" height="1.5" rx="0.5" fill="currentColor" opacity="0.5"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/api",
    label: "Developer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.6"/>
        <path d="M5 7L3.5 8.5 5 10M11 7l1.5 1.5L11 10M8.5 6l-1.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/>
        <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.27 1.27M11.33 11.33l1.27 1.27M12.6 3.4l-1.27 1.27M4.67 11.33l-1.27 1.27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
];

const GROUPS = [
  { label: "Clone",       items: CLONE,       color: "#1A73E8" },
  { label: "Marketplace", items: MARKETPLACE, color: "#34A853" },
  { label: "Surfaces",    items: SURFACES,    color: "#EA4335" },
  { label: "Account",     items: ACCOUNT,     color: "#F59E0B" },
];

function NavGroup({ label, items, color }: { label: string; items: NavItem[]; color: string }) {
  const pathname = usePathname();
  return (
    <div className="sb__group">
      <div className="sb__group-label" style={{ color }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(({ href, label: itemLabel, icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`sb__item${active ? " sb__item--active" : ""}`}
              style={active ? { "--active-color": color } as React.CSSProperties : {}}
            >
              <span className="sb__item-icon">{icon}</span>
              {itemLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sb">
      {/* Brand */}
      <Link href="/" className="sb__brand" style={{ textDecoration: "none" }}>
        <div className="sb__brand-mark" />
        <span className="sb__brand-name">doppel</span>
      </Link>

      {/* Home shortcut */}
      <HomeButton />

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto" }}>
        {GROUPS.map((g) => (
          <NavGroup key={g.label} label={g.label} items={g.items} color={g.color} />
        ))}
      </nav>

      {/* Utilities */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
        <TourButton />
        <AdminLink />
      </div>

      {/* User footer */}
      <div className="sb__footer">
        <UserFooter />
      </div>
    </aside>
  );
}

function AdminLink() {
  const { user } = useUser();
  if (user?.id !== process.env.NEXT_PUBLIC_ADMIN_USER_ID) return null;
  return (
    <Link href="/dashboard/admin" className="sb__util sb__util--ent">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M6.5 4v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      Admin
    </Link>
  );
}

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Pro",
  enterprise_max: "Max",
};

function UserFooter() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { clone } = useClone();
  const tier = clone?.subscription_tier ?? "free";
  const name = user?.firstName ?? user?.username ?? "Account";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 4px 0" }}>
      <div className="sb__user">
        <UserButton appearance={{ elements: { avatarBox: "w-7 h-7 shrink-0" } }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sb__user-name">{name}</div>
          <span
            className="sb__user-tier"
            style={
              tier === "personal"
                ? { background: "rgba(26,115,232,0.12)", color: "#6BAEFF" }
                : tier === "enterprise_max"
                ? { background: "rgba(251,191,36,0.10)", color: "#FCD34D" }
                : {}
            }
          >
            {TIER_LABEL[tier] ?? tier}
          </span>
        </div>
      </div>
      <button onClick={() => signOut({ redirectUrl: "/" })} className="sb__util">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4.5 2H2a.5.5 0 00-.5.5v7A.5.5 0 002 10h2.5M8 3.5L10 6l-2 2.5M10 6H4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Sign out
      </button>
    </div>
  );
}

function HomeButton() {
  return (
    <Link
      href="/home"
      style={{
        display: "flex", alignItems: "center", gap: 9,
        margin: "0 4px 8px",
        padding: "8px 10px", borderRadius: 12,
        background: "rgba(26,115,232,0.10)",
        border: "1px solid rgba(26,115,232,0.22)",
        color: "#6BAEFF", textDecoration: "none",
        fontSize: 13, fontWeight: 500,
        transition: "all 180ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,115,232,0.18)"; e.currentTarget.style.borderColor = "rgba(26,115,232,0.36)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(26,115,232,0.10)"; e.currentTarget.style.borderColor = "rgba(26,115,232,0.22)"; }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M10 1H4a1 1 0 00-1 1v8a1 1 0 001 1h1.5V9h3v2H10a1 1 0 001-1V2a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
        <path d="M1 5.5l6-4 6 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Go to Home
    </Link>
  );
}

function TourButton() {
  const { startTour } = useTour();

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => startTour("getting_started")} className="sb__util">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5 5c0-1.1.9-1.5 1.5-1.5S8 4 8 5c0 .8-.5 1.2-1 1.5-.5.3-.5.7-.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="6.5" cy="9" r=".6" fill="currentColor"/>
        </svg>
        Take a tour
      </button>
    </div>
  );
}
