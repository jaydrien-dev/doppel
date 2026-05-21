/* ============================================================================
   Marketplace UI kit — primitives
   Loaded as <script type="text/babel" src="primitives.jsx"></script>
   ========================================================================== */

const { useState } = React;

// --------------------------------------------------------------------------
// Category config — single source of truth for color + label + glyph
// --------------------------------------------------------------------------
const CATS = {
  all:         { label: "All",         color: "#5F6368", glyph: <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.3" fill="none"/> },
  business:    { label: "Business",    color: "#1A73E8", glyph: <><rect x="2" y="4" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M5 4V3a1 1 0 011-1h0a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" fill="none"/></> },
  engineering: { label: "Engineering", color: "#7B1FA2", glyph: <path d="M2 6l2-2 2 2-2 2zM6 6l2-2 2 2-2 2zM4 4l2-2 2 2-2 2z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/> },
  design:      { label: "Design",      color: "#E91E63", glyph: <><circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></> },
  marketing:   { label: "Marketing",   color: "#F57C00", glyph: <path d="M2 8V4l7-2v8zM2 8h3l1 2H3z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/> },
  finance:     { label: "Finance",     color: "#2E7D32", glyph: <path d="M2 9l3-3 2 2 3-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/> },
  legal:       { label: "Legal",       color: "#546E7A", glyph: <><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 9l1-1.5L5 9zM7 9l1-1.5L9 9z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/></> },
  healthcare:  { label: "Healthcare",  color: "#C2185B", glyph: <><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></> },
  education:   { label: "Education",   color: "#F9A825", glyph: <path d="M2 5l4-2 4 2-4 2zM3 6v2c0 .5 1.3 1.5 3 1.5s3-1 3-1.5V6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/> },
  science:     { label: "Science",     color: "#00838F", glyph: <path d="M5 2h2v3l2.5 5a1 1 0 01-.9 1.5H3.4a1 1 0 01-.9-1.5L5 5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/> },
  other:       { label: "Other",       color: "#8E24AA", glyph: <circle cx="6" cy="6" r="1.5" fill="currentColor"/> },
};

const catColor = (cat) => (CATS[cat] ?? CATS.other).color;

// --------------------------------------------------------------------------
// Icons (inline SVGs matching repo style)
// --------------------------------------------------------------------------
const Icon = {
  search: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  arrowRight: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowUpRight: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 11L11 5M5 5h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevron: <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1l3.5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  star: (filled) => <svg width="13" height="13" viewBox="0 0 16 16" fill={filled ? "#FBBF24" : "none"}><path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z" stroke={filled ? "#F59E0B" : "#D1D5DB"} strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  send: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M8 3L3 8M8 3l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  message: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5C4 1.5 1.5 3.7 1.5 6.5c0 1.3.5 2.5 1.4 3.4L2 12.5l2.7-1c.7.3 1.5.5 2.3.5C10 12 12.5 9.8 12.5 7S10 1.5 7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  back: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  sparkle: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="3" cy="3.5" r="2" fill="currentColor" opacity="0.8"/><circle cx="8" cy="7" r="1.6" fill="currentColor" opacity="0.5"/></svg>,
};

// --------------------------------------------------------------------------
// Brand mark / wordmark
// --------------------------------------------------------------------------
function Wordmark({ size = 17 }) {
  return (
    <a href="#" className="mk-header__brand" style={{ fontSize: size }}>
      <span>d</span>oppel
    </a>
  );
}

// --------------------------------------------------------------------------
// Avatar (monogram on flat category color)
// --------------------------------------------------------------------------
function Avatar({ name, color, size = 26, radius = 999 }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size,
      borderRadius: radius === 999 ? '50%' : radius,
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.4)',
      fontSize: Math.round(size * 0.46), fontWeight: 600,
      flexShrink: 0, userSelect: 'none',
    }}>{initial}</div>
  );
}

// --------------------------------------------------------------------------
// Star rating row
// --------------------------------------------------------------------------
function Stars({ rating, count }) {
  const r = Math.round(rating);
  return (
    <span className="clone-card__rating">
      {[1,2,3,4,5].map(i => <span key={i}>{Icon.star(i <= r)}</span>)}
      {count > 0 && <><strong>{rating.toFixed(1)}</strong><span>({count})</span></>}
    </span>
  );
}

// --------------------------------------------------------------------------
// Buttons
// --------------------------------------------------------------------------
function Button({ variant = 'primary', size = 'md', children, onClick, icon, iconAfter, ...rest }) {
  const cls = `btn btn--${variant}${size !== 'md' ? ` btn--${size}` : ''}`;
  return (
    <button className={cls} onClick={onClick} {...rest}>
      {icon}
      {children}
      {iconAfter}
    </button>
  );
}

// --------------------------------------------------------------------------
// Marketplace header
// --------------------------------------------------------------------------
function Header({ search, onSearch, breadcrumb }) {
  return (
    <header className="mk-header">
      <Wordmark/>
      {breadcrumb ? (
        <div className="crumbs">
          <span className="crumbs__sep">{Icon.chevron}</span>
          <a href="#" onClick={(e) => { e.preventDefault(); window.app?.navigate?.('browse'); }}>Marketplace</a>
          <span className="crumbs__sep">{Icon.chevron}</span>
          <strong>{breadcrumb}</strong>
        </div>
      ) : (
        <div className="mk-header__search">
          {Icon.search}
          <input
            placeholder="Search knowledge clones…"
            value={search ?? ''}
            onChange={(e) => onSearch?.(e.target.value)}
          />
        </div>
      )}
      <div className="mk-header__actions">
        <Button variant="ghost" size="sm">Sell your knowledge</Button>
        <Button variant="primary" size="sm" iconAfter={Icon.arrowRight}>Dashboard</Button>
      </div>
    </header>
  );
}

Object.assign(window, { CATS, catColor, Icon, Wordmark, Avatar, Stars, Button, Header });
