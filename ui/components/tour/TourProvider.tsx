"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { TourOverlay } from "./TourOverlay";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TourStep {
  target: string;        // CSS selector
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface TourCtx {
  startTour: (tourId: keyof typeof TOURS) => void;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Tour definitions
// ---------------------------------------------------------------------------
export const TOURS = {
  getting_started: [
    {
      target: 'a[href="/dashboard"]',
      title: "Your clone's home base",
      description:
        "Track memory count, recent queries, connected data sources, and response approval rate — all at a glance.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/train"]',
      title: "Feed your clone",
      description:
        "Upload documents or connect Gmail, Slack, GitHub, and Notion. Everything you add shapes how your clone thinks and answers.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/identity"]',
      title: "Shape your clone's personality",
      description:
        "Set your communication style, values, and areas of expertise. This is what makes your clone sound like you — not a generic chatbot.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/brain"]',
      title: "Inspect your clone's memory",
      description:
        "Browse, pin, or exclude individual memory chunks. Use this to verify what your clone knows and remove anything inaccurate.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/deploy"]',
      title: "Control access",
      description:
        "Set to Private, Allowlist, Org-scoped, or Public. Embed your clone on any website with one line of code.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/tasks"]',
      title: "Run tasks on your computer",
      description:
        "Your clone can control the keyboard and mouse to complete complex work tasks — and draws on its knowledge base to make informed decisions.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/email"]',
      title: "Email drafting",
      description:
        "Your clone drafts replies in your voice. Approve, edit, or reject each one — every interaction improves it.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/api"]',
      title: "Developer API",
      description:
        "Generate API keys to call your clone from any app, script, or AI agent. Full programmatic access with the same response quality.",
      position: "right",
    },
  ] as TourStep[],

  company: [
    {
      target: 'a[href="/dashboard/roles"]',
      title: "Company Brain",
      description:
        "Aggregate knowledge across all team clones into role-based layers. Query the whole org as if it were a single mind.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/goals"]',
      title: "Goals & Strategy",
      description:
        "OKRs you define here are injected as context into every Company Brain query — keeping answers anchored to your current strategy.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/feed"]',
      title: "Intelligence Feed",
      description:
        "Every signal across your team — decisions, escalations, code, meetings — in one real-time stream.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/alerts"]',
      title: "Drift detection",
      description:
        "Alerts fire when team behavior diverges from stated goals, knowledge gaps appear, or escalation rates spike.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/skills"]',
      title: "Skills",
      description:
        "Generate Markdown files from your company brain — CLAUDE.md, system prompts, knowledge bases. Drop them into any agent to ground it in your company's actual procedures.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/org"]',
      title: "Team workspace",
      description:
        "Invite members, manage roles, and control which clones are visible org-wide. Cross-clone search lets you query the whole company at once.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/team-knowledge"]',
      title: "Team Knowledge",
      description:
        "New hires can query any team member's clone directly. Mark clones as onboarding resources so they show up here.",
      position: "right",
    },
    {
      target: 'a[href="/dashboard/handoff"]',
      title: "Knowledge Handoff",
      description:
        "When someone leaves, trigger a full handoff capture. Generates a structured report and preserves the clone indefinitely.",
      position: "right",
    },
  ] as TourStep[],
} as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const TourContext = createContext<TourCtx>({
  startTour: () => {},
  isActive: false,
});

export function useTour() {
  return useContext(TourContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function TourProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [idx, setIdx] = useState(0);

  const startTour = useCallback((tourId: keyof typeof TOURS) => {
    setSteps([...TOURS[tourId]]);
    setIdx(0);
  }, []);

  function next() {
    if (!steps) return;
    if (idx < steps.length - 1) setIdx((i) => i + 1);
    else end();
  }

  function prev() {
    if (idx > 0) setIdx((i) => i - 1);
  }

  function end() {
    setSteps(null);
    setIdx(0);
  }

  // Escape key exits tour
  useEffect(() => {
    if (!steps) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") end();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <TourContext.Provider value={{ startTour, isActive: !!steps }}>
      {children}
      {steps && (
        <TourOverlay
          step={steps[idx]}
          stepIndex={idx}
          totalSteps={steps.length}
          onNext={next}
          onPrev={prev}
          onSkip={end}
        />
      )}
    </TourContext.Provider>
  );
}
