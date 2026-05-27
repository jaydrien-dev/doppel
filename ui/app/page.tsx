"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
          <a className="nav__link" href="#screenwatch">Desktop app</a>
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
  { id: "sarah", name: "Sarah", initial: "S", role: "Architecture",  color: "#1A73E8", r: 200, a:   0, size: 64, line: "Why we chose Postgres over Dynamo" },
  { id: "maya",  name: "Maya",  initial: "M", role: "Design",        color: "#E91E63", r: 200, a:  72, size: 64, line: "When the design is done" },
  { id: "reza",  name: "Reza",  initial: "R", role: "GTM",           color: "#F57C00", r: 200, a: 144, size: 64, line: "Positioning that holds up" },
  { id: "jia",   name: "Jia",   initial: "J", role: "CFO",           color: "#34D399", r: 200, a: 216, size: 64, line: "Runway, then strategy" },
  { id: "amit",  name: "Amit",  initial: "A", role: "Debug",         color: "#7B1FA2", r: 200, a: 288, size: 64, line: "Read the error twice" },
  { id: "lin",   name: "Lin",   initial: "L", role: "Clinical ops",  color: "#C2185B", r: 100, a:  30, size: 44, line: "Handoff breaks the system" },
  { id: "tom",   name: "Tom",   initial: "T", role: "Operator",      color: "#A78BFA", r: 100, a: 150, size: 44, line: "After PMF is the hard year" },
  { id: "eli",   name: "Eli",   initial: "E", role: "Teaching",      color: "#FBBF24", r: 100, a: 270, size: 44, line: "How you ask is half the answer" },
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
            <span>412 expert clones answering right now</span>
          </div>

          <h1 className="hero__h1">
            Knowledge
            <br />
            that <span className="accent">outlasts you.</span>
          </h1>

          <p className="hero__sub">
            Train an AI clone on your work. Anyone can ask it.
            You don&apos;t have to be in the room.
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
  { who: "Sarah", role: "Architecture", color: "#1A73E8", line: "answered \"why Postgres over Dynamo\"", t: "2s" },
  { who: "Maya",  role: "Design",       color: "#E91E63", line: "reviewed \"checkout v2 critique\"", t: "11s" },
  { who: "Reza",  role: "GTM",          color: "#F57C00", line: "answered \"positioning rewrite\"", t: "24s" },
  { who: "Amit",  role: "Debug",        color: "#7B1FA2", line: "explained \"flaky test in CI\"", t: "37s" },
  { who: "Jia",   role: "CFO",          color: "#34D399", line: "modeled \"runway with new hires\"", t: "52s" },
  { who: "Lin",   role: "Clinical ops", color: "#C2185B", line: "answered \"weekend triage staffing\"", t: "1m" },
  { who: "Tom",   role: "Operator",     color: "#A78BFA", line: "advised \"killing a product line\"", t: "1m" },
  { who: "Eli",   role: "Teaching",     color: "#FBBF24", line: "structured \"week 3 prereqs\"", t: "2m" },
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
    expert: { id: "sarah", name: "Sarah Chen", role: "Architecture · former Stripe", color: "#1A73E8", initial: "S" },
    seed: "Should we rewrite our payments service or refactor in flight?",
    response: "Rewrite only if the API surface is fundamentally wrong, the team can't reason about failure modes, or on-call cost exceeds new-feature cost. Otherwise refactor — you keep velocity and tribal knowledge.",
    confidence: 92,
    sources: [
      { kind: "Notion", color: "#7B1FA2", label: "Rewrite RFC, Apr 2021" },
      { kind: "Slack",  color: "#34D399", label: "#payments-arch, 14 threads" },
      { kind: "Email",  color: "#1A73E8", label: "Post-mortem, Jun 2021" },
    ],
  },
  {
    expert: { id: "maya", name: "Maya Lee", role: "Design lead · ex-Figma", color: "#E91E63", initial: "M" },
    seed: "How do I know my design is done?",
    response: "When two designers can't agree, neither has met the user. Done is when your strongest critic has run out of fixable things to flag — not when you've stopped iterating.",
    confidence: 88,
    sources: [
      { kind: "Figma",  color: "#E91E63", label: "Review threads, 720 comments" },
      { kind: "Notion", color: "#7B1FA2", label: "Critique frameworks" },
    ],
  },
  {
    expert: { id: "jia", name: "Jia Park", role: "Fractional CFO", color: "#34D399", initial: "J" },
    seed: "How do I think about burn vs growth at seed?",
    response: "Show me your next 18 months first. We'll talk strategy after we agree on the math. At seed, runway is the only constraint that matters — everything else is downstream.",
    confidence: 95,
    sources: [
      { kind: "Sheets", color: "#2E7D32", label: "240 client financial models" },
      { kind: "Email",  color: "#1A73E8", label: "660 investor threads" },
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
            Ask anyone. <br /> Get a <em>cited</em> answer.
          </h2>
          <p className="sec-sub">
            Every clone answers in voice, with real sources and a confidence score. Try one:
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
                    <span>Confidence</span>
                    <span className="demo__msg__conf__bar">
                      <span className="demo__msg__conf__fill" style={{ ["--target-w" as string]: `${thread.confidence}%` }} />
                    </span>
                    <span className="demo__msg__conf__val">{thread.confidence}%</span>
                    <span>· 1.8s</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="demo__prompt">
            <input
              placeholder={`Ask ${thread.expert.name.split(" ")[0]}…`}
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
// SCREENWATCH SECTION
// ---------------------------------------------------------------------------

const SW_CHUNKS = [
  "Stanford was a big deal",
  "for me — I wrote about",
  "reviving the Aikido club",
  "and my Zelda-style essay",
  "It felt genuinely honest",
];

const SW_FEATURES = [
  {
    id: "screen",
    label: "Sees your screen",
    body: "No copy-paste. The clone reads what you're working on and responds with full context.",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"/>
        <circle cx="8" cy="8" r="2.2" fill="currentColor" opacity="0.8"/>
      </svg>
    ),
  },
  {
    id: "voice",
    label: "Voice activated",
    body: "Hold the mic, ask your question. Never type, never leave the app you're in.",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
        <rect x="5.5" y="1" width="5" height="7.5" rx="2.5" fill="currentColor" stroke="none" opacity="0.65"/>
        <path d="M2.5 8.5a5.5 5.5 0 0011 0"/>
        <line x1="8" y1="14" x2="8" y2="15.5"/>
        <line x1="5.5" y1="15.5" x2="10.5" y2="15.5"/>
      </svg>
    ),
  },
  {
    id: "top",
    label: "Always on top",
    body: "Floats above every window. One tap brings it up; one tap hides it. Never breaks your flow.",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round">
        <path d="M1 6l7-4.5L15 6l-7 4.5L1 6z"/>
        <path d="M1 10.5l7 4.5 7-4.5" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "cadence",
    label: "Reads at your speed",
    body: "Responses page through 5 words at a time at reading speed — perfect for glancing while working.",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
        <line x1="2" y1="4" x2="14" y2="4"/>
        <line x1="2" y1="8" x2="10" y2="8"/>
        <line x1="2" y1="12" x2="12" y2="12"/>
      </svg>
    ),
  },
];

