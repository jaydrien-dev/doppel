/* ============================================================================
   Marketplace UI kit — Bundle detail (/marketplace/bundles/[id])
   ========================================================================== */

function BundleScreen({ onNav }) {
  const bundle = {
    name: 'Founder OS',
    desc: 'Five operator clones — finance, GTM, hiring, fundraising, product. Curated for first-time founders going from seed to Series A.',
    price: 99,
    seats: 1,
    clones: [
      { id: '5', name: 'Jia Park',   cat: 'finance',    queries: 540  },
      { id: '4', name: 'Reza Karim', cat: 'marketing',  queries: 6920 },
      { id: '6', name: 'Tom Vance',  cat: 'business',   queries: 4080 },
      { id: '1', name: 'Sarah Chen', cat: 'engineering',queries: 12438 },
      { id: '3', name: 'Maya Lee',   cat: 'design',     queries: 1842 },
    ],
    queries: 100,
    rating: 4.8,
    sold: 412,
  };

  return (
    <div data-screen-label="05 Bundle detail" className="app-shell">
      <Header breadcrumb={bundle.name}/>

      {/* Hero — neutral dark slab; bundles feel more "product" than personal */}
      <section style={{
        background: '#111827', padding: '48px 32px 56px',
        color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 1152, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.10)', fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--violet-400)' }}></span>
            Knowledge bundle
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>{bundle.name}</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginTop: 14, maxWidth: 560 }}>{bundle.desc}</p>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 22 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {[1,2,3,4,5].map(i => Icon.star(i <= Math.round(bundle.rating)))}
              <strong style={{ fontWeight: 500, marginLeft: 4 }}>{bundle.rating}</strong>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>({bundle.sold} sold)</span>
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{bundle.clones.length} clones</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{bundle.queries} queries included</span>
          </div>
        </div>
        {/* monogram strip background */}
        <div style={{ position: 'absolute', right: -40, top: -10, display: 'flex', gap: 12, opacity: 0.16 }}>
          {bundle.clones.slice(0, 5).map((c, i) => (
            <div key={c.id} style={{
              width: 96, height: 96, borderRadius: 20, background: catColor(c.cat),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 48, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
              transform: `translateY(${i * 12}px)`,
            }}>{c.name[0]}</div>
          ))}
        </div>
      </section>

      <div className="detail-body">
        <div className="detail-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="panel">
              <h3 className="panel__title">Included clones</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bundle.clones.map(c => {
                  const fullClone = CLONES.find(x => x.id === c.id) ?? c;
                  return (
                    <a key={c.id}
                       href="#"
                       onClick={(e) => { e.preventDefault(); onNav?.('detail', fullClone); }}
                       style={{
                         display: 'flex', alignItems: 'center', gap: 14,
                         padding: 12, background: 'var(--bg-light)',
                         border: '1px solid #F1F3F4', borderRadius: 12,
                         textDecoration: 'none', cursor: 'pointer',
                       }}>
                      <Avatar name={c.name} color={catColor(c.cat)} size={40} radius={12}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-light-1)' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-light-2)' }}>
                          {CATS[c.cat]?.label ?? 'Other'} · {c.queries.toLocaleString()} queries
                        </div>
                      </div>
                      <span style={{ color: 'var(--fg-light-3)' }}>{Icon.chevron}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <h3 className="panel__title">How bundles work</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  ['01', 'One purchase', 'Buy the bundle, get queries pooled across every clone inside.'],
                  ['02', 'Use as needed', 'Spend queries on whichever clone the question fits. No per-clone limits.'],
                  ['03', 'Never expires', 'Queries never expire. Bundles renew at your option, not on a clock.'],
                ].map(([n, t, d]) => (
                  <div key={n} style={{
                    padding: 16, background: 'var(--bg-light)',
                    border: '1px solid #F1F3F4', borderRadius: 12,
                  }}>
                    <span style={{ fontSize: 10, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--fg-light-3)' }}>{n}</span>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-light-1)', marginTop: 8 }}>{t}</div>
                    <p style={{ fontSize: 11, color: 'var(--fg-light-2)', marginTop: 6, lineHeight: 1.5 }}>{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="detail-side">
            <div className="price-panel">
              <div className="price-panel__amount">
                <strong>${bundle.price}</strong>
                <span>{bundle.queries} queries · {bundle.clones.length} clones</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 14, borderBottom: '1px solid #F1F3F4' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1.5px solid var(--doppel-blue)', background: 'var(--doppel-blue-soft)', borderRadius: 12, cursor: 'pointer' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: '1.5px solid var(--doppel-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--doppel-blue)' }}></span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-light-1)' }}>One-time · $99</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1.5px solid var(--border-light)', borderRadius: 12, cursor: 'pointer' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: '1.5px solid var(--border-light-hover)' }}></span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-light-1)' }}>Renew monthly · $79/mo</span>
                </label>
              </div>
              <button className="price-panel__cta" style={{ background: 'var(--doppel-blue)' }}>Get bundle →</button>
              <p className="price-panel__credits">Secure via Stripe · Refund within 14 days</p>
            </div>

            <div className="panel" style={{ padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-light-3)', margin: '0 0 10px' }}>What's included</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  '100 queries across all 5 clones',
                  'Synthesise queries across the bundle',
                  'Source citations on every answer',
                  'Conversation export as Markdown',
                  'Queries never expire',
                ].map((t, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--fg-light-2)' }}>
                    <span style={{ color: '#34A853', marginTop: 1 }}>{Icon.check}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BundleScreen });
