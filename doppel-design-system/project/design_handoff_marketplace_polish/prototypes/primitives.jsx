/* ============================================================================
   Doppel — shared primitives
   - Icons (SVG library matching design system stroke spec)
   - Category config (replaces emoji legacy violation with SVG glyphs)
   - Shared components: Stars, Avatar, Initial, Chrome bits
   ========================================================================== */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---- Icons (16px viewBox, 1.5 stroke, currentColor) ---------------------- */
const I = {
  search:  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  arrow:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowUR: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 11L11 5M5 5h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowS:  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  checkSm: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2" opacity="0.20"/><path d="M3.5 6.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevR:   <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  chevD:   <svg width="9" height="6" viewBox="0 0 9 6" fill="none"><path d="M1 1l3.5 4L8 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  close:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  heart:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13.5s-5-3-5-7a2.7 2.7 0 015-1.5A2.7 2.7 0 0113 6.5c0 4-5 7-5 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/></svg>,
  heartFilled: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 13.5s-5-3-5-7a2.7 2.7 0 015-1.5A2.7 2.7 0 0113 6.5c0 4-5 7-5 7z"/></svg>,
  share:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 11V2M8 2L5 5M8 2l3 3M3 9v4a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  more:    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>,
  filter:  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M3.5 7h7M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  grid:    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="2" y="8" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="8" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.3"/></svg>,
  list:    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  back:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  star:    (filled) => <svg width="13" height="13" viewBox="0 0 16 16" fill={filled ? "#FBBF24" : "none"}><path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={filled ? "#F59E0B" : "#D1D5DB"} strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  sparkle: <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/></svg>,
  bolt:    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor"/></svg>,
  shield:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L3 3.5v4c0 3 2 5.5 5 7 3-1.5 5-4 5-7v-4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M6 8l1.5 1.5L10.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  clock:   <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  msg:     <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0112 4v4a1.5 1.5 0 01-1.5 1.5H6L3 12V9.5H2.5A.5.5 0 012 9V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  source:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 013 13V3a.5.5 0 010-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9 2.5V5h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  layers:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  brain:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 4a2 2 0 014 0c0 .5-.2 1-.5 1.3.6.5 1 1.3 1 2.2 0 .5-.1 1-.3 1.4.2.3.3.7.3 1.1a2 2 0 11-3 1.7c-.3.2-.6.3-1 .3a2 2 0 01-2-2 2 2 0 01.3-1.1 2.4 2.4 0 01-.3-1.3 2.5 2.5 0 011-2C4.2 5 4 4.5 4 4a2 2 0 011-1.7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  paperclip: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11 7L7 11a2 2 0 11-3-3l5-5a3 3 0 014 4L7 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  send:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/></svg>,
  copy:    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M10 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  refresh: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M12 3v3h-3M2 11V8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 6a4 4 0 016.5-1.5L12 6M11 8a4 4 0 01-6.5 1.5L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  up:      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 8.5l4-4 4 4M7 4.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  down:    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 5.5l4 4 4-4M7 9.5V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* ---- Category config — single source of truth -------------------------- */
const CATS = {
  business:    { label: "Business",    color: "#1A73E8", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><rect x="2" y="4.5" width="8" height="5.5" rx="0.8" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.5V3.4a1 1 0 011-1h1a1 1 0 011 1v1.1" stroke="currentColor" strokeWidth="1.2"/></svg> },
  engineering: { label: "Engineering", color: "#7B1FA2", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M2.5 9.5l1-1M8.5 3.5l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
  design:      { label: "Design",      color: "#E91E63", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg> },
  marketing:   { label: "Marketing",   color: "#F57C00", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 8V4l7-2v8L2 8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 8h2v2H3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  finance:     { label: "Finance",     color: "#2E7D32", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 9.5l3-3 2 2 3-4M10 4.5V2H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  legal:       { label: "Legal",       color: "#546E7A", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M6 1.5v9M2 4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 4l-1 4h2zM9 4l-1 4h2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg> },
  healthcare:  { label: "Healthcare",  color: "#C2185B", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  education:   { label: "Education",   color: "#F9A825", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M2 5l4-2 4 2-4 2zM3 6v2c0 .5 1.3 1.5 3 1.5s3-1 3-1.5V6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  science:     { label: "Science",     color: "#00838F", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><path d="M5 2h2v3.5l2.5 4.5a1 1 0 01-.9 1.5H3.4a1 1 0 01-.9-1.5L5 5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
  other:       { label: "Other",       color: "#8E24AA", glyph: <svg viewBox="0 0 12 12" width="12" height="12" fill="none"><circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.2"/></svg> },
};

const catKeys = Object.keys(CATS);
const catColor = (key) => CATS[key]?.color ?? "#5F6368";
const catLabel = (key) => CATS[key]?.label ?? "Other";

/* ---- Stars ---- */
function Stars({ rating, count, size = 13, hideCount = false }) {
  const r = Math.round(rating);
  return (
    <span className="gig__rating">
      <span className="gig__rating__star" style={{ fontSize: 0 }}>
        {[1,2,3,4,5].map((i) => (
          <span key={i} style={{ display: "inline-flex" }}>
            <svg width={size} height={size} viewBox="0 0 16 16" fill={i <= r ? "#FBBF24" : "none"}>
              <path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={i <= r ? "#F59E0B" : "#D1D5DB"} strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </span>
        ))}
      </span>
      {!hideCount && count !== undefined && rating > 0 && (
        <>
          <span className="gig__rating__val">{rating.toFixed(1)}</span>
          <span className="gig__rating__count">({count.toLocaleString()})</span>
        </>
      )}
    </span>
  );
}

/* ---- Monogram avatar ---- */
function Monogram({ name, color, size = 26, radius = 999 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size,
      borderRadius: radius === 999 ? "50%" : radius,
      background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "rgba(255,255,255,0.45)",
      fontSize: Math.round(size * 0.46), fontWeight: 500,
      letterSpacing: "-0.02em",
      flexShrink: 0, userSelect: "none",
    }}>{initial}</div>
  );
}

Object.assign(window, { I, CATS, catKeys, catColor, catLabel, Stars, Monogram });