function ScreenwatchSection() {
  const stageRef   = useRef<HTMLDivElement>(null);
  const mockRef    = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [chunkIdx, setChunkIdx]   = useState(0);
  const [chunkKey, setChunkKey]   = useState(0);
  const [platform, setPlatform]   = useState<"win" | "mac" | null>(null);
  const [mounted,  setMounted]    = useState(false);

  useEffect(() => {
    setMounted(true);
    if (navigator.userAgent.includes("Win")) setPlatform("win");
    else if (navigator.userAgent.includes("Mac")) setPlatform("mac");
  }, []);

  // Cycle demo chunks
  useEffect(() => {
    const id = setInterval(() => {
      setChunkIdx(i => (i + 1) % SW_CHUNKS.length);
      setChunkKey(k => k + 1);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  // Mouse-parallax tilt
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !mockRef.current) return;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mockRef.current.style.setProperty("--tilt-x", `${-y * 14}deg`);
    mockRef.current.style.setProperty("--tilt-y", `${x * 20}deg`);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (!mockRef.current) return;
    mockRef.current.style.transition = "transform 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    mockRef.current.style.setProperty("--tilt-x", "3deg");
    mockRef.current.style.setProperty("--tilt-y", "-5deg");
    setTimeout(() => { if (mockRef.current) mockRef.current.style.transition = ""; }, 650);
  }, []);

  const ACCENT = "rgba(52,211,153,0.80)"; // emerald-400

  return (
    <section
      id="screenwatch"
      ref={stageRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        padding: "96px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes sw-float {
          0%, 100% { transform: perspective(1000px) rotateX(var(--tilt-x, 3deg)) rotateY(var(--tilt-y, -5deg)) translateY(0px); }
          50%       { transform: perspective(1000px) rotateX(var(--tilt-x, 3deg)) rotateY(var(--tilt-y, -5deg)) translateY(-8px); }
        }
        @keyframes sw-chunk {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sw-breathe {
          0%, 100% { opacity: 0.5; } 50% { opacity: 1; }
        }
        @keyframes sw-bar {
          from { transform: scaleY(0.2); } to { transform: scaleY(1); }
        }
        @keyframes sw-glow {
          0%, 100% { opacity: 0.18; transform: scale(1); }
          50%      { opacity: 0.28; transform: scale(1.08); }
        }
        @keyframes sw-scan {
          0%   { top: 0%;   opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 0.6; }
          100% { top: 100%; opacity: 0; }
        }
        .sw-mock {
          --tilt-x: 3deg;
          --tilt-y: -5deg;
          animation: sw-float 5s ease-in-out infinite;
          transform-style: preserve-3d;
          will-change: transform;
        }
        .sw-feat:hover .sw-feat__icon { color: rgba(255,255,255,0.90); background: rgba(255,255,255,0.09); }
      `}</style>

      {/* Ambient glow */}
      <div style={{
        position: "absolute", bottom: 80, right: "15%",
        width: 480, height: 480,
        borderRadius: "50%",
        background: "rgba(52,211,153,0.06)",
        filter: "blur(90px)",
        pointerEvents: "none",
        animation: "sw-glow 6s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: 60, left: "8%",
        width: 320, height: 320,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.02)",
        filter: "blur(70px)",
        pointerEvents: "none",
      }} />

      <div style={{
        maxWidth: 1152,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 64,
        alignItems: "center",
      }}>

        {/* ── Left: copy ── */}
        <div>
          <div className="eyebrow" style={{ ["--eyebrow-c" as string]: ACCENT, marginBottom: 16 }}>
            <span className="eyebrow__dot" /> Desktop app · free download
          </div>

          <h2 className="sec-h2" style={{ ["--accent-c" as string]: ACCENT, marginBottom: 16 }}>
            Your clone <em>watches</em><br />with you.
          </h2>

          <p style={{
            fontSize: 16, lineHeight: 1.7,
            color: "var(--fg-dark-3)",
            maxWidth: 460, marginBottom: 40,
          }}>
            A lightweight overlay that floats above every app on your desktop. It reads your screen, hears your voice, and responds in real time — without breaking your focus.
          </p>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 44 }}>
            {SW_FEATURES.map(f => (
              <div
                key={f.id}
                className="sw-feat"
                onMouseEnter={() => setActiveId(f.id)}
                onMouseLeave={() => setActiveId(null)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: activeId === f.id ? "rgba(255,255,255,0.05)" : "transparent",
                  border: `1px solid ${activeId === f.id ? "rgba(255,255,255,0.10)" : "transparent"}`,
                  cursor: "default",
                  transition: "all 180ms ease",
                }}
              >
                <div
                  className="sw-feat__icon"
                  style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: activeId === f.id ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.45)",
                    transition: "all 180ms ease",
                  }}
                >
                  {f.icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: activeId === f.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.60)", transition: "color 180ms" }}>
                    {f.label}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.35)" }}>
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Download CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10 }}>
              {/* macOS */}
              <a
                href="/download?platform=mac"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 9,
                  padding: "11px 20px",
                  borderRadius: 12,
                  background: platform === "mac" ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${platform === "mac" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)"}`,
                  color: platform === "mac" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 500, textDecoration: "none",
                  transition: "all 200ms ease",
                  position: "relative",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = platform === "mac" ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)"; e.currentTarget.style.color = platform === "mac" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.55)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" opacity="0.75">
                  <path d="M10.2 0c.07.9-.26 1.8-.77 2.45-.52.66-1.35 1.17-2.18 1.1-.1-.85.3-1.75.78-2.37C8.54.53 9.43.05 10.2 0zM13 9.6c-.34.76-.5 1.1-.94 1.77-.6.91-1.45 2.04-2.5 2.06-.94.01-1.18-.6-2.45-.59-1.27.01-1.53.6-2.48.59-1.04-.02-1.85-1.04-2.46-1.96C.76 9.7.5 7.2 1.35 5.56c.6-1.18 1.68-1.87 2.82-1.87 1.05 0 1.71.61 2.58.61.84 0 1.35-.61 2.56-.61 1.02 0 1.98.56 2.58 1.52-.2.12-2.23 1.3-2 3.79.2 2.06 1.97 2.74 2.11 2.8-.02.03 0 .02 0 0z"/>
                </svg>
                Download for macOS
                {platform === "mac" && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,0.15)", color: "rgba(52,211,153,0.80)", border: "1px solid rgba(52,211,153,0.20)" }}>
                    Recommended
                  </span>
                )}
              </a>

              {/* Windows */}
              <a
                href="/download?platform=windows"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 9,
                  padding: "11px 20px",
                  borderRadius: 12,
                  background: platform === "win" ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${platform === "win" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)"}`,
                  color: platform === "win" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 500, textDecoration: "none",
                  transition: "all 200ms ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = platform === "win" ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)"; e.currentTarget.style.color = platform === "win" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.55)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" opacity="0.75">
                  <path d="M0 2.1L5.7 1.3v5.4H0V2.1zM6.4 1.2L14 0v6.7H6.4V1.2zM0 7.3h5.7V12.7L0 11.9V7.3zM6.4 7.3H14V14l-7.6-1.1V7.3z"/>
                </svg>
                Download for Windows
                {platform === "win" && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,0.15)", color: "rgba(52,211,153,0.80)", border: "1px solid rgba(52,211,153,0.20)" }}>
                    Recommended
                  </span>
                )}
              </a>
            </div>

            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
              Requires macOS 12+ or Windows 10 · Free download · No account needed to try
            </p>
          </div>
        </div>

        {/* ── Right: 3D mockup ── */}
        {mounted && (
          <div style={{ display: "flex", justifyContent: "center", perspective: "1200px" }}>
            <div
              ref={mockRef}
              className="sw-mock"
              style={{ position: "relative", width: 420, height: 500 }}
            >
              {/* ── Simulated screen surface ── */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 80,
                borderRadius: 18,
                background: "rgba(12,12,14,0.96)",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.80), 0 0 0 0.5px rgba(255,255,255,0.06)",
                overflow: "hidden",
                transformStyle: "preserve-3d",
              }}>
                {/* Screen chrome bar */}
                <div style={{
                  height: 36, borderBottom: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", alignItems: "center", gap: 7, padding: "0 14px",
                  background: "rgba(255,255,255,0.025)",
                }}>
                  {["rgba(248,113,113,0.6)","rgba(251,191,36,0.5)","rgba(52,211,153,0.5)"].map((c,i) => (
                    <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
                  ))}
                  {/* Fake URL bar */}
                  <div style={{
                    flex: 1, marginLeft: 12, height: 20, borderRadius: 6,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", padding: "0 10px", gap: 6,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(52,211,153,0.5)" }} />
                    <div style={{ height: 3, width: 120, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
                  </div>
                </div>

                {/* Screen content — abstract blurred layout */}
                <div style={{ padding: "20px 20px 16px", display: "flex", gap: 14, height: "calc(100% - 36px)" }}>
                  {/* Left sidebar */}
                  <div style={{ width: 52, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                    {[1,1,0.6,0.6,0.5,0.5,0.4].map((o,i) => (
                      <div key={i} style={{ height: i === 0 ? 28 : 20, borderRadius: 6, background: `rgba(255,255,255,${0.04 + o*0.035})`, border: "1px solid rgba(255,255,255,0.05)" }} />
                    ))}
                  </div>

                  {/* Main content */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* "Video player" area */}
                    <div style={{
                      borderRadius: 10, overflow: "hidden", flexShrink: 0,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                      height: 160, position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {/* Fake video bg */}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(26,115,232,0.08) 0%, rgba(52,211,153,0.06) 100%)" }} />
                      {/* Play button */}
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: "12px solid rgba(255,255,255,0.65)", marginLeft: 3 }} />
                      </div>
                      {/* Scan line */}
                      <div style={{
                        position: "absolute", left: 0, right: 0, height: 1,
                        background: "linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.4) 50%, transparent 100%)",
                        animation: "sw-scan 3s linear infinite",
                        pointerEvents: "none",
                      }} />
                      {/* Bottom bar */}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(248,113,113,0.7)" }} />
                        <div style={{ flex: 1, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                          <div style={{ width: "38%", height: "100%", background: "rgba(255,255,255,0.4)", borderRadius: 1 }} />
                        </div>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>12:47</span>
                      </div>
                    </div>

                    {/* Text content lines */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {[90,75,82,60,88,55].map((w,i) => (
                        <div key={i} style={{
                          height: 8, borderRadius: 4,
                          background: `rgba(255,255,255,${0.055 - i * 0.005})`,
                          width: `${w}%`,
                        }} />
                      ))}
                    </div>

                    {/* Tag row */}
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      {[["rgba(26,115,232,0.25)","rgba(26,115,232,0.4)",52],["rgba(52,211,153,0.20)","rgba(52,211,153,0.35)",64],["rgba(255,255,255,0.08)","rgba(255,255,255,0.15)",44]].map(([bg,bd,w],i) => (
                        <div key={i} style={{ height: 18, width: w as number, borderRadius: 5, background: bg as string, border: `1px solid ${bd}` }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Highlighted feature overlay */}
                {activeId === "screen" && (
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 18,
                    border: "1.5px solid rgba(52,211,153,0.40)",
                    boxShadow: "inset 0 0 40px rgba(52,211,153,0.06)",
                    pointerEvents: "none",
                    animation: "sw-breathe 1.2s ease-in-out infinite",
                  }} />
                )}
              </div>

              {/* ── Response overlay (above pill) ── */}
              <div style={{
                position: "absolute",
                bottom: 130, right: 12,
                width: 260,
                background: "rgba(8,8,8,0.94)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 16,
                padding: "12px 16px 14px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.65)",
                backdropFilter: "blur(20px)",
                transformStyle: "preserve-3d",
                transform: "translateZ(24px)",
              }}>
                {/* Clone label */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "#fff" }}>B</div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 500 }}>boo</span>
                  <div style={{ display: "flex", gap: 2, alignItems: "center", height: 9, marginLeft: 2 }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{ width: 2, height: "100%", borderRadius: 1, background: "#7C3AED", opacity: 0.55, transformOrigin: "bottom", animation: `sw-bar 0.55s ease-in-out ${i*0.09}s infinite alternate` }} />
                    ))}
                  </div>
                </div>
                {/* Animated chunk */}
                <p
                  key={chunkKey}
                  style={{
                    margin: 0,
                    fontSize: 15, fontWeight: 300, lineHeight: 1.45,
                    color: "rgba(255,255,255,0.88)",
                    letterSpacing: "-0.015em",
                    animation: "sw-chunk 180ms ease-out forwards",
                  }}
                >
                  {SW_CHUNKS[chunkIdx]}
                </p>
              </div>

              {/* ── Pill widget ── */}
              <div style={{
                position: "absolute",
                bottom: 60, right: 12,
                width: 240,
                height: 60,
                background: "rgba(10,10,10,0.97)",
                border: "1px solid rgba(255,255,255,0.13)",
                borderRadius: 999,
                boxShadow: "0 12px 40px rgba(0,0,0,0.70), 0 0 0 0.5px rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", gap: 9, padding: "0 10px 0 12px",
                transformStyle: "preserve-3d",
                transform: "translateZ(40px)",
              }}>
                {/* Avatar */}
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#fff", flexShrink: 0, boxShadow: "0 0 10px #7C3AED50" }}>
                  B
                </div>
                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.80)" }}>boo</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(52,211,153,0.70)", display: "inline-block", animation: "sw-breathe 2.5s ease-in-out infinite" }} />
                    <span style={{ fontSize: 10, color: "rgba(52,211,153,0.60)" }}>watching</span>
                  </div>
                </div>
                {/* Buttons */}
                <div style={{ display: "flex", gap: 5 }}>
                  {[
                    <svg key="mic" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.3" strokeLinecap="round"><rect x="4.5" y="1" width="5" height="7" rx="2.5" fill="rgba(255,255,255,0.75)" stroke="none" opacity="0.75"/><path d="M2 7a5 5 0 0010 0"/><line x1="7" y1="12" x2="7" y2="14"/><line x1="4.5" y1="14" x2="9.5" y2="14"/></svg>,
                    <svg key="exp" width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 3h3V1M9 3H6V1M1 7h3v2M9 7H6v2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                    <svg key="x" width="8" height="8" viewBox="0 0 9 9" fill="none"><path d="M1 1l7 7M8 1L1 8" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3" strokeLinecap="round"/></svg>,
                  ].map((icon, i) => (
                    <div key={i} style={{
                      width: i === 0 ? 30 : 24, height: i === 0 ? 30 : 24,
                      borderRadius: i === 0 ? "50%" : 6,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.09)",
                    }}>
                      {icon}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hint */}
              <div style={{
                position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, color: "rgba(255,255,255,0.20)",
                whiteSpace: "nowrap",
              }}>
                <kbd style={{ padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)", fontSize: 9, color: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.04)" }}>↔</kbd>
                drag to tilt
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3D CARD STACK
// ---------------------------------------------------------------------------
const CARDS = [
  {
    num: "01", title: "Capture",
    body: "Connect Gmail, Slack, GitHub, Notion. Every email, decision, and thread becomes searchable memory.",
    meta: "Takes 5 minutes",
    bg: "linear-gradient(135deg, #1A73E8 0%, #0D47A1 100%)", dot: "#4A90E2",
  },
  {
    num: "02", title: "Train",
    body: "Doppel learns your voice, your patterns, your shortcuts. Not just facts — the way you think.",
    meta: "Runs in the background",
    bg: "linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)", dot: "#A78BFA",
  },
  {
    num: "03", title: "Deploy",
    body: "Share a link, an API key, or a Slack bot. Anyone you give access can ask. You answer once, for everyone.",
    meta: "One click",
    bg: "linear-gradient(135deg, #E91E63 0%, #880E4F 100%)", dot: "#F06292",
  },
  {
    num: "04", title: "Compound",
    body: "Individual clones aggregate into role brains. Knowledge that doesn't leave when the person does.",
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
          <em>You</em> are the bottleneck. <br /> Your knowledge doesn&apos;t have to be.
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
  { val: 412, suffix: "+",  lbl: "expert clones live",              c: "#1A73E8", pct: 92 },
  { val: 84,  suffix: "%",  lbl: "average answer accuracy",         c: "#34D399", pct: 84 },
  { val: 1.8, suffix: "s",  lbl: "avg response time",               c: "#FBBF24", pct: 68 },
  { val: 80,  suffix: "%",  lbl: "of every paid query to creator",  c: "#E91E63", pct: 80 },
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
    feats: ["2 clones", "Train from any source (Gmail, Notion, Slack…)", "Public chat link", "Sell on the marketplace · 70% rev share"],
    cta: "Start free", featured: false,
  },
  {
    name: "Personal", color: "#1A73E8", monthly: 19, yearly: 190,
    desc: "Sell your knowledge. Earn on every query.",
    feats: ["5 clones", "80% revenue share on consumer queries", "Priority marketplace listing", "API access", "Custom clone pricing"],
    cta: "Get Personal", featured: false,
  },
  {
    name: "Pro", color: "#A78BFA", monthly: 49, yearly: 490, featured: true, perSeat: true,
    desc: "Scale your knowledge across a team.",
    feats: ["20 clones org-wide · everything in Personal", "Org-wide audit log", "Priority support"],
    cta: "Get Pro",
  },
  {
    name: "Max", color: "#E91E63", monthly: 149, yearly: 1490, perSeat: true,
    desc: "Enterprise-grade. No compromises.",
    feats: ["50 clones org-wide · everything in Pro", "SOC 2 Type II", "Guaranteed uptime SLA", "Dedicated CSM + priority support", "Custom contracts"],
    cta: "Talk to us", featured: false,
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
        <div className="pricing__toggle">
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
      </div>

      <div className="pricing__grid">
        {PLANS.map((p) => {
          const price = yearly ? Math.round(p.yearly / 12) : p.monthly;
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
                href={p.cta === "Talk to us" ? "/contact" : "/sign-up"}
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
        <p className="cta__sub">Free forever. Two minutes to set up. No credit card.</p>
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
      <ScreenwatchSection />
      <CardStack />
      <StatsSection />
      <PricingSection />
      <FinalCTA />
      <Foot />
    </div>
  );
}
