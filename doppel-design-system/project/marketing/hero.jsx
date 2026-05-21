/* ============================================================================
   Doppel landing — hero with 3D constellation
   ========================================================================== */

/* Clones that orbit. radius + initial angle + size + color + line. */
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
  const stageRef = useRef(null);
  const innerRef = useRef(null);
  const [active, setActive] = useState(null);
  const [auto, setAuto] = useState(true);

  // Slow auto-rotation. Disabled when hovering.
  useEffect(() => {
    if (!auto) return;
    let raf;
    let t0 = performance.now();
    const tick = (t) => {
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

  // Mouse-track tilt
  const onMove = (e) => {
    setAuto(false);
    const rect = stageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const el = innerRef.current;
    if (!el) return;
    el.style.setProperty("--ry", `${x * 32}deg`);
    el.style.setProperty("--rx", `${-y * 22}deg`);
  };
  const onLeave = () => {
    setAuto(true);
  };

  // Node positions
  const positions = useMemo(() => NODES.map((n) => {
    const rad = (n.a * Math.PI) / 180;
    return { ...n, x: Math.cos(rad) * n.r, y: Math.sin(rad) * n.r };
  }), []);

  // Animate around center over time
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf, t0 = performance.now();
    const tick = (t) => {
      setPhase(((t - t0) / 1000) * 0.18); // radians/sec
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="stage" ref={stageRef} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="stage__inner" ref={innerRef}>
        <div className="ring ring--1" />
        <div className="ring ring--2" />
        <div className="ring ring--3" />

        {positions.map((n) => {
          // each node orbits; outer ring slower
          const speed = n.r > 150 ? 0.6 : 1.0;
          const rad = (n.a * Math.PI) / 180 + phase * speed;
          const x = Math.cos(rad) * n.r;
          const y = Math.sin(rad) * n.r;
          // Z based on sin of angle — fakes depth
          const z = Math.sin(rad + 0.5) * 60;
          return (
            <button
              key={n.id}
              className="node"
              style={{
                "--node-size": `${n.size}px`,
                "--node-bg": n.color,
                "--node-shadow": `${n.color}55`,
                "--node-x": `${x}px`,
                "--node-y": `${y}px`,
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

        {/* speech bubble */}
        {(() => {
          const n = NODES.find((x) => x.id === active);
          if (!n) return null;
          const rad = (n.a * Math.PI) / 180 + phase * (n.r > 150 ? 0.6 : 1.0);
          const x = Math.cos(rad) * n.r;
          const y = Math.sin(rad) * n.r;
          const left = x > 0 ? x + n.size / 2 + 18 : x - n.size / 2 - 18 - 220;
          return (
            <div
              className="bubble bubble--visible"
              style={{
                transform: `translate(${left}px, ${y - 30}px) translateZ(80px)`,
                "--node-bg": n.color,
              }}
            >
              <div className="bubble__from" style={{ color: n.color }}>
                <span className="bubble__from__dot" />
                {n.name} · {n.role}
              </div>
              {n.line}
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

/* Hero copy + CTAs */
function Hero({ onContact }) {
  return (
    <section className="hero" id="top">
      <div className="hero__bg" />
      <div className="hero__bg__dots" />
      <div className="hero__inner">
        <div className="hero__copy">
          <div className="hero__pill">
            <span className="hero__pill__badge"><span className="hero__pill__dot" /> Live</span>
            <span>412 expert clones answering right now</span>
          </div>

          <h1 className="hero__h1">
            Knowledge
            <br />
            that <span className="accent">outlasts you.</span>
          </h1>

          <p className="hero__sub">
            Train an AI clone on your work. Anyone can ask it. You don't have to be in the room.
          </p>

          <div className="hero__ctas">
            <button className="btn btn--primary btn--lg">Start free {I.arrow}</button>
            <button className="btn btn--ghost-light btn--lg" onClick={onContact}>Talk to us</button>
          </div>

          <div className="hero__trust">
            <span className="hero__trust__item"><span className="hero__trust__dot" /> Free forever for individuals</span>
            <span className="hero__trust__item"><span className="hero__trust__dot" /> No credit card</span>
          </div>
        </div>

        <Constellation />
      </div>
    </section>
  );
}

/* ============================================================================
   Activity ticker — what clones answered recently
   ========================================================================== */
const TICK = [
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
  // Duplicate the list for seamless loop
  const items = [...TICK, ...TICK];
  return (
    <div className="ticker">
      <div className="ticker__track">
        {items.map((x, i) => (
          <span key={i} className="ticker__item" style={{ "--ticker-color": x.color }}>
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

Object.assign(window, { Constellation, Hero, Ticker, NODES });
