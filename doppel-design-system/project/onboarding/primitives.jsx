/* ============================================================================
   Doppel onboarding — primitives
   ========================================================================== */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* Icons */
const I = {
  arrow:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowS:  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:   <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  send:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/></svg>,
  copy:    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M10 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  sparkle: <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z"/></svg>,
  brain:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 4a2 2 0 014 0c0 .5-.2 1-.5 1.3.6.5 1 1.3 1 2.2 0 .5-.1 1-.3 1.4.2.3.3.7.3 1.1a2 2 0 11-3 1.7c-.3.2-.6.3-1 .3a2 2 0 01-2-2 2 2 0 01.3-1.1 2.4 2.4 0 01-.3-1.3 2.5 2.5 0 011-2C4.2 5 4 4.5 4 4a2 2 0 011-1.7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  bolt:    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z"/></svg>,
  msg:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4.5a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0114 4.5v5a1.5 1.5 0 01-1.5 1.5H7L3.5 13v-2.5A1.5 1.5 0 012 9V4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  source:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 013 13V3a.5.5 0 010-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9 2.5V5h3" stroke="currentColor" strokeWidth="1.3"/></svg>,
  // Connector icons
  gmail:   <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M3 6l7 5 7-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  slack:   <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="8" width="9" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="3" width="3" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="9" width="9" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="11" y="8" width="3" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>,
  notion:  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 4l12-1v14L4 17V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 7v6M8 7l4 6V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  github:  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M8 16v-2c0-.5.2-1 .5-1.3-2 0-3.5-1.5-3.5-3.7 0-1 .3-1.7.8-2.3 0-.5-.3-1.3.1-2 0 0 .7-.2 2.3.9.7-.2 1.4-.3 2.2-.3.7 0 1.5.1 2.2.3 1.6-1.1 2.3-.9 2.3-.9.4.7.1 1.5.1 2 .5.6.8 1.3.8 2.3 0 2.2-1.5 3.7-3.5 3.7.3.3.5.8.5 1.3v2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/></svg>,
  upload:  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 13v3a1 1 0 001 1h8a1 1 0 001-1v-3M10 4v9M6 8l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  paste:   <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="5" y="4" width="10" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="7" y="2" width="6" height="3" rx="0.8" stroke="currentColor" strokeWidth="1.4" fill="currentColor"/></svg>,
  // Discovery icons
  pattern: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="9" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="3" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 4.5v3M9 4.5v3M4.5 3h3M4.5 9h3" stroke="currentColor" strokeWidth="1.1"/></svg>,
  voice:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 6h2l2-3v6l-2-3M7 4a3 3 0 010 4M9 2a5 5 0 010 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  topic:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 4h8M2 6h8M2 8h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  fact:    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 4v3M6 8v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  // Share icons
  twitter: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 2H14L9.5 7.2 15 14h-4.5l-3.2-4.1L3.5 14H1l4.8-5.5L0.5 2H5l2.9 3.8L11.5 2zm-.7 10.5h1.2L4.3 3.3H3l7.8 9.2z"/></svg>,
  linkedin:<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="14" rx="1.6"/><rect x="3" y="6" width="2.5" height="7" fill="#0a0a0a"/><circle cx="4.25" cy="3.75" r="1.25" fill="#0a0a0a"/><path d="M7 13V6h2.4v1c.4-.6 1.1-1.2 2.2-1.2 2 0 2.4 1.3 2.4 3V13H11.5V9.4c0-1-.4-1.4-1.1-1.4-.8 0-1.1.5-1.1 1.4V13H7z" fill="#0a0a0a"/></svg>,
  link:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M7 9l2-2M5 11l-1.5-1.5a2 2 0 010-3l2-2a2 2 0 013 0L10 6M11 5l1.5 1.5a2 2 0 010 3l-2 2a2 2 0 01-3 0L6 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* Connector sources */
const SOURCES = [
  { id: "gmail",  name: "Gmail",  icon: I.gmail,  desc: "Imports your sent mail. Best signal for tone.", count: "~4,200 emails", color: "#EA4335" },
  { id: "slack",  name: "Slack",  icon: I.slack,  desc: "Threads where you actually decide things.",     count: "~8,400 messages", color: "#9B59B6" },
  { id: "notion", name: "Notion", icon: I.notion, desc: "Docs, RFCs, playbooks — your written thinking.", count: "~620 pages",    color: "#A78BFA" },
  { id: "github", name: "GitHub", icon: I.github, desc: "PR threads and reviews. Best for technical voice.", count: "~1,300 reviews", color: "#34D399" },
  { id: "upload", name: "Upload files", icon: I.upload, desc: "Drop PDFs, docs, transcripts.",           count: "Any format",    color: "#1A73E8" },
  { id: "paste",  name: "Paste text", icon: I.paste,    desc: "Just paste a doc — fastest way to start.", count: "Up to 50k words", color: "#FBBF24" },
];

/* Discoveries — scripted, surface as training progresses */
const DISCOVERIES = [
  { at: 8,  cat: "Indexing",  color: "#1A73E8", icon: I.source,  text: "Found <strong>142 sent emails</strong> from the last 6 months." },
  { at: 16, cat: "Voice",     color: "#FBBF24", icon: I.voice,   text: "Your sentences average <strong>11 words</strong>. Direct and short." },
  { at: 28, cat: "Pattern",   color: "#A78BFA", icon: I.pattern, text: "You start replies with the answer, then context. Noted." },
  { at: 40, cat: "Topic",     color: "#34D399", icon: I.topic,   text: "Top topics: <strong>hiring</strong>, <strong>infra debt</strong>, <strong>customer renewals</strong>." },
  { at: 52, cat: "Fact",      color: "#E91E63", icon: I.fact,    text: 'You championed the Postgres migration in <strong>April 2024</strong>.' },
  { at: 64, cat: "Style",     color: "#00838F", icon: I.voice,   text: "You use 'maybe' a lot before pushback. Soft delivery, firm content." },
  { at: 76, cat: "Pattern",   color: "#A78BFA", icon: I.pattern, text: "Decisions cite numbers <strong>72% of the time</strong>." },
  { at: 88, cat: "Voice",     color: "#FBBF24", icon: I.voice,   text: "Trained on your last <strong>3 quarters</strong> of writing." },
];

Object.assign(window, { I, SOURCES, DISCOVERIES });
