"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
// Logo mark — two overlapping circles
// ---------------------------------------------------------------------------
function DoppelMark({ size = 22 }: { size?: number }) {
  const rx = size * 0.31;
  // Two circles matching the sidebar CSS mark proportions
  const c1x = size * 0.404; const c1y = size * 0.404; const c1r = size * 0.212;
  const c2x = size * 0.635; const c2y = size * 0.635; const c2r = size * 0.173;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={rx}
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" />
      <circle cx={c1x} cy={c1y} r={c1r} fill="rgba(255,255,255,0.95)" />
      <circle cx={c2x} cy={c2y} r={c2r} fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
const I = {
  arrow: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrowS: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  send: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" />
    </svg>
  ),
  chevL: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M10 4L5 8l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevR: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l5 4-5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  sparkle: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// NAV
// ---------------------------------------------------------------------------
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { isSignedIn } = useUser();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? "nav--scrolled" : ""}`}>
      <div className="nav__inner">
        <Link href="/" className="nav__brand">
          <DoppelMark size={22} />
          doppel
        </Link>
        <nav className="nav__links">
          <a className="nav__link" href="#demo">Demo</a>
          <a className="nav__link" href="#why">Why</a>
          <a className="nav__link" href="#pricing">Pricing</a>
          <Link className="nav__link" href="/contact">Contact</Link>
        </nav>
        <div className="nav__cta-group">
          {isSignedIn ? (
            <>
              <Link href="/home" className="btn btn--primary">Open app {I.arrowS}</Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="btn btn--ghost">Sign in</Link>
              <Link href="/sign-up" className="btn btn--primary">Start free {I.arrowS}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// CONSTELLATION (3D hero visual)
// ---------------------------------------------------------------------------
const NODES = [
  { id: "sarah", name: "Sarah", initial: "S", role: "Engineering",  color: "#1A73E8", r: 200, a:   0, size: 64, line: "Posted incident update to Slack" },
  { id: "maya",  name: "Maya",  initial: "M", role: "Design",       color: "#E91E63", r: 200, a:  72, size: 64, line: "Scheduled design review for Tuesday" },
  { id: "reza",  name: "Reza",  initial: "R", role: "Sales",        color: "#F57C00", r: 200, a: 144, size: 64, line: "Sent follow-up to 6 prospects" },
  { id: "jia",   name: "Jia",   initial: "J", role: "Finance",      color: "#34D399", r: 200, a: 216, size: 64, line: "Updated board deck in Drive" },
  { id: "amit",  name: "Amit",  initial: "A", role: "Engineering",  color: "#7B1FA2", r: 200, a: 288, size: 64, line: "Opened GitHub issue from Slack thread" },
  { id: "lin",   name: "Lin",   initial: "L", role: "Operations",   color: "#C2185B", r: 100, a:  30, size: 44, line: "Rescheduled 4 conflicting meetings" },
  { id: "tom",   name: "Tom",   initial: "T", role: "Sales",        color: "#A78BFA", r: 100, a: 150, size: 44, line: "Filed deal notes to Notion" },
  { id: "eli",   name: "Eli",   initial: "E", role: "Education",    color: "#FBBF24", r: 100, a: 270, size: 44, line: "Sent weekly summary to parents" },
];

function Constellation() {
  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [phase, setPhase] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Auto-rotation
  useEffect(() => {
    if (!auto) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (t: number) => {
      const dt = (t - t0) / 1000;
      const ry = Math.sin(dt * 0.18) * 14;
      const rx = Math.cos(dt * 0.12) * 7;
      const el = innerRef.current;
      if (el) {
        el.style.setProperty("--ry", `${ry}deg`);
        el.style.setProperty("--rx", `${rx}deg`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  // Phase animation for node orbits
  useEffect(() => {
    let raf: number;
    const t0 = performance.now();
    const tick = (t: number) => {
      setPhase(((t - t0) / 1000) * 0.18);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    setAuto(false);
    const rect = stageRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const el = innerRef.current;
    if (!el) return;
    el.style.setProperty("--ry", `${x * 32}deg`);
    el.style.setProperty("--rx", `${-y * 22}deg`);
  }, []);

  const onLeave = useCallback(() => setAuto(true), []);

  const activeNode = NODES.find((n) => n.id === active);

  if (!mounted) return <div className="stage" />;

  return (
    <div className="stage" ref={stageRef} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="stage__inner" ref={innerRef}>
        <div className="ring ring--1" />
        <div className="ring ring--2" />
        <div className="ring ring--3" />

        {NODES.map((n) => {
          const speed = n.r > 150 ? 0.6 : 1.0;
          const rad = (n.a * Math.PI) / 180 + phase * speed;
          const x = Math.cos(rad) * n.r;
          const y = Math.sin(rad) * n.r;
          const z = Math.sin(rad + 0.5) * 60;
          return (
            <button
              key={n.id}
              className="node"
              style={{
                ["--node-size" as string]: `${n.size}px`,
                ["--node-bg" as string]: n.color,
                ["--node-shadow" as string]: `${n.color}55`,
                ["--node-x" as string]: `${x}px`,
                ["--node-y" as string]: `${y}px`,
                transform: `translate(${x}px, ${y}px) translateZ(${z}px)`,
              }}
              onMouseEnter={() => setActive(n.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(n.id)}
              onBlur={() => setActive(null)}
              aria-label={`${n.name}, ${n.role}`}
            >
              <span className="node__pulse" />
              {n.initial}
            </button>
          );
        })}

        <div className="you">
          you
          <span className="you__label">your clone</span>
        </div>

        {activeNode && (() => {
          const speed = activeNode.r > 150 ? 0.6 : 1.0;
          const rad = (activeNode.a * Math.PI) / 180 + phase * speed;
          const x = Math.cos(rad) * activeNode.r;
          const y = Math.sin(rad) * activeNode.r;
          const left = x > 0 ? x + activeNode.size / 2 + 18 : x - activeNode.size / 2 - 18 - 220;
          return (
            <div
              className="bubble bubble--visible"
              style={{
                transform: `translate(${left}px, ${y - 30}px) translateZ(80px)`,
                ["--node-bg" as string]: activeNode.color,
              }}
            >
              <div className="bubble__from" style={{ color: activeNode.color }}>
                <span className="bubble__from__dot" />
                {activeNode.name} · {activeNode.role}
              </div>
              {activeNode.line}
            </div>
          );
        })()}
      </div>
      <div className="stage__hint">
        <kbd>↔</kbd> move to spin
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------
function Hero() {
  const { isSignedIn } = useUser();
  return (
    <section className="hero" id="top">
      <div className="hero__bg" />
      <div className="hero__bg__dots" />
      <div className="hero__inner">
        <div className="hero__copy">
          <div className="hero__pill">
            <span className="hero__pill__badge">
              <span className="hero__pill__dot" /> Live
            </span>
            <span>412 clones executing right now</span>
          </div>

          <h1 className="hero__h1">
            Be in two
            <br />
            places <span className="accent">at once.</span>
          </h1>

          <p className="hero__sub">
            Your clone acts on your behalf.
            Sends, schedules, searches, delegates — while you&apos;re elsewhere.
          </p>

          <div className="hero__ctas">
            <Link href={isSignedIn ? "/home" : "/sign-up"} className="btn btn--primary btn--lg">
              {isSignedIn ? <>Open app {I.arrow}</> : <>Start free {I.arrow}</>}
            </Link>
            <Link href="/contact" className="btn btn--ghost-light btn--lg">
              Talk to us
            </Link>
          </div>

          <div className="hero__trust">
            <span className="hero__trust__item">
              <span className="hero__trust__dot" /> Free forever for individuals
            </span>
            <span className="hero__trust__item">
              <span className="hero__trust__dot" /> No credit card
            </span>
          </div>
        </div>

        <Constellation />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TICKER
// ---------------------------------------------------------------------------
const TICK_ITEMS = [
  { who: "Sarah", role: "Engineering", color: "#1A73E8", line: "posted incident update to #eng-alerts", t: "2s" },
  { who: "Maya",  role: "Design",      color: "#E91E63", line: "scheduled design review with 3 stakeholders", t: "11s" },
  { who: "Reza",  role: "GTM",         color: "#F57C00", line: "drafted and sent follow-up to 6 prospects", t: "24s" },
  { who: "Amit",  role: "Engineering", color: "#7B1FA2", line: "opened GitHub issue from Slack thread", t: "37s" },
  { who: "Jia",   role: "Finance",     color: "#34D399", line: "updated runway model and shared with board", t: "52s" },
  { who: "Lin",   role: "Operations",  color: "#C2185B", line: "rescheduled 4 meetings after calendar conflict", t: "1m" },
  { who: "Tom",   role: "Sales",       color: "#A78BFA", line: "sent weekly pipeline summary to leadership", t: "1m" },
  { who: "Eli",   role: "Teaching",    color: "#FBBF24", line: "filed student feedback to Notion database", t: "2m" },
];

function Ticker() {
  const items = [...TICK_ITEMS, ...TICK_ITEMS];
  return (
    <div className="ticker">
      <div className="ticker__track">
        {items.map((x, i) => (
          <span key={i} className="ticker__item" style={{ ["--ticker-color" as string]: x.color }}>
            <span className="ticker__item__dot" />
            <span><span className="ticker__item__cat">{x.who}</span> · {x.role}</span>
            <span style={{ color: "var(--fg-dark-3)" }}>{x.line}</span>
            <span className="ticker__item__time">{x.t} ago</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DEMO SECTION
// ---------------------------------------------------------------------------
const DEMO_THREADS = [
  {
    expert: { id: "reza", name: "Reza · Sales", role: "Clone connected to Slack, Gmail, Notion", color: "#1A73E8", initial: "R" },
    seed: "Post to #deals that Acme signed. Draft a follow-up email to their team.",
    response: "Done. Posted to #deals and drafted the follow-up — it's in your Gmail drafts waiting for your review.",
    confidence: 97,
    sources: [
      { kind: "Slack",  color: "#34D399", label: "Posted to #deals · 1s" },
      { kind: "Gmail",  color: "#1A73E8", label: "Draft created · ready to send" },
    ],
  },
  {
    expert: { id: "maya", name: "Maya · Design", role: "Clone connected to Google Calendar, Notion", color: "#E91E63", initial: "M" },
    seed: "Schedule a design review with the product team for sometime next week.",
    response: "Scheduled for Tuesday 2pm — everyone was free. Invite sent, Notion doc linked in the description.",
    confidence: 94,
    sources: [
      { kind: "Calendar", color: "#E91E63", label: "Invite sent · 4 attendees" },
      { kind: "Notion",   color: "#7B1FA2", label: "Design review doc attached" },
    ],
  },
  {
    expert: { id: "sarah", name: "Sarah · Engineering", role: "Clone connected to GitHub, Slack", color: "#34D399", initial: "S" },
    seed: "Open a GitHub issue for the login timeout bug. Pull in the Slack thread context.",
    response: "Issue opened with full context from #backend-bugs. Assigned to the on-call engineer and labeled as P1.",
    confidence: 96,
    sources: [
      { kind: "GitHub", color: "#34D399", label: "Issue #847 opened · P1" },
      { kind: "Slack",  color: "#7B1FA2", label: "Thread context imported" },
    ],
  },
];

function DemoSection() {
  const [active, setActive] = useState(0);
  const [stage, setStage] = useState<"ask" | "typing" | "answer">("ask");
  const [draft, setDraft] = useState("");
  const thread = DEMO_THREADS[active];
  const color = thread.expert.color;

  useEffect(() => {
    setStage("ask");
    setDraft("");
    const t1 = setTimeout(() => setStage("typing"), 700);
    const t2 = setTimeout(() => setStage("answer"), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active]);

  return (
    <section className="demo" id="demo" style={{ ["--demo-color" as string]: color }}>
      <div className="demo__inner">
        <div>
          <div className="eyebrow" style={{ ["--eyebrow-c" as string]: color }}>
            <span className="eyebrow__dot" /> Live demo
          </div>
          <h2 className="sec-h2" style={{ ["--accent-c" as string]: color }}>
            Delegate a task. <br /> Your clone <em>handles it.</em>
          </h2>
          <p className="sec-sub">
            Connect your tools once. Then just tell your clone what to do.
          </p>

          <div className="demo__presets" style={{ marginTop: 18 }}>
            {DEMO_THREADS.map((d, i) => (
              <button
                key={d.expert.id}
                className="demo__preset"
                onClick={() => setActive(i)}
                style={{
                  ["--p-c" as string]: d.expert.color,
                  background: i === active ? "rgba(255,255,255,0.06)" : "var(--bg-dark-elev-1)",
                  borderColor: i === active ? d.expert.color : "var(--border-dark)",
                  color: i === active ? "#fff" : "var(--fg-dark-2)",
                }}
              >
                <span className="demo__preset__dot" />
                {d.expert.name} · {d.expert.role.split("·")[0].trim()}
              </button>
            ))}
          </div>
        </div>

        <div className="demo__visual" key={active}>
          <div className="demo__head">
            <div className="demo__head__av">{thread.expert.initial}</div>
            <div>
              <div className="demo__head__name">{thread.expert.name}</div>
              <div className="demo__head__role">{thread.expert.role}</div>
            </div>
            <span className="demo__head__live">
              <span className="demo__head__live__dot" /> Live
            </span>
          </div>

          <div className="demo__thread">
            <div className="demo__msg demo__msg--me">
              <div className="demo__msg__bubble">{thread.seed}</div>
            </div>

            {stage === "typing" && (
              <div className="demo__msg">
                <div className="demo__typing">
                  <span className="demo__typing__dot" />
                  <span className="demo__typing__dot" />
                  <span className="demo__typing__dot" />
                </div>
              </div>
            )}

            {stage === "answer" && (
              <div className="demo__msg">
                <div style={{ flex: 1 }}>
                  <div className="demo__msg__bubble">{thread.response}</div>
                  <div className="demo__msg__sources">
                    {thread.sources.map((s, i) => (
                      <span key={i} className="demo__msg__src" style={{ ["--src-c" as string]: s.color }}>
                        <span className="demo__msg__src__dot" /> {s.kind} · {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="demo__msg__conf">
                    <span>Tools used</span>
                    <span className="demo__msg__conf__bar">
                      <span className="demo__msg__conf__fill" style={{ ["--target-w" as string]: `${thread.confidence}%` }} />
                    </span>
                    <span className="demo__msg__conf__val">{thread.sources.length}</span>
                    <span>· 2.1s</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="demo__prompt">
            <input
              placeholder={`Tell ${thread.expert.name.split(" ")[0].split("·")[0].trim()} to…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={stage === "typing"}
            />
            <button className="demo__prompt__send" disabled={!draft.trim() || stage === "typing"} aria-label="Send">
              {I.send}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// 3D CARD STACK
