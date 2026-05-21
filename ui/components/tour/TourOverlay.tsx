"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TourStep } from "./TourProvider";

interface Rect { x: number; y: number; w: number; h: number }

const TOOLTIP_W = 280;
const TOOLTIP_H_APPROX = 160;
const SPOT_PAD = 8;
const GAP = 16;
const SCREEN_PAD = 16;

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

const ARROW_SIZE = 8;

function Arrow({ side }: { side: "left" | "right" | "top" | "bottom" }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    background: "rgba(255,255,255,0.11)",
    border: "1px solid rgba(255,255,255,0.14)",
    backdropFilter: "blur(20px)",
  };

  const styles: Record<typeof side, React.CSSProperties> = {
    left:   { ...base, left: -ARROW_SIZE / 2 - 1, top: "50%", transform: "translateY(-50%) rotate(45deg)", borderRight: "none", borderTop: "none" },
    right:  { ...base, right: -ARROW_SIZE / 2 - 1, top: "50%", transform: "translateY(-50%) rotate(45deg)", borderLeft: "none", borderBottom: "none" },
    top:    { ...base, left: "50%", top: -ARROW_SIZE / 2 - 1, transform: "translateX(-50%) rotate(45deg)", borderRight: "none", borderBottom: "none" },
    bottom: { ...base, left: "50%", bottom: -ARROW_SIZE / 2 - 1, transform: "translateX(-50%) rotate(45deg)", borderLeft: "none", borderTop: "none" },
  };
  return <span style={styles[side]} />;
}

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

  const measure = useCallback(() => {
    const el = document.querySelector(step.target);
    if (!el) { setTargetRect(null); return; }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const r = el.getBoundingClientRect();
    setTargetRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [step.target]);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => {
      measure();
      setMounted(true);
    }, 80);
    return () => clearTimeout(t);
  }, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none",
        opacity: mounted ? 1 : 0, transition: "opacity 200ms ease",
      }}
    >
      {/* Backdrop with spotlight */}
      <svg width={vw} height={vh} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="tour-spotlight">
            <rect width={vw} height={vh} fill="white" />
            <rect x={sx} y={sy} width={sw} height={sh} rx={10} fill="black" />
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(0,0,0,0.62)" mask="url(#tour-spotlight)" />
        <rect
          x={sx - 1} y={sy - 1} width={sw + 2} height={sh + 2}
          rx={11} fill="none"
          stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}
        />
      </svg>

      {/* Tooltip */}
      <div
        style={{
          position: "fixed",
          left: tx,
          top: ty,
          width: TOOLTIP_W,
          pointerEvents: "all",
          background: "rgba(255,255,255,0.09)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.13)",
          borderRadius: 18,
          padding: "18px 20px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
      >
        <Arrow side={arrowSide} />

        {/* Step counter + skip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)" }}>
            {stepIndex + 1} of {totalSteps}
          </span>
          <button
            onClick={onSkip}
            style={{ background: "none", border: "none", fontSize: 11, color: "rgba(255,255,255,0.30)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
          >
            Skip
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 999, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: "rgba(255,255,255,0.55)", width: `${progress * 100}%`, transition: "width 300ms ease" }} />
        </div>

        {/* Content */}
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: "0 0 6px", lineHeight: 1.4 }}>{step.title}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>{step.description}</p>

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button
            onClick={onPrev}
            disabled={stepIndex === 0}
            style={{
              background: "none", border: "none", fontSize: 12, cursor: "pointer",
              color: stepIndex === 0 ? "transparent" : "rgba(255,255,255,0.35)",
              fontFamily: "inherit", padding: 0, transition: "color 180ms",
            }}
            onMouseEnter={(e) => { if (stepIndex > 0) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
            onMouseLeave={(e) => { if (stepIndex > 0) e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            style={{
              padding: "7px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)",
              background: isLast ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer", transition: "background 180ms, border-color 180ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isLast ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.10)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
          >
            {isLast ? "Done" : "Next →"}
          </button>
        </div>

        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", textAlign: "center", marginTop: 12, marginBottom: 0 }}>
          ← → arrow keys · Esc to exit
        </p>
      </div>
    </div>
  );
}
