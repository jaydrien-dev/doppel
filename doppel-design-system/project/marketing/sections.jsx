/* ============================================================================
   Doppel landing — DEMO section + 3D CARD STACK + STATS + PRICING + CTA
   ========================================================================== */

/* ---- DEMO --------------------------------------------------------------- */
const DEMO_THREADS = [
  {
    expert: { id: "sarah", name: "Sarah Chen", role: "Architecture · former Stripe", color: "#1A73E8", initial: "S" },
    seed: "Should we rewrite our payments service or refactor in flight?",
    response: "Rewrite only if the API surface is fundamentally wrong, the team can't reason about failure modes, or on-call cost exceeds new-feature cost. Otherwise refactor — you keep velocity and tribal knowledge.",
    confidence: 92,
    sources: [
      { kind: "Notion",   color: "#7B1FA2", label: "Rewrite RFC, Apr 2021" },
      { kind: "Slack",    color: "#34D399", label: "#payments-arch, 14 threads" },
      { kind: "Email",    color: "#1A73E8", label: "Post-mortem, Jun 2021" },
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
  const [stage, setStage] = useState("ask"); // ask | typing | answer
  const [draft, setDraft] = useState("");
  const thread = DEMO_THREADS[active];
  const color = thread.expert.color;

  // Play the question → typing → answer cycle when switching expert
  useEffect(() => {
    setStage("ask");
    setDraft("");
    const t1 = setTimeout(() => setStage("typing"), 700);
    const t2 = setTimeout(() => setStage("answer"), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active]);

  return (
    <section className="demo" id="demo" style={{ "--demo-color": color }}>
      <div className="demo__inner">
        <div>
          <div className="eyebrow" style={{ "--eyebrow-c": color }}>
            <span className="eyebrow__dot" /> Live demo
          </div>
          <h2 className="sec-h2" style={{ "--accent-c": color }}>
            Ask anyone. <br /> Get a <em>cited</em> answer.
          </h2>
          <p className="sec-sub">
            Every clone answers in voice, with real sources and a confidence score. Try one:
          </p>

          {/* Expert pills */}
          <div className="demo__presets" style={{ marginTop: 18 }}>
            {DEMO_THREADS.map((d, i) => (
              <button
                key={d.expert.id}
                className="demo__preset"
                onClick={() => setActive(i)}
                style={{
                  "--p-c": d.expert.color,
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

        {/* Chat visual */}
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
                      <span key={i} className="demo__msg__src" style={{ "--src-c": s.color }}>
                        <span className="demo__msg__src__dot" /> {s.kind} · {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="demo__msg__conf">
                    <span>Confidence</span>
                    <span className="demo__msg__conf__bar"><span className="demo__msg__conf__fill" style={{ "--target-w": `${thread.confidence}%` }} /></span>
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

/* ============================================================================
   3D CARD STACK — the "why" in physical, color-coded cards
   ========================================================================== */
const CARDS = [
  {
    num: "01",
    title: "Capture",
    body: "Connect Gmail, Slack, GitHub, Notion. Every email, decision, and thread becomes searchable memory.",
    meta: "Takes 5 minutes",
    bg: "linear-gradient(135deg, #1A73E8 0%, #0D47A1 100%)",
    dot: "#4A90E2",
  },
  {
    num: "02",
    title: "Train",
    body: "Doppel learns your voice, your patterns, your shortcuts. Not just facts — the way you think.",
    meta: "Runs in the background",
    bg: "linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)",
    dot: "#A78BFA",
  },
  {
    num: "03",
    title: "Deploy",
    body: "Share a link, an API key, or a Slack bot. Anyone you give access can ask. You answer once, for everyone.",
    meta: "One click",
    bg: "linear-gradient(135deg, #E91E63 0%, #880E4F 100%)",
    dot: "#F06292",
  },
  {
    num: "04",
    title: "Compound",
    body: "Individual clones aggregate into role brains. Knowledge that doesn't leave when the person does.",
    meta: "Free → Enterprise",
    bg: "linear-gradient(135deg, #00838F 0%, #006064 100%)",
    dot: "#34D399",
  },
];

function CardStack() {
  const [i, setI] = useState(0);
  const total = CARDS.length;
  const next = () => setI((x) => (x + 1) % total);
  const prev = () => setI((x) => (x - 1 + total) % total);

  // Auto-advance every 5s, paused on hover
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 5400);
    return () => clearInterval(t);
  }, [paused, i]);

  // Drag to flick
  const [drag, setDrag] = useState(0);
  const dragStart = useRef(null);
  const onDown = (e) => {
    dragStart.current = (e.touches?.[0]?.clientX ?? e.clientX);
    setPaused(true);
  };
  const onMove = (e) => {
    if (dragStart.current == null) return;
    setDrag((e.touches?.[0]?.clientX ?? e.clientX) - dragStart.current);
  };
  const onUp = () => {
    if (Math.abs(drag) > 50) {
      if (drag < 0) next();
      else prev();
    }
    setDrag(0);
    dragStart.current = null;
  };

  return (
    <section className="cards-section" id="why">
      <div className="wrap" style={{ textAlign: "center", marginBottom: 18 }}>
        <div className="eyebrow" style={{ "--eyebrow-c": "#A78BFA", justifyContent: "center" }}>
          <span className="eyebrow__dot" /> Why doppel
        </div>
        <h2 className="sec-h2" style={{ margin: "0 auto", "--accent-c": "#A78BFA" }}>
          <em>You</em> are the bottleneck. <br /> Your knowledge doesn't have to be.
        </h2>
      </div>

      <div className="cards-stack"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => { setPaused(false); }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      >
        {CARDS.map((c, idx) => {
          const offset = (idx - i + total) % total;
          const isFront = offset === 0;
          const tx = offset === 0 ? drag : 0;
          // Stack 4 positions: front, just behind, further behind, far behind
          const styles = [
            // front
            { transform: `translate3d(${tx}px, 0, 0) rotateY(${tx * -0.04}deg)`, opacity: 1, zIndex: 4, filter: "none" },
            // 2nd
            { transform: `translate3d(0, 18px, -80px) scale(0.94)`, opacity: 0.85, zIndex: 3, filter: "saturate(0.95)" },
            // 3rd
            { transform: `translate3d(0, 36px, -160px) scale(0.88)`, opacity: 0.55, zIndex: 2, filter: "saturate(0.85)" },
            // back
            { transform: `translate3d(0, 54px, -240px) scale(0.82)`, opacity: 0.30, zIndex: 1, filter: "saturate(0.7)" },
          ];
          const style = styles[Math.min(offset, 3)];
          return (
            <div
              key={c.num}
              className="card-3d"
              style={{ ...style, "--card-bg": c.bg }}
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
              style={{ "--dot-color": c.dot }}
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

/* ============================================================================
   STAT TILES — color-coded numbers
   ========================================================================== */
const STATS = [
  { val: 412,    suffix: "+",  lbl: "expert clones live",          c: "#1A73E8", pct: 92 },
  { val: 84,     suffix: "%",  lbl: "average answer accuracy",     c: "#34D399", pct: 84 },
  { val: 1.8,    suffix: "s",  lbl: "avg response time",           c: "#FBBF24", pct: 68 },
  { val: 80,     suffix: "%",  lbl: "of every paid query to creator", c: "#E91E63", pct: 80 },
];

function StatTile({ val, suffix, lbl, c, pct }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !animated) {
          setAnimated(true);
          let raf, t0 = performance.now();
          const dur = 1100;
          const tick = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - k, 5);
            setShown(val * e);
            if (k < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [val, animated]);

  return (
    <div className="stat" ref={ref} style={{ "--stat-c": c }}>
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

/* ============================================================================
   PRICING
   ========================================================================== */
const PLANS = [
  {
    name: "Free",       color: "#34D399", monthly: 0,  yearly: 0,
    desc: "Your personal clone. Keep it forever.",
    feats: ["1 personal clone", "All connectors", "50 queries / month", "Shareable link"],
    cta: "Start free",
  },
  {
    name: "Personal",   color: "#1A73E8", monthly: 15, yearly: 150,
    desc: "Full individual power.",
    feats: ["Everything in Free", "250 queries / month", "Meeting bot", "API access", "Data export"],
    cta: "Get Personal",
  },
  {
    name: "Pro",        color: "#A78BFA", monthly: 59, yearly: 590, featured: true, perSeat: true,
    desc: "Company Brain for your team.",
    feats: ["Everything in Personal · per seat", "Company Brain + Role Brains", "Skills API", "SSO · SCIM", "Audit log"],
    cta: "Get Pro",
  },
  {
    name: "Max",        color: "#E91E63", monthly: 179, yearly: 1790, perSeat: true,
    desc: "The full intelligence layer.",
    feats: ["Everything in Pro", "Org intelligence feed", "Drift detection", "SOC 2 Type II", "Dedicated CSM"],
    cta: "Talk to us",
  },
];

function PricingSection({ onContact }) {
  const [yearly, setYearly] = useState(false);
  const pillRef = useRef(null);
  // Slide pill
  useEffect(() => {
    const row = pillRef.current?.parentElement;
    if (!row) return;
    const btn = row.querySelector(`button[data-active="true"]`);
    if (!btn || !pillRef.current) return;
    pillRef.current.style.left = `${btn.offsetLeft}px`;
    pillRef.current.style.width = `${btn.offsetWidth}px`;
  }, [yearly]);

  return (
    <section className="pricing" id="pricing">
      <div className="pricing__head">
        <div className="eyebrow" style={{ "--eyebrow-c": "#1A73E8", justifyContent: "center" }}>
          <span className="eyebrow__dot" /> Pricing
        </div>
        <h2 className="sec-h2" style={{ margin: "0 auto", "--accent-c": "#1A73E8" }}>
          Start <em>free.</em> Scale when it matters.
        </h2>
        <div className="pricing__toggle">
          <span className="pricing__toggle__pill" ref={pillRef} />
          <button className={`pricing__toggle__btn ${!yearly ? "pricing__toggle__btn--active" : ""}`} data-active={!yearly} onClick={() => setYearly(false)}>Monthly</button>
          <button className={`pricing__toggle__btn ${yearly ? "pricing__toggle__btn--active" : ""}`} data-active={yearly} onClick={() => setYearly(true)}>
            Yearly <span className="pricing__toggle__save">save 17%</span>
          </button>
        </div>
      </div>

      <div className="pricing__grid">
        {PLANS.map((p) => {
          const price = yearly ? Math.round(p.yearly / 12) : p.monthly;
          return (
            <div key={p.name} className={`plan ${p.featured ? "plan--featured" : ""}`} style={{ "--plan-c": p.color }}>
              <div className="plan__head">
                <div className="plan__name">
                  <span className="plan__name__dot" />
                  {p.name}
                </div>
                {p.featured && <span className="plan__badge"><span style={{ display: "inline-flex" }}>{I.sparkle}</span> Most popular</span>}
              </div>
              {p.monthly === 0 ? (
                <div className="plan__free">Free forever</div>
              ) : (
                <div className="plan__price">
                  <span className="plan__price__big">${price}</span>
                  <span className="plan__price__per">/ mo{p.perSeat ? " · per seat" : ""}{yearly && p.monthly > 0 ? " (billed yearly)" : ""}</span>
                </div>
              )}
              <p className="plan__desc">{p.desc}</p>
              <ul className="plan__feats">
                {p.feats.map((f, i) => <li key={i}>{I.check} {f}</li>)}
              </ul>
              <button
                className="plan__cta"
                onClick={p.cta === "Talk to us" ? onContact : undefined}
              >
                {p.cta}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================================
   FINAL CTA
   ========================================================================== */
function FinalCTA({ onContact }) {
  return (
    <section className="cta">
      <div className="cta__inner">
        <h2 className="cta__title">
          Start with one clone.<br />
          <em>You.</em>
        </h2>
        <p className="cta__sub">Free forever. Two minutes to set up. No credit card.</p>
        <div className="cta__row">
          <button className="btn btn--primary btn--lg">Start free {I.arrow}</button>
          <button className="btn btn--ghost-light btn--lg" onClick={onContact}>Talk to us</button>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { DemoSection, CardStack, StatsSection, PricingSection, FinalCTA });
