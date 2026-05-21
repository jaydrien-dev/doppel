/* ============================================================================
   Marketplace UI kit — Detail screen (the /marketplace/[handle] page)
   ========================================================================== */

const { useState: useStateD } = React;

const SAMPLE_QS = {
  engineering: ["How do you approach system design decisions?", "What's your debugging process for hard bugs?", "How do you balance speed vs correctness?"],
  business:    ["What's your approach to building company culture?", "How do you handle stakeholder pushback?", "What's the most important metric you track?"],
  design:      ["How do you handle design–engineering conflicts?", "What's your process for user research?", "How do you know when a design is done?"],
  marketing:   ["How do you position a new product?", "What's your GTM playbook?", "How do you measure brand awareness?"],
  finance:     ["How do you build a 3-year financial model?", "What metrics matter most at seed stage?", "How should I think about burn rate?"],
  default:     ["What do you know best?", "What would you advise a beginner?", "What's the most important lesson you've learned?"],
};

function MemoryTile({ count, label, color, pct }) {
  return (
    <div className="mem-tile">
      <div className="mem-tile__count">{count.toLocaleString()}</div>
      <div className="mem-tile__label">{label}</div>
      <div className="mem-tile__bar"><span style={{ width: `${pct}%`, background: color }}></span></div>
      <div className="mem-tile__pct">{pct}% of total</div>
    </div>
  );
}

function ReviewItem({ rating, text, date, color, initial }) {
  return (
    <div style={{ paddingBottom: 16, borderBottom: '1px solid #F1F3F4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 999, background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600,
        }}>{initial}</div>
        <Stars rating={rating}/>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-light-3)' }}>{date}</span>
      </div>
      {text && <p style={{ fontSize: 13, color: 'var(--fg-light-2)', lineHeight: 1.55, paddingLeft: 34, margin: 0 }}>{text}</p>}
    </div>
  );
}

