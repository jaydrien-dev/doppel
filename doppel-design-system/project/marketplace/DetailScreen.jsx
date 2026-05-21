/* ============================================================================
   Doppel — Clone Detail screen
   ========================================================================== */

/* Count-up animation hook — used for stats */
function useCountUp(target, duration = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutQuint
      const e = 1 - Math.pow(1 - t, 5);
      setV(Math.round(target * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function DetailHero({ clone }) {
  const color = catColor(clone.cat);
  return (
    <div className="dtl-hero" style={{ "--clone-color": color }}>
      <div className="dtl-hero__share">
        <button className="dtl-hero__share__btn" aria-label="Save">{I.heart}</button>
        <button className="dtl-hero__share__btn" aria-label="Share">{I.share}</button>
        <button className="dtl-hero__share__btn" aria-label="More">{I.more}</button>
      </div>
      <div className="dtl-hero__inner">
        <div className="dtl-hero__avatar anim-scale-in">{clone.name[0]}</div>
        <div className="dtl-hero__main anim-fade-up">
          <div className="dtl-hero__cat">
            <span style={{ display: "inline-flex" }}>{CATS[clone.cat].glyph}</span>
            {CATS[clone.cat].label}
          </div>
          <h1 className="dtl-hero__title">
            {clone.name}
            {clone.verified && (
              <span className="dtl-hero__verified">{I.check} Verified</span>
            )}
          </h1>
          <p className="dtl-hero__sub">{clone.long}</p>
          <div className="dtl-hero__stats">
            <span className="dtl-hero__stat">
              <span className="dtl-hero__stars">
                {[1,2,3,4,5].map((i) => (
                  <span key={i} style={{ display: "inline-flex" }}>
                    {I.star(i <= Math.round(clone.rating))}
                  </span>
                ))}
              </span>
              <strong>{clone.rating.toFixed(1)}</strong>
              <span style={{ opacity: 0.7 }}>({clone.ratings} reviews)</span>
            </span>
            <span className="dtl-hero__stat__sep">·</span>
            <span className="dtl-hero__stat"><strong>{clone.queries.toLocaleString()}</strong> queries answered</span>
            <span className="dtl-hero__stat__sep">·</span>
            <span className="dtl-hero__stat">{I.clock} Responds in {clone.response}</span>
            <span className="dtl-hero__stat__sep">·</span>
            <span className="dtl-hero__stat"><strong>{clone.queue}</strong> active right now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Knowledge breakdown */
function MemoryBreakdown({ clone }) {
  const total = clone.mem.episodic + clone.mem.semantic + clone.mem.procedural;
  const types = [
    { key: "episodic",   label: "Memories",  bar: "#1A73E8" },
    { key: "semantic",   label: "Facts",     bar: "#2E7D32" },
    { key: "procedural", label: "Patterns",  bar: "#7B1FA2" },
  ];
  return (
    <section className="panel">
      <div className="panel__title">
        Knowledge breakdown
        <span className="panel__title__hint">{total.toLocaleString()} units indexed</span>
      </div>
      <div className="mem-grid">
        {types.map((t) => {
          const count = clone.mem[t.key];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const animated = useCountUp(count);
          return (
            <div key={t.key} className="mem-tile">
              <div className="mem-tile__count">{animated.toLocaleString()}</div>
              <div className="mem-tile__label">{t.label}</div>
              <div className="mem-tile__bar">
                <span style={{ width: `${pct}%`, background: t.bar }}></span>
              </div>
              <div className="mem-tile__pct">{pct}% of knowledge base</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* Sample questions */
function SampleQuestions({ clone, onAsk }) {
  const qs = SAMPLE_QS[clone.cat] ?? SAMPLE_QS.engineering;
  const color = catColor(clone.cat);
  return (
    <section className="panel" style={{ "--clone-color": color }}>
      <div className="panel__title">
        Things you can ask
        <span className="panel__title__hint">Tap to send to {clone.name.split(" ")[0]}</span>
      </div>
      <div className="qs">
        {qs.map((q, i) => (
          <button key={i} className="q-row" onClick={onAsk}>
            <span className="q-row__icon">{I.msg}</span>
            <span>{q}</span>
            <span className="q-row__arrow">{I.arrow}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* Sources */
function SourcesPanel({ clone }) {
  return (
    <section className="panel">
      <div className="panel__title">
        Trained on real sources
        <span className="panel__title__hint">All reviewed by {clone.name.split(" ")[0]}</span>
      </div>
      <div className="sources">
        {clone.sources.map((s, i) => (
          <div key={i} className="source-row">
            <div className="source-row__icon">{I.source}</div>
            <div style={{ minWidth: 0 }}>
              <div className="source-row__title">{s.kind}</div>
              <div className="source-row__meta">{s.label}</div>
            </div>
            <span className="source-row__count">{s.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* Reviews */
function ReviewsPanel({ clone }) {
  const reviews = REVIEWS_FOR(clone.handle);
  const dist = [5,4,3,2,1].map((star) => {
    // synthetic distribution
    const pcts = { 5: 78, 4: 16, 3: 4, 2: 1, 1: 1 };
    return { star, pct: pcts[star] };
  });
  return (
    <section className="panel">
      <div className="panel__title">
        Reviews
        <span className="panel__title__hint">{clone.ratings} verified queries</span>
      </div>

      <div className="rev-summary">
        <div className="rev-summary__big">
          <span className="rev-summary__big__num">{clone.rating.toFixed(1)}</span>
          <Stars rating={clone.rating} count={clone.ratings} hideCount />
          <span className="rev-summary__big__count">{clone.ratings.toLocaleString()} reviews</span>
        </div>
        <div className="rev-bars">
          {dist.map((d) => (
            <div key={d.star} className="rev-bar">
              <span className="rev-bar__lbl">{d.star}</span>
              <span style={{ display: "inline-flex" }}>{I.star(true)}</span>
              <span className="rev-bar__track">
                <span className="rev-bar__fill" style={{ width: `${d.pct}%` }}></span>
              </span>
              <span className="rev-bar__pct">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rev-list">
        {reviews.map((r, i) => (
          <div key={i} className="rev-item">
            <div className="rev-item__head">
              <div className="rev-item__av" style={{ background: r.color }}>{r.initial}</div>
              <div className="rev-item__name">{r.name}</div>
              <div className="rev-item__stars">
                {[1,2,3,4,5].map((s) => (
                  <span key={s} style={{ display: "inline-flex" }}>{I.star(s <= r.rating)}</span>
                ))}
              </div>
              <div className="rev-item__when">{r.date}</div>
            </div>
            <p className="rev-item__text">{r.text}</p>
            {r.reply && (
              <div className="rev-item__creator-reply">
                <strong>{clone.name.split(" ")[0]}:</strong> {r.reply}
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="btn btn--outline" style={{ marginTop: 16 }}>
        See all {clone.ratings} reviews {I.arrowS}
      </button>
    </section>
  );
}

/* Price card with plans */
function PriceCard({ clone, onAsk }) {
  const [plan, setPlan] = useState("single");
  const color = catColor(clone.cat);
  const plans = {
    single: { label: "Single", title: "Single query", price: clone.free ? 0 : clone.price, included: "1 query", features: ["1 question, full answer", "Cited sources", "Confidence score", "No subscription"] },
    pack:   { label: "Pack 25", title: "Pack of 25", price: clone.free ? 0 : +(clone.price * 22.5).toFixed(2), included: "25 queries", features: ["Save 10% vs single queries", "Cited sources", "Confidence score", "Credits never expire"] },
    pass:   { label: "Day pass", title: "1-day pass", price: clone.free ? 0 : 14.99, included: "Unlimited queries · 24h", features: ["Unlimited queries for 24h", "Priority response", "Cited sources", "Continues your last session"] },
  };
  const cur = plans[plan];

  return (
    <div className="price-card" style={{ "--clone-color": color }}>
      <div className="price-card__plans" role="tablist">
        {Object.entries(plans).map(([k, p]) => (
          <button
            key={k}
            className={`price-card__plan ${plan === k ? "price-card__plan--active" : ""}`}
            onClick={() => setPlan(k)}
            role="tab"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="price-card__amount">
        {clone.free ? (
          <span className="price-card__amount__big" style={{ color: "#059669" }}>Free</span>
        ) : (
          <>
            <span className="price-card__amount__big">${cur.price.toFixed(2)}</span>
            <span className="price-card__amount__unit">USD</span>
          </>
        )}
      </div>
      <div className="price-card__included">{cur.included}</div>

      <ul className="price-card__list">
        {cur.features.map((f, i) => (
          <li key={i}>{I.check} {f}</li>
        ))}
      </ul>

      <button className="price-card__cta" onClick={onAsk}>
        Ask {clone.name.split(" ")[0]} {I.arrow}
      </button>
      <button className="price-card__alt">Continue last session</button>

      <div className="price-card__guarantee">
        {I.shield}
        <div>
          <strong style={{ display: "block", color: "var(--fg-light-1)", fontWeight: 500 }}>Quiet refund</strong>
          Unhappy with an answer? Refund in one tap, no review required.
        </div>
      </div>
    </div>
  );
}

/* Seller card */
function SellerCard({ clone }) {
  const color = catColor(clone.cat);
  return (
    <div className="seller-card">
      <div className="seller-card__row">
        <div className="seller-card__av" style={{ background: color }}>{clone.name[0]}</div>
        <div>
          <div className="seller-card__name">{clone.name}</div>
          <div className="seller-card__handle">@{clone.handle} · {clone.role}</div>
        </div>
      </div>
      <div className="seller-card__stats">
        <div className="seller-stat">
          <span className="seller-stat__val">{clone.rating.toFixed(1)}</span>
          <span className="seller-stat__lbl">Avg. rating</span>
        </div>
        <div className="seller-stat">
          <span className="seller-stat__val">{clone.response}</span>
          <span className="seller-stat__lbl">Response time</span>
        </div>
        <div className="seller-stat">
          <span className="seller-stat__val">99%</span>
          <span className="seller-stat__lbl">On time</span>
        </div>
        <div className="seller-stat">
          <span className="seller-stat__val">3 yrs</span>
          <span className="seller-stat__lbl">On Doppel</span>
        </div>
      </div>
      <button className="seller-card__cta">Message {clone.name.split(" ")[0]}</button>
    </div>
  );
}

/* Trust grid */
function TrustGrid() {
  const rows = [
    { icon: I.shield,    title: "Verified expertise",  sub: "Each clone reviewed by Doppel and the human behind it." },
    { icon: I.source,    title: "Real sources cited",  sub: "Every answer points back to the document or thread it came from." },
    { icon: I.clock,     title: "Quiet refund",        sub: "Don't like an answer? Refund in one tap." },
    { icon: I.brain,     title: "Confidence scored",   sub: "Answers come with a confidence number, not a vibe." },
  ];
  return (
    <div className="trust">
      {rows.map((r, i) => (
        <div key={i} className="trust__row">
          <div className="trust__row__icon">{r.icon}</div>
          <div>
            <div className="trust__row__title">{r.title}</div>
            <div className="trust__row__sub">{r.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Quote card (signature line) */
function QuoteCard({ clone }) {
  const color = catColor(clone.cat);
  return (
    <section className="panel" style={{ background: `linear-gradient(180deg, ${color}06 0%, #fff 100%)`, borderColor: `${color}25` }}>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-light-3)", marginBottom: 10 }}>
        Signature line
      </div>
      <blockquote style={{ margin: 0, fontSize: 22, fontWeight: 300, lineHeight: 1.35, letterSpacing: "-0.015em", color: "var(--fg-light-1)" }}>
        &ldquo;{clone.quote}&rdquo;
      </blockquote>
      <div style={{ fontSize: 12, color: "var(--fg-light-2)", marginTop: 12 }}>
        — {clone.name}, drawn from {clone.sources[0].kind.toLowerCase()} archives
      </div>
    </section>
  );
}

/* About */
function AboutPanel({ clone }) {
  const items = [
    { icon: I.brain,     title: `${(clone.mem.episodic + clone.mem.semantic + clone.mem.procedural).toLocaleString()} memory units`, sub: `Drawn from ${clone.sources.length} connected sources.` },
    { icon: I.shield,    title: `${clone.queries.toLocaleString()} queries answered`, sub: `${clone.rating.toFixed(1)} average rating across ${clone.ratings} reviews.` },
    { icon: I.clock,     title: `Responds in ${clone.response}`, sub: `${clone.queue} other people are asking right now.` },
    { icon: I.sparkle,   title: `Updated weekly`,    sub: "Doppel re-ingests sources every 7 days to keep answers fresh." },
  ];
  return (
    <section className="panel">
      <div className="panel__title">About this clone</div>
      <ul className="about-list">
        {items.map((it, i) => (
          <li key={i}>
            <div className="about-list__icon">{it.icon}</div>
            <div>
              <strong>{it.title}</strong>
              <span className="about-list__sub">{it.sub}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* MAIN */
function DetailScreen({ clone, onBack, onAsk }) {
  if (!clone) clone = CLONES[0];
  return (
    <div data-screen-label={`02 Clone detail — ${clone.name}`}>
      <AppHeader variant="detail" breadcrumb={clone.name} onCrumbClick={(t) => t === "browse" && onBack?.()} />
      <DetailHero clone={clone} />

      <div className="dtl-body">
        <div className="dtl-left stagger">
          <AboutPanel clone={clone} />
          <MemoryBreakdown clone={clone} />
          <QuoteCard clone={clone} />
          <SampleQuestions clone={clone} onAsk={onAsk} />
          <SourcesPanel clone={clone} />
          <ReviewsPanel clone={clone} />
        </div>

        <aside className="dtl-side">
          <PriceCard clone={clone} onAsk={onAsk} />
          <SellerCard clone={clone} />
          <TrustGrid />
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { DetailScreen, PriceCard });
