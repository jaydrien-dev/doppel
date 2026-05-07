"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
import { useClone } from "@/lib/hooks/useClone";
import { useTour } from "@/components/tour/TourProvider";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const PERSONAL: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="8.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="1.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="8.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/train",
    label: "Train",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 2v11M2 7.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/identity",
    label: "Identity",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2.5 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10.5 3.5l1 1M11.5 7l1-1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/brain",
    label: "Brain",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="2.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="12.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="2.5" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="12.5" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 4.5L6 6.5M9 8.5L11 10.5M11 4.5L9 6.5M6 8.5L4 10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/test",
    label: "Test",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2.5 12.5l3-3m0 0l5-5m-5 5a2.5 2.5 0 103.535-3.535M5.5 9.5L4 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/deploy",
    label: "Deploy",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 1.5l5 5-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12.5 6.5H3a1.5 1.5 0 000 3h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/tasks",
    label: "Tasks",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="1.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4.5 13.5h6M7.5 10.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M4.5 5.5l2 2 3.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const COMPANY: NavItem[] = [
  {
    href: "/dashboard/roles",
    label: "Company Brain",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="5.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="9.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="9.5" y="9.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5.5 7.5h2.5M9.5 3.5H8a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/goals",
    label: "Goals",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>
        <path d="M7.5 2V1M7.5 14v-1M13 7.5h1M1 7.5h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/feed",
    label: "Intel Feed",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2 4.5h11M2 7.5h8M2 10.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="12" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M13.5 10.5v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/alerts",
    label: "Alerts",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 1.5L13 12H2L7.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M7.5 6v3M7.5 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/skills",
    label: "Skills",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M5 4.5L2 7.5l3 3M10 4.5l3 3-3 3M8.5 2.5l-2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/org",
    label: "Team",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="10.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 13c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10.5 9c1.38 0 2.5 1.12 2.5 2.5V13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/team-knowledge",
    label: "Team Knowledge",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="10.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 12c0-1.66 1.79-3 4-3s4 1.34 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10.5 9.5c1.38 0 2.5.9 2.5 2V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M7.5 2.5l.5.5M10 2l.5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/handoff",
    label: "Handoff Report",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="2.5" y="1.5" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5 5h4M5 7.5h3M5 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M9.5 9l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const SURFACES: NavItem[] = [
  {
    href: "/dashboard/email",
    label: "Email",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="3.5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1.5 5.5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/meetings",
    label: "Meetings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="4" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M10 6.5l4-2.5v7l-4-2.5V6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/impact",
    label: "Impact",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M1.5 11.5l3-4 3 2 3-5 2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M1.5 13.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const ACCOUNT: NavItem[] = [
  {
    href: "/dashboard/api",
    label: "Developer",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4.5 6L3 7.5 4.5 9M10.5 6L12 7.5 10.5 9M7.5 5.5l-1 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.93 2.93l1.06 1.06M11.01 11.01l1.06 1.06M2.93 12.07l1.06-1.06M11.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pt-3 pb-1 text-[10px] font-medium text-white/20 uppercase tracking-wider">{label}</p>
      {items.map(({ href, label: itemLabel, icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              active
                ? "glass-md text-white/90"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
            }`}
          >
            <span className={active ? "text-white/70" : "text-white/35"}>{icon}</span>
            {itemLabel}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const { clone } = useClone();
  const tier = clone?.subscription_tier ?? "free";
  const hasCompanyBrain = tier === "enterprise_pro" || tier === "enterprise_max";

  return (
    <aside className="w-[200px] shrink-0 flex flex-col h-full glass border-r border-white/[0.06] py-5 px-3">
      {/* Logo */}
      <div className="px-3 mb-5">
        <span className="text-sm font-semibold text-white/80 tracking-tight">doppel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col overflow-y-auto">
        <NavGroup label="Clone" items={PERSONAL} />
        {hasCompanyBrain && <NavGroup label="Company" items={COMPANY} />}
        <NavGroup label="Surfaces" items={SURFACES} />
        <NavGroup label="Account" items={ACCOUNT} />
      </nav>

      {/* Back to landing */}
      <div className="px-1 mb-1">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 1L3 6.5 8 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to site
        </Link>
      </div>

      {/* Tour trigger */}
      <TourButton />

      {/* Admin link — only for admins */}
      <AdminLink />

      {/* User */}
      <UserFooter />
    </aside>
  );
}

function AdminLink() {
  const { user } = useUser();
  if (user?.id !== process.env.NEXT_PUBLIC_ADMIN_USER_ID) return null;
  return (
    <div className="px-1 mb-1">
      <Link
        href="/dashboard/admin"
        className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-violet-400/40 hover:text-violet-400/70 hover:bg-white/[0.04] transition-all"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M6.5 4v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Admin
      </Link>
    </div>
  );
}

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  personal: "Personal",
  enterprise_pro: "Ent. Pro",
  enterprise_max: "Ent. Max",
};

function UserFooter() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { clone } = useClone();

  const tier = clone?.subscription_tier ?? "free";
  const name = user?.firstName ?? user?.username ?? "Account";

  return (
    <div className="px-3 pt-4 border-t border-white/[0.06]">
      <div className="flex items-center gap-2.5 mb-2">
        <UserButton appearance={{ elements: { avatarBox: "w-7 h-7 shrink-0" } }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/60 truncate">{name}</p>
          <span className="inline-block text-[10px] text-white/30 bg-white/[0.05] border border-white/[0.06] rounded-full px-1.5 py-px leading-tight capitalize">
            {TIER_LABEL[tier] ?? tier}
          </span>
        </div>
      </div>
      <button
        onClick={() => signOut({ redirectUrl: "/" })}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4.5 2H2a.5.5 0 00-.5.5v7A.5.5 0 002 10h2.5M8 3.5L10 6l-2 2.5M10 6H4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Sign out
      </button>
    </div>
  );
}

function TourButton() {
  const { startTour } = useTour();
  const { clone } = useClone();
  const [open, setOpen] = useState(false);
  const tier = clone?.subscription_tier ?? "free";
  const hasCompany = tier === "enterprise_pro" || tier === "enterprise_max";

  return (
    <div className="px-1 mb-2 relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5 5c0-1.1.9-1.5 1.5-1.5S8 4 8 5c0 .8-.5 1.2-1 1.5-.5.3-.5.7-.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="6.5" cy="9" r=".6" fill="currentColor"/>
        </svg>
        Take a tour
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute bottom-full left-0 right-0 mb-1 z-50 backdrop-blur-xl bg-white/[0.07] border border-white/[0.10] rounded-xl p-1.5 shadow-xl">
            <button
              onClick={() => { startTour("getting_started"); setOpen(false); }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0 text-white/40">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <p className="text-xs text-white/65">Getting started</p>
                <p className="text-[11px] text-white/25 mt-0.5">Clone · Train · Brain · Deploy · Tasks · Email · API</p>
              </div>
            </button>
            {hasCompany && (
              <button
                onClick={() => { startTour("company"); setOpen(false); }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0 text-violet-400/50">
                  <rect x="1.5" y="5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <rect x="8.5" y="1.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <rect x="8.5" y="8.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5 6.75h2M7 3.25H6a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <div>
                  <p className="text-xs text-violet-400/60">Company features</p>
                  <p className="text-[11px] text-white/25 mt-0.5">Brain · Goals · Feed · Alerts · Skills API · Team</p>
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