function DetailScreen({ clone, onBack, onChat }) {
  const [userRating, setUserRating] = useStateD(0);
  const [reviewText, setReviewText] = useStateD('');
  const [submitted, setSubmitted] = useStateD(false);
  if (!clone) return null;

  const color = catColor(clone.cat);
  const samples = SAMPLE_QS[clone.cat] ?? SAMPLE_QS.default;
  const mem = {
    episodic: Math.round(clone.mem * 0.55),
    semantic: Math.round(clone.mem * 0.32),
    procedural: Math.round(clone.mem * 0.13),
  };
  const total = mem.episodic + mem.semantic + mem.procedural;

  return (
    <div data-screen-label="02 Marketplace · clone detail" className="app-shell" style={{ '--clone-color': color }}>
      <Header breadcrumb={clone.name}/>

      {/* Hero */}
      <section className="detail-hero" style={{ background: color }}>
        <div className="detail-hero__inner">
          <div className="detail-hero__avatar">{clone.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="detail-hero__cat-pill">{CATS[clone.cat]?.label ?? 'Other'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="detail-hero__title">{clone.name}</h1>
              {clone.verified && (
                <span className="badge badge--verified" style={{ fontSize: 11 }}>{Icon.check}Verified</span>
              )}
            </div>
            <p className="detail-hero__desc">{clone.desc}</p>
            <div className="detail-hero__stats">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {[1,2,3,4,5].map(i => Icon.star(i <= Math.round(clone.rating)))}
                <strong style={{ marginLeft: 4 }}>{clone.rating.toFixed(1)}</strong>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>({clone.ratings} reviews)</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
              <span>{clone.queries.toLocaleString()} queries</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
              <span>{total.toLocaleString()} memories</span>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="detail-body">
        <div className="detail-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Memory breakdown */}
            <div className="panel">
              <h3 className="panel__title">Knowledge breakdown</h3>
              <div className="mem-grid">
                <MemoryTile count={mem.episodic}   label="Memories" color="#1A73E8" pct={Math.round(mem.episodic/total*100)}/>
                <MemoryTile count={mem.semantic}   label="Facts"    color="#2E7D32" pct={Math.round(mem.semantic/total*100)}/>
                <MemoryTile count={mem.procedural} label="Patterns" color="#7B1FA2" pct={Math.round(mem.procedural/total*100)}/>
              </div>
            </div>

            {/* Sample questions */}
            <div className="panel">
              <h3 className="panel__title">Things you can ask</h3>
              <p style={{ fontSize: 12, color: 'var(--fg-light-3)', margin: '0 0 14px' }}>
                Click any question to open a chat with {clone.name.split(' ')[0]}.
              </p>
              <div className="questions">
                {samples.map((q, i) => (
                  <a key={i} className="questions__row" onClick={(e) => { e.preventDefault(); onChat?.(clone); }}>
                    <span style={{ color }}>{Icon.message}</span>
                    <span style={{ flex: 1 }}>{q}</span>
                    <span style={{ color, opacity: 0 }} className="q-arrow">{Icon.arrowRight}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Reviews */}
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 className="panel__title" style={{ margin: 0 }}>Reviews</h3>
                <Stars rating={clone.rating} count={clone.ratings}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ReviewItem rating={5} text={`Asked ${clone.name.split(' ')[0]} a question I'd been struggling with for two weeks. Answer came back in 8 seconds, with three cited sources from her old design docs. Worth every credit.`} date="Apr 12" color={color} initial="A"/>
                <ReviewItem rating={5} text={`Way better than reading the team wiki. The clone actually has opinions and explains the reasoning, not just the conclusion.`} date="Mar 28" color={color} initial="J"/>
                <ReviewItem rating={4} text={`Good for technical questions. Less useful for organizational stuff outside her direct scope.`} date="Mar 15" color={color} initial="M"/>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="detail-side">
            <div className="price-panel">
              <div className="price-panel__amount">
                {clone.free ? (
                  <><strong style={{ color: '#34A853' }}>Free</strong><span>no cost to query</span></>
                ) : (
                  <><strong>${clone.price.toFixed(2)}</strong><span>per query</span></>
                )}
              </div>
              <button className="price-panel__cta" onClick={() => onChat?.(clone)}>
                Ask {clone.name.split(' ')[0]} →
              </button>
              <p className="price-panel__credits">42 credits remaining</p>
            </div>

            {!clone.free && (
              <div className="panel" style={{ padding: 18 }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-light-3)', margin: '0 0 12px' }}>Buy credits</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Starter', credits: 25, usd: 10 },
                    { label: 'Pro',     credits: 100, usd: 35, highlight: true },
                    { label: 'Power',   credits: 500, usd: 150 },
                  ].map(pack => (
                    <button key={pack.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '11px 14px', border: `1.5px solid ${pack.highlight ? 'var(--doppel-blue)' : 'var(--border-light)'}`,
                      background: pack.highlight ? 'var(--doppel-blue-soft)' : 'var(--bg-light)',
                      borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-light-1)' }}>{pack.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-light-3)' }}>{pack.credits} queries</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--doppel-blue)' }}>${pack.usd}</div>
                        <div style={{ fontSize: 10, color: 'var(--fg-light-3)' }}>${(pack.usd / pack.credits).toFixed(3)}/q</div>
                      </div>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: 'var(--fg-light-3)', marginTop: 12, textAlign: 'center' }}>
                  Secure via Stripe · Credits never expire
                </p>
              </div>
            )}

            <div className="panel" style={{ padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-light-3)', margin: '0 0 12px' }}>Rate this clone</p>
              {submitted ? (
                <p style={{ fontSize: 13, color: '#059669', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                  {Icon.check} Review submitted
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1,2,3,4,5].map(i => (
                      <button key={i} onClick={() => setUserRating(i)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                        {Icon.star(i <= userRating)}
                      </button>
                    ))}
                  </div>
                  {userRating > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Share your experience…"
                        rows={3}
                        style={{
                          width: '100%', padding: '10px 12px', resize: 'none',
                          background: 'var(--bg-light)', border: '1.5px solid var(--border-light)',
                          borderRadius: 12, fontFamily: 'inherit', fontSize: 12, color: 'var(--fg-light-1)',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => setSubmitted(true)}
                        style={{
                          padding: '9px 14px', border: 'none', background: color, color: '#fff',
                          borderRadius: 12, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        }}
                      >Submit review</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DetailScreen });