// ---------------------------------------------------------------------------
const CARDS = [
  {
    num: "01", title: "Connect",
    body: "Link your tools once — Slack, Gmail, GitHub, Drive, Calendar, Notion. Your clone gets access to act on your behalf.",
    meta: "Takes 5 minutes",
    bg: "linear-gradient(135deg, #1A73E8 0%, #0D47A1 100%)", dot: "#4A90E2",
  },
  {
    num: "02", title: "Delegate",
    body: "Tell your clone what to handle. It executes: posts, schedules, searches, creates, follows up. You stay in control.",
    meta: "Natural language commands",
    bg: "linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)", dot: "#A78BFA",
  },
  {
    num: "03", title: "Approve",
    body: "High-stakes actions pause for your sign-off. You set the thresholds. Nothing irreversible happens without you.",
    meta: "You're always in the loop",
    bg: "linear-gradient(135deg, #E91E63 0%, #880E4F 100%)", dot: "#F06292",
  },
  {
    num: "04", title: "Scale",
    body: "One of you isn't enough. Your clone handles the volume while you focus on what only you can do.",
    meta: "Free → Enterprise",
    bg: "linear-gradient(135deg, #00838F 0%, #006064 100%)", dot: "#34D399",
  },
];

function CardStack() {
  const [i, setI] = useState(0);
  const total = CARDS.length;
  const next = useCallback(() => setI((x) => (x + 1) % total), [total]);
  const prev = useCallback(() => setI((x) => (x - 1 + total) % total), [total]);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 5400);
    return () => clearInterval(t);
  }, [paused, next]);

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    dragStart.current = "touches" in e ? e.touches[0].clientX : e.clientX;
    setPaused(true);
  };
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (dragStart.current == null) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    setDrag(clientX - dragStart.current);
  };
  const onUp = () => {
    if (Math.abs(drag) > 50) drag < 0 ? next() : prev();
    setDrag(0);
    dragStart.current = null;
  };

  const STACK_STYLES = [
    (tx: number) => ({ transform: `translate3d(${tx}px, 0, 0) rotateY(${tx * -0.04}deg)`, opacity: 1, zIndex: 4, filter: "none" }),
    () => ({ transform: "translate3d(0, 18px, -80px) scale(0.94)", opacity: 0.85, zIndex: 3, filter: "saturate(0.95)" }),
    () => ({ transform: "translate3d(0, 36px, -160px) scale(0.88)", opacity: 0.55, zIndex: 2, filter: "saturate(0.85)" }),
    () => ({ transform: "translate3d(0, 54px, -240px) scale(0.82)", opacity: 0.30, zIndex: 1, filter: "saturate(0.7)" }),
  ];

  return (
    <section className="cards-section" id="why">
      <div className="wrap" style={{ textAlign: "center", marginBottom: 18 }}>
        <div className="eyebrow" style={{ ["--eyebrow-c" as string]: "#A78BFA", justifyContent: "center" }}>
          <span className="eyebrow__dot" /> Why doppel
        </div>
        <h2 className="sec-h2" style={{ margin: "0 auto", ["--accent-c" as string]: "#A78BFA" }}>
          One of you <br /> <em>isn&apos;t enough.</em>
        </h2>
      </div>

      <div
        className="cards-stack"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      >
        {CARDS.map((c, idx) => {
          const offset = (idx - i + total) % total;
          const isFront = offset === 0;
          const tx = isFront ? drag : 0;
          const styleFn = STACK_STYLES[Math.min(offset, 3)];
          return (
            <div
              key={c.num}
              className="card-3d"
              style={{ ...styleFn(tx), ["--card-bg" as string]: c.bg } as React.CSSProperties}
              aria-hidden={!isFront}
            >
              <div className="card-3d__num">Step {c.num}</div>
              <div className="card-3d__title">{c.title}</div>
              <div className="card-3d__body">{c.body}</div>
              <div className="card-3d__meta">
                <span className="card-3d__meta__dot" />
                {c.meta}
              </div>
              <svg className="card-3d__art" viewBox="0 0 180 180" fill="none">
                <circle cx="90" cy="90" r="60" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" />
                <circle cx="90" cy="90" r="40" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <circle cx="90" cy="90" r="20" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" />
                <circle cx="90" cy="90" r="6" fill="rgba(255,255,255,0.7)" />
              </svg>
            </div>
          );
        })}
      </div>

      <div className="cards-nav">
        <button className="cards-nav__btn" onClick={prev} aria-label="Previous">{I.chevL}</button>
        <div className="cards-nav__dots">
          {CARDS.map((c, idx) => (
            <button
              key={idx}
              className={`cards-nav__dot ${idx === i ? "cards-nav__dot--active" : ""}`}
              style={{ ["--dot-color" as string]: c.dot }}
              onClick={() => setI(idx)}
              aria-label={`Show card ${idx + 1}`}
            />
          ))}
        </div>
        <button className="cards-nav__btn" onClick={next} aria-label="Next">{I.chevR}</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// STAT TILES
// ---------------------------------------------------------------------------
const STATS = [
  { val: 412, suffix: "+",  lbl: "active clones executing",          c: "#1A73E8", pct: 92 },
  { val: 94,  suffix: "%",  lbl: "tasks completed without escalation", c: "#34D399", pct: 94 },
  { val: 2.1, suffix: "s",  lbl: "avg tool execution time",           c: "#FBBF24", pct: 68 },
  { val: 80,  suffix: "%",  lbl: "of revenue to clone creator",       c: "#E91E63", pct: 80 },
];

function StatTile({ val, suffix, lbl, c, pct }: { val: number; suffix: string; lbl: string; c: string; pct: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !animated) {
          setAnimated(true);
          let raf: number;
          const t0 = performance.now();
          const dur = 1100;
          const tick = (t: number) => {
            const k = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - k, 5);
            setShown(val * eased);
            if (k < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [val, animated]);

  return (
    <div className="stat" ref={ref} style={{ ["--stat-c" as string]: c }}>
      <div className="stat__val">
        {Number.isInteger(val) ? Math.round(shown) : shown.toFixed(1)}
        <span className="stat__val__suffix">{suffix}</span>
      </div>
      <div className="stat__lbl">{lbl}</div>
      <div className="stat__bar">
        <span className="stat__bar__fill" style={{ width: animated ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

function StatsSection() {
  return (
    <section className="stats">
      <div className="stats__grid">
        {STATS.map((s, i) => <StatTile key={i} {...s} />)}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PRICING
// ---------------------------------------------------------------------------
const PLANS = [
  {
    name: "Free", color: "#34D399", monthly: 0, yearly: 0,
    desc: "Build your clone. Share it. Yours forever.",
    feats: [
      "2 clones",
      "500 memory chunks per clone",
      "50 queries / month per clone",
      "Train from any source (Gmail, Notion, Slack…)",
      "Public /c/[handle] chat link",
      "Sell on the marketplace · 70% rev share",
    ],
    cta: "Start free", featured: false, contactSales: false,
  },
  {
    name: "Personal", color: "#1A73E8", monthly: 15, yearly: 150,
    desc: "Sell your knowledge. Earn on every query.",
    feats: [
      "5 clones",
      "5,000 memory chunks per clone",
      "250 queries / month per clone",
      "80% revenue share on consumer queries",
      "Priority marketplace listing",
      "API access",
      "Custom clone pricing",
    ],
    cta: "Get Personal", featured: false, contactSales: false,
  },
  {
    name: "Pro", color: "#A78BFA", monthly: 49, yearly: 490, perSeat: true,
    desc: "Scale your knowledge across a team.",
    feats: [
      "20 clones org-wide · everything in Personal per seat",
      "30,000 memory chunks per clone",
      "1,250 queries / month per clone",
      "Org-wide audit log",
      "Priority support",
    ],
    cta: "Get Pro", featured: true, contactSales: false,
  },
  {
    name: "Max", color: "#E91E63", monthly: 149, yearly: 1490, perSeat: true,
    desc: "Enterprise-grade. No compromises.",
    feats: [
      "50 clones org-wide · everything in Pro",
      "200,000 memory chunks per clone",
      "5,000 queries / month per clone",
      "SOC 2 Type II",
      "Guaranteed uptime SLA",
      "Dedicated CSM + priority support",
      "Custom contracts + volume pricing",
    ],
    cta: "Talk to us", featured: false, contactSales: true,
  },
];

const DFY_PACKAGES = [
  {
    name: "Clone Starter",
    price: 499,
    turnaround: "3 business days",
    color: "#34D399",
    desc: "We build one fully configured clone for you — trained on your materials, connected to your tools, ready to delegate.",
    feats: [
      "1 custom-built clone",
      "Up to 3 connectors configured",
      "Knowledge base loaded from your docs",
      "Approval flows set up for your workflows",
      "30-minute handover call",
      "Includes 3 months of Personal plan",
    ],
  },
  {
    name: "Clone Studio",
    price: 1490,
    turnaround: "5 business days",
    color: "#A78BFA",
    featured: true,
    desc: "Your full delegate stack — multiple clones, every tool connected, trained on your business, ready to run.",
    feats: [
      "Up to 5 custom-built clones",
      "All connectors configured (Google, Slack, WhatsApp, AI models)",
      "Full knowledge base from your docs, emails, and SOPs",
      "Custom approval logic per workflow",
      "Team onboarding session (up to 5 people)",
      "Includes 6 months of Pro plan",
      "30-day post-launch support",
    ],
  },
  {
    name: "Clone Enterprise",
    price: -1,
    turnaround: "Custom timeline",
    color: "#FB923C",
    desc: "We build and deploy a full clone infrastructure for your company — every department, every tool, every workflow delegated.",
    feats: [
      "Unlimited clones across departments",
      "Custom connector development for proprietary tools",
      "Full data ingestion from internal systems",
      "Org-wide approval architecture design",
      "Executive and team training programme",
      "Dedicated Doppel engineer for first 90 days",
      "Includes Business plan for 12 months",
    ],
  },
];

function PricingSection() {
  const [yearly, setYearly] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const row = pillRef.current?.parentElement;
    if (!row) return;
    const btn = row.querySelector<HTMLButtonElement>('button[data-active="true"]');
    if (!btn || !pillRef.current) return;
    pillRef.current.style.left = `${btn.offsetLeft}px`;
    pillRef.current.style.width = `${btn.offsetWidth}px`;
  }, [yearly]);

  return (
    <section className="pricing" id="pricing">
      <div className="pricing__head">
        <div className="eyebrow" style={{ ["--eyebrow-c" as string]: "#1A73E8", justifyContent: "center" }}>
          <span className="eyebrow__dot" /> Pricing
        </div>
        <h2 className="sec-h2" style={{ margin: "0 auto", ["--accent-c" as string]: "#1A73E8" }}>
          Start <em>free.</em> Scale when it matters.
        </h2>
      </div>

      {/* Done-for-you packages */}
      <div style={{ maxWidth: 1200, margin: "0 auto 52px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="eyebrow" style={{ ["--eyebrow-c" as string]: "#A78BFA", justifyContent: "center", marginBottom: 12 }}>
            <span className="eyebrow__dot" /> Done for you
          </div>
          <h3 style={{ fontSize: 28, fontWeight: 300, color: "rgba(255,255,255,0.90)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            We build your clone for you.
          </h3>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
            Don&apos;t have time to set it up? We configure everything — training, connectors, approval flows, the works — and hand you a ready-to-run delegate.
          </p>
        </div>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {DFY_PACKAGES.map((pkg) => (
            <div
              key={pkg.name}
              className={`plan ${"featured" in pkg && pkg.featured ? "plan--featured" : ""}`}
              style={{ ["--plan-c" as string]: pkg.color }}
            >
              <div className="plan__head">
                <div className="plan__name">
                  <span className="plan__name__dot" />
                  {pkg.name}
                </div>
                {"featured" in pkg && pkg.featured && (
                  <span className="plan__badge">
                    <span style={{ display: "inline-flex" }}>{I.sparkle}</span> Most popular
                  </span>
                )}
              </div>

              {pkg.price === -1 ? (
                <div className="plan__price">
                  <span className="plan__price__big" style={{ fontSize: 24 }}>Custom</span>
                </div>
              ) : (
                <div className="plan__price">
                  <span className="plan__price__big">${pkg.price.toLocaleString()}</span>
                  <span className="plan__price__per">one-time</span>
                </div>
              )}

              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: "2px 0 6px", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M6 3.5v2.8l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {pkg.turnaround}
              </p>

              <p className="plan__desc">{pkg.desc}</p>

              <ul className="plan__feats">
                {pkg.feats.map((f, i) => <li key={i}>{I.check} {f}</li>)}
              </ul>

              <Link
                href="/contact"
                className="plan__cta"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}
              >
                {pkg.price === -1 ? "Talk to us" : "Book now"}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Self-serve divider */}
      <div style={{ maxWidth: 1200, margin: "0 auto 40px", padding: "0 24px" }}>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 48, textAlign: "center", marginBottom: 32 }}>
          <div className="eyebrow" style={{ ["--eyebrow-c" as string]: "#1A73E8", justifyContent: "center", marginBottom: 12 }}>
            <span className="eyebrow__dot" /> Self-serve
          </div>
          <h3 style={{ fontSize: 28, fontWeight: 300, color: "rgba(255,255,255,0.90)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            Or do it yourself, on your schedule.
          </h3>
        </div>
      </div>

      {/* Monthly/yearly toggle */}
      <div className="pricing__toggle" style={{ marginBottom: 32 }}>
        <span className="pricing__toggle__pill" ref={pillRef} />
        <button
          className={`pricing__toggle__btn ${!yearly ? "pricing__toggle__btn--active" : ""}`}
          data-active={!yearly}
          onClick={() => setYearly(false)}
        >
          Monthly
        </button>
        <button
          className={`pricing__toggle__btn ${yearly ? "pricing__toggle__btn--active" : ""}`}
          data-active={yearly}
          onClick={() => setYearly(true)}
        >
          Yearly <span className="pricing__toggle__save">save 17%</span>
        </button>
      </div>

      {/* Self-serve plans */}
      <div className="pricing__grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {PLANS.map((p) => {
          const price = p.monthly === -1 ? -1 : (yearly ? Math.round(p.yearly / 12) : p.monthly);
          return (
            <div key={p.name} className={`plan ${p.featured ? "plan--featured" : ""}`} style={{ ["--plan-c" as string]: p.color }}>
              <div className="plan__head">
                <div className="plan__name">
                  <span className="plan__name__dot" />
                  {p.name}
                </div>
                {p.featured && (
                  <span className="plan__badge">
                    <span style={{ display: "inline-flex" }}>{I.sparkle}</span> Most popular
                  </span>
                )}
              </div>
              {p.monthly === 0 ? (
                <div className="plan__free">Free forever</div>
              ) : price === -1 ? (
                <div className="plan__price">
                  <span className="plan__price__big" style={{ fontSize: 24 }}>Custom</span>
                </div>
              ) : (
                <div className="plan__price">
                  <span className="plan__price__big">${price}</span>
                  <span className="plan__price__per">
                    / mo{"perSeat" in p && p.perSeat ? " · per seat" : ""}
                    {yearly && p.monthly > 0 ? " (billed yearly)" : ""}
                  </span>
                </div>
              )}
              <p className="plan__desc">{p.desc}</p>
              <ul className="plan__feats">
                {p.feats.map((f, i) => <li key={i}>{I.check} {f}</li>)}
              </ul>
              <Link
                href={"contactSales" in p && p.contactSales ? "/contact" : "/sign-up"}
                className="plan__cta"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}
              >
                {p.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FINAL CTA
// ---------------------------------------------------------------------------
function FinalCTA() {
  const { isSignedIn } = useUser();
  return (
    <section className="cta">
      <div className="cta__inner">
        <h2 className="cta__title">
          Start with one clone.<br />
          <em>You.</em>
        </h2>
        <p className="cta__sub">Free to start. Two minutes to set up. No credit card.</p>
        <div className="cta__row">
          <Link href={isSignedIn ? "/home" : "/sign-up"} className="btn btn--primary btn--lg">
            {isSignedIn ? <>Open app {I.arrow}</> : <>Start free {I.arrow}</>}
          </Link>
          <Link href="/contact" className="btn btn--ghost-light btn--lg">Talk to us</Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FOOTER
// ---------------------------------------------------------------------------
function Foot() {
  return (
    <footer className="foot">
      <div className="foot__inner">
        <div className="foot__brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DoppelMark size={18} />
          doppel
        </div>
        <span className="foot__legal">&copy; 2026 Doppel AI, Inc.</span>
        <div className="foot__links">
          <Link href="/contact">Contact</Link>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------
export default function LandingPage() {
  return (
    <div className="doppel-marketing" style={{ fontFamily: "var(--font-sans)" }}>
      <Nav />
      <Hero />
      <Ticker />
      <DemoSection />
      <CardStack />
      <StatsSection />
      <PricingSection />
      <FinalCTA />
      <Foot />
    </div>
  );
}
