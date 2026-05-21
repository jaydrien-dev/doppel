/* ============================================================================
   Doppel marketing — shared primitives
   ========================================================================== */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* Icons — 16px viewBox, 1.4 stroke, currentColor */
const I = {
  arrow:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowS:  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowU:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:   <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  send:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/></svg>,
  chevL:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4L5 8l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevR:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l5 4-5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  mail:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.5" width="12" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M3 5l5 4 5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  msg:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4.5a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0114 4.5v5a1.5 1.5 0 01-1.5 1.5H7L3.5 13v-2.5A1.5 1.5 0 012 9V4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  shield:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L3 3.5v4c0 3 2 5.5 5 7 3-1.5 5-4 5-7v-4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  building:<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="0.8" stroke="currentColor" strokeWidth="1.3"/><path d="M6 5h1M6 8h1M6 11h1M9 5h1M9 8h1M9 11h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  bug:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="6" width="6" height="7" rx="3" stroke="currentColor" strokeWidth="1.3"/><path d="M5 8H2.5M11 8h2.5M5 11H2.5M11 11h2.5M6 6V5a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  handshake:<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 7l3-3 3 3 3-3 3 3-3 3-3-3-3 3-3-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  sparkle: <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z"/></svg>,
  bolt:    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z"/></svg>,
  globe:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z" stroke="currentColor" strokeWidth="1.3"/></svg>,
  brain:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M5 4a2 2 0 014 0c0 .5-.2 1-.5 1.3.6.5 1 1.3 1 2.2 0 .5-.1 1-.3 1.4.2.3.3.7.3 1.1a2 2 0 11-3 1.7c-.3.2-.6.3-1 .3a2 2 0 01-2-2 2 2 0 01.3-1.1 2.4 2.4 0 01-.3-1.3 2.5 2.5 0 011-2C4.2 5 4 4.5 4 4a2 2 0 011-1.7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  clock:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 4v4l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  external:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M5 11L11 5M5 5h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* Brand color palette — use across the marketing surface */
const BRAND = {
  blue:    "#1A73E8",
  violet:  "#A78BFA",
  pink:    "#E91E63",
  amber:   "#FBBF24",
  emerald: "#34D399",
  teal:    "#00838F",
  orange:  "#F57C00",
  purple:  "#7B1FA2",
};

/* Logo mark + wordmark */
function Brand() {
  return (
    <a href="#" className="nav__brand" onClick={(e) => e.preventDefault()}>
      <span className="nav__brand__mark" />
      doppel
    </a>
  );
}

/* Sticky top nav */
function Nav({ onContact }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`nav ${scrolled ? "nav--scrolled" : ""}`}>
      <div className="nav__inner">
        <Brand />
        <nav className="nav__links">
          <a className="nav__link" href="#demo">Demo</a>
          <a className="nav__link" href="#why">Why</a>
          <a className="nav__link" href="#pricing">Pricing</a>
          <a className="nav__link" href="#contact" onClick={(e) => { e.preventDefault(); onContact?.(); }}>Contact</a>
        </nav>
        <div className="nav__cta-group">
          <button className="btn btn--ghost">Sign in</button>
          <button className="btn btn--primary">Start free {I.arrowS}</button>
        </div>
      </div>
    </header>
  );
}

/* Footer */
function Foot({ onContact }) {
  return (
    <footer className="foot">
      <div className="foot__inner">
        <div className="foot__brand"><Brand /></div>
        <span className="foot__legal">© 2026 Doppel AI, Inc.</span>
        <div className="foot__links">
          <a href="#" onClick={(e) => { e.preventDefault(); onContact?.(); }}>Contact</a>
          <a href="#">Terms</a>
          <a href="#">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { I, BRAND, Brand, Nav, Foot });
