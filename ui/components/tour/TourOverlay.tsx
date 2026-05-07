"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TourStep } from "./TourProvider";

interface Rect { x: number; y: number; w: number; h: number }

const TOOLTIP_W = 288;
const TOOLTIP_H_APPROX = 170;
const SPOT_PAD = 8;   // padding around target in spotlight
const GAP = 16;       // gap between spotlight edge and tooltip
const SCREEN_PAD = 16; // minimum distance from viewport edge

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(val, max));
}

function computeTooltipPos(
  rect: Rect,
  position: TourStep["position"]
): { x: number; y: number; arrowSide: "left" | "right" | "top" | "bottom" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = 0, y = 0;
  let arrowSide: "left" | "right" | "top" | "bottom" = "left";

  const spotLeft   = rect.x - SPOT_PAD;
  const spotRight  = rect.x + rect.w + SPOT_PAD;
  const spotTop    = rect.y - SPOT_PAD;
  const spotBottom = rect.y + rect.h + SPOT_PAD;
  const spotCX     = rect.x + rect.w / 2;
  const spotCY     = rect.y + rect.h / 2;

  switch (position) {
    case "right":
      x = spotRight + GAP;
      y = spotCY - TOOLTIP_H_APPROX / 2;
      arrowSide = "left";
      break;
    case "left":
      x = spotLeft - GAP - TOOLTIP_W;
      y = spotCY - TOOLTIP_H_APPROX / 2;
      arrowSide = "right";
      break;
    case "top":
      x = spotCX - TOOLTIP_W / 2;
      y = spotTop - GAP - TOOLTIP_H_APPROX;
      arrowSide = "bottom";
      break;
    case "bottom":
    default:
      x = spotCX - TOOLTIP_W / 2;
      y = spotBottom + GAP;
      arrowSide = "top";
      break;
  }

  // If preferred position overflows, flip
  if (position === "right" && x + TOOLTIP_W > vw - SCREEN_PAD) {
    x = spotLeft - GAP - TOOLTIP_W;
    arrowSide = "right";
  }
  if (position === "left" && x < SCREEN_PAD) {
    x = spotRight + GAP;
    arrowSide = "left";
  }

  x = clamp(x, SCREEN_PAD, vw - TOOLTIP_W - SCREEN_PAD);
  y = clamp(y, SCREEN_PAD, vh - TOOLTIP_H_APPROX - SCREEN_PAD);

  return { x, y, arrowSide };
}

// ---------------------------------------------------------------------------
// Arrow pointing toward the highlighted element
// ---------------------------------------------------------------------------
function Arrow({ side }: { side: "left" | "right" | "top" | "bottom" }) {
  const base = "absolute w-2 h-2 border-white/[0.12]";
  const styles: Record<typeof side, string> = {
    left:   `${base} -left-[5px] top-1/2 -translate-y-1/2 border-l border-b rotate-45 bg-[rgba(255,255,255,0.07)]`,
    right:  `${base} -right-[5px] top-1/2 -translate-y-1/2 border-r border-t rotate-45 bg-[rgba(255,255,255,0.07)]`,
    top:    `${base} left-1/2 -translate-x-1/2 -top-[5px] border-l border-t rotate-45 bg-[rgba(255,255,255,0.07)]`,
    bottom: `${base} left-1/2 -translate-x-1/2 -bottom-[5px] border-r border-b rotate-45 bg-[rgba(255,255,255,0.07)]`,
  };
  return <span className={styles[side]} />;
}

// ---------------------------------------------------------------------------
// Main overlay
// ---------------------------------------------------------------------------
interface Props {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function TourOverlay({ step, stepIndex, totalSteps, onNext, onPrev, onSkip }: Props) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const rafRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = document.querySelector(step.target);
    if (!el) { setTargetRect(null); return; }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const r = el.getBoundingClientRect();
    setTargetRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [step.target]);

  // Re-measure on step change and on resize
  useEffect(() => {
    setMounted(false);
    // Small delay so scroll settles before measuring
    const t = setTimeout(() => {
      measure();
      setMounted(true);
    }, 80);
    return () => clearTimeout(t);
  }, [measure]);

  useEffect(() => {
    function onResize() { measure(); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  if (!targetRect) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;

  const sx = targetRect.x - SPOT_PAD;
  const sy = targetRect.y - SPOT_PAD;
  const sw = targetRect.w + SPOT_PAD * 2;
  const sh = targetRect.h + SPOT_PAD * 2;

  const { x: tx, y: ty, arrowSide } = computeTooltipPos(targetRect, step.position ?? "right");
  const progress = (stepIndex + 1) / totalSteps;

  return (
    <div
      className={`transition-opacity duration-200 ${mounted ? "opacity-100" : "opacity-0"}`}
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
    >
      {/* SVG backdrop with spotlight cutout */}
      <svg
        width={vw}
        height={vh}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <mask id="tour-spotlight">
            <rect width={vw} height={vh} fill="white" />
            <rect x={sx} y={sy} width={sw} height={sh} rx={10} fill="black" />
          </mask>
        </defs>
        {/* Dark overlay */}
        <rect
          width={vw}
          height={vh}
          fill="rgba(8,8,8,0.78)"
          mask="url(#tour-spotlight)"
        />
        {/* Highlight ring */}
        <rect
          x={sx - 1} y={sy - 1} width={sw + 2} height={sh + 2}
          rx={11}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1.5}
        />
        {/* Subtle inner glow */}
        <rect
          x={sx} y={sy} width={sw} height={sh}
          rx={10}
          fill="rgba(255,255,255,0.02)"
        />
      </svg>

      {/* Tooltip card */}
      <div
        style={{
          position: "fixed",
          left: tx,
          top: ty,
          width: TOOLTIP_W,
          pointerEvents: "all",
        }}
        className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl p-5 shadow-2xl"
      >
        <Arrow side={arrowSide} />

        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-white/30 uppercase tracking-widest">
            {stepIndex + 1} of {totalSteps}
          </span>
          <button
            onClick={onSkip}
            className="text-[11px] text-white/20 hover:text-white/50 transition-colors"
          >
            Skip tour
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-white/[0.07] rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-white/25 rounded-full transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Content */}
        <p className="text-sm font-medium text-white/85 mb-1.5 leading-snug">{step.title}</p>
        <p className="text-xs text-white/45 leading-relaxed">{step.description}</p>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={onPrev}
            disabled={stepIndex === 0}
            className="text-xs text-white/30 hover:text-white/60 disabled:opacity-0 transition-all"
          >
            ← Back
          </button>

          <button
            onClick={onNext}
            className="glass-md hover:glass-hi rounded-xl px-4 py-1.5 text-xs text-white/70 hover:text-white/90 transition-all"
          >
            {stepIndex === totalSteps - 1 ? "Done" : "Next →"}
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-[10px] text-white/15 mt-3 text-center">
          ← → arrow keys · Esc to exit
        </p>
      </div>
    </div>
  );
}
