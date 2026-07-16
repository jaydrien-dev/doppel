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
  target?: string;       // CSS selector — undefined means centered modal
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  route?: string;        // navigate before showing this step
}

interface TourCtx {
  startTour: (tourId: keyof typeof TOURS, opts?: { force?: boolean }) => void;
  isActive: boolean;
  tourDone: boolean;
}

const TOUR_DONE_KEY = "doppel_tour_done:getting_started";

// ---------------------------------------------------------------------------
// Tour definitions
// ---------------------------------------------------------------------------
export const TOURS = {
  getting_started: [
    // 0 — Welcome (centered modal)
    {
      title: "Welcome to doppel",
      description:
        "In the next 2 minutes you'll learn how to train your clone, shape its personality, and share it with the world. Let's go.",
    },
    // 1 — Dashboard
    {
      target: 'a[href="/dashboard"]',
      title: "Your command center.",
      description:
        "Real-time stats: memory count, recent queries, approval rate.",
      position: "right" as const,
    },
    // 2 — Training
    {
      target: 'a[href="/dashboard/training"]',
      title: "Train your clone.",
      description:
        "Connect sources, observe your work, or teach your clone directly through interviews and uploads.",
      position: "right" as const,
    },
    // 3 — Test chat
    {
      target: 'a[href="/dashboard/test"]',
      title: "Try it before you share it.",
      description:
        "Chat with your clone right now. Green confidence bars show how certain each answer is. Red flags show what needs more training.",
      position: "right" as const,
    },
    // 6 — Deploy
    {
      target: 'a[href="/dashboard/deploy"]',
      title: "Control who has access.",
      description:
        "Toggle between Private, Allowlist, Org, and Public. Embed anywhere with one <script> tag.",
      position: "right" as const,
    },
    // 7 — Email
    {
      target: 'a[href="/dashboard/email"]',
      title: "Drafts in your voice.",
      description:
        "Your clone writes email replies that sound like you. You review each one — nothing sends without your approval.",
      position: "right" as const,
    },
    // 8 — Marketplace
    {
      target: 'a[href="/marketplace"]',
      title: "Your public profile.",
      description:
        "Once public, your clone appears in the marketplace. Others pay per question. You earn 80% of every query.",
      position: "right" as const,
    },
    // 9 — API
    {
      target: 'a[href="/dashboard/api"]',
      title: "Build with your clone.",
      description:
        "Generate API keys to call your clone from any app, script, or AI pipeline.",
      position: "right" as const,
    },
    // 10 — Desktop app
    {
      target: 'a[href="/dashboard/deploy"]',
      title: "Take it everywhere.",
      description:
        "Download the doppel desktop app for instant access via hotkey from any app, plus overlay mode that floats over your work.",
      position: "right" as const,
    },
    // 11 — Done (centered modal)
    {
      title: "You're ready.",
      description:
        "Your clone is waiting. Start by connecting a data source or chatting directly in Test mode. The more you feed it, the better it gets.",
    },
  ] as TourStep[],
} as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const TourContext = createContext<TourCtx>({
  startTour: () => {},
  isActive: false,
  tourDone: false,
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
  const [tourDone, setTourDone] = useState(false);

  // Read localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(TOUR_DONE_KEY) === "1") {
        setTourDone(true);
      }
    } catch { /* non-fatal */ }
  }, []);

  const startTour = useCallback((tourId: keyof typeof TOURS, opts?: { force?: boolean }) => {
    // Skip if already done (unless force)
    if (!opts?.force) {
      try {
        if (typeof window !== "undefined" && localStorage.getItem(TOUR_DONE_KEY) === "1") return;
      } catch { /* non-fatal */ }
    }
    setSteps([...TOURS[tourId]]);
    setIdx(0);
  }, []);

  function next() {
    if (!steps) return;
    const nextIdx = idx + 1;
    if (nextIdx < steps.length) {
      const nextStep = steps[nextIdx];
      // Navigate if step has a route
      if (nextStep.route && typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        if (nextStep.route !== currentPath) {
          window.location.href = nextStep.route;
        }
      }
      setIdx(nextIdx);
    } else {
      end();
    }
  }

  function prev() {
    if (idx > 0) setIdx((i) => i - 1);
  }

  function end() {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(TOUR_DONE_KEY, "1");
      }
    } catch { /* non-fatal */ }
    setTourDone(true);
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
    <TourContext.Provider value={{ startTour, isActive: !!steps, tourDone }}>
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
