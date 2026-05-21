/* ============================================================================
   Doppel category glyphs — drop-in replacement for the emoji in
   ui/app/marketplace/page.tsx and ui/app/marketplace/[handle]/page.tsx

   Save as: ui/components/icons/categoryGlyphs.tsx
   Then import and use everywhere the old `emoji` field appeared.

   Spec:
     - 12×12 viewBox (sometimes 16×16 for larger contexts — scale the wrapper)
     - 1.2 stroke, currentColor, round line joins
     - Caller controls hue via text color (text-blue-600, etc)
   ========================================================================== */

import type { ReactNode } from "react";

export type CategoryKey =
  | "business" | "engineering" | "design" | "marketing" | "finance"
  | "legal" | "healthcare" | "education" | "science" | "other";

export interface CategoryConfig {
  label: string;
  /** Doppel category color — use as background or text color */
  color: string;
  /** SVG path element. Wrap in <svg width=12 height=12 viewBox="0 0 12 12">. */
  glyph: ReactNode;
}

export const CATEGORY_CONFIG: Record<CategoryKey, CategoryConfig> = {
  business: {
    label: "Business",
    color: "#1A73E8",
    glyph: (
      <>
        <rect x="2" y="4.5" width="8" height="5.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M4.5 4.5V3.4a1 1 0 011-1h1a1 1 0 011 1v1.1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      </>
    ),
  },
  engineering: {
    label: "Engineering",
    color: "#7B1FA2",
    glyph: (
      <>
        <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M2.5 9.5l1-1M8.5 3.5l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </>
    ),
  },
  design: {
    label: "Design",
    color: "#E91E63",
    glyph: (
      <>
        <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
      </>
    ),
  },
  marketing: {
    label: "Marketing",
    color: "#F57C00",
    glyph: (
      <>
        <path d="M2 8V4l7-2v8L2 8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
        <path d="M2 8h2v2H3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      </>
    ),
  },
  finance: {
    label: "Finance",
    color: "#2E7D32",
    glyph: (
      <path d="M2 9.5l3-3 2 2 3-4M10 4.5V2H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    ),
  },
  legal: {
    label: "Legal",
    color: "#546E7A",
    glyph: (
      <>
        <path d="M6 1.5v9M2 4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M3 4l-1 4h2zM9 4l-1 4h2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none"/>
      </>
    ),
  },
  healthcare: {
    label: "Healthcare",
    color: "#C2185B",
    glyph: (
      <path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    ),
  },
  education: {
    label: "Education",
    color: "#F9A825",
    glyph: (
      <path d="M2 5l4-2 4 2-4 2zM3 6v2c0 .5 1.3 1.5 3 1.5s3-1 3-1.5V6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
    ),
  },
  science: {
    label: "Science",
    color: "#00838F",
    glyph: (
      <path d="M5 2h2v3.5l2.5 4.5a1 1 0 01-.9 1.5H3.4a1 1 0 01-.9-1.5L5 5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
    ),
  },
  other: {
    label: "Other",
    color: "#8E24AA",
    glyph: <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>,
  },
};

/* ============================================================================
   <CategoryGlyph> — render component
   ========================================================================== */

interface Props {
  category: CategoryKey;
  size?: number;
  className?: string;
}

export function CategoryGlyph({ category, size = 12, className }: Props) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      style={{ color: config.color }}
    >
      {config.glyph}
    </svg>
  );
}

/* ============================================================================
   Example usage in marketplace/page.tsx — replaces emoji
   ----------------------------------------------------------------------------

   // Old:
   <button>
     <span>{emoji}</span> {label}
   </button>

   // New:
   import { CategoryGlyph, CATEGORY_CONFIG, type CategoryKey } from
     "@/components/icons/categoryGlyphs";

   const cats: CategoryKey[] = ["business", "engineering", "design", ...];

   {cats.map((key) => (
     <button
       key={key}
       onClick={() => setCategory(key)}
       className={`cat ${active === key ? "cat--active" : ""}`}
       style={{ "--cat-color": CATEGORY_CONFIG[key].color } as React.CSSProperties}
     >
       <CategoryGlyph category={key} size={12} />
       {CATEGORY_CONFIG[key].label}
     </button>
   ))}

   ========================================================================== */
