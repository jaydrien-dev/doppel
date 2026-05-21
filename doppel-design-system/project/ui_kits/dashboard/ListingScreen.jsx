/* ============================================================================
   Dashboard — Listing screen (/dashboard/listing)
   Where creators configure how their clone shows up on the marketplace.
   ========================================================================== */

const { useState: useStateL } = React;

function ListingScreen() {
  const [pricing, setPricing] = useStateL('paid');
  const [price, setPrice]     = useStateL(0.5);
  const [published, setPub]   = useStateL(true);

  return (
    <div data-screen-label="05 Dashboard · Listing" className="db-page">
      <PageHead
        eyebrow="Marketplace · Listing"
        title={<>Configure how the world finds you.</>}
        subtitle="What people see on the marketplace. Pricing, positioning, sample questions. All editable, anytime."
        actions={<>
          <span className={`badge ${published ? 'badge--pos' : 'badge--neutral'}`}>
            <span className="badge__dot"></span>{published ? 'Live' : 'Draft'}
          </span>
          <button className="btn btn--primary">View live listing {Icon.arrowUpRight}</button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Basics */}
          <div className="card">
            <p className="card-title">Basics</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Display name" value="Sarah Chen"/>
              <Field label="Handle"       value="@sarah-chen" mono/>
              <Field label="Category">
                <select className="input" defaultValue="engineering">
                  <option value="business">Business</option>
                  <option value="engineering">Engineering</option>
                  <option value="design">Design</option>
                  <option value="marketing">Marketing</option>
                  <option value="finance">Finance</option>
                </select>
              </Field>
              <Field label="Tagline" value="Strategy & architecture trained on 6 years of engineering decisions and post-mortems." multi/>
            </div>
          </div>

          {/* Pricing */}
          <div className="card">
            <p className="card-title">Pricing</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {['free','paid'].map(p => (
                <button key={p}
                  onClick={() => setPricing(p)}
                  style={{
                    flex: 1, padding: 14, borderRadius: 12,
                    background: pricing === p ? 'rgba(26,115,232,0.10)' : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${pricing === p ? 'rgba(26,115,232,0.5)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>
                    {p === 'free' ? 'Free' : 'Per query'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {p === 'free' ? 'Public, no charge — build audience' : 'Set a price · keep 80%'}
                  </div>
                </button>
              ))}
            </div>
            {pricing === 'paid' && (
              <Field label="Price per query (USD)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input type="range" min={0.05} max={5} step={0.05} value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#1A73E8' }}/>
                  <div style={{
                    padding: '6px 12px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)',
                    fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, fontVariantNumeric: 'tabular-nums',
                    color: 'rgba(255,255,255,0.9)', minWidth: 78, textAlign: 'right',
                  }}>${price.toFixed(2)}</div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  <span>You earn <strong style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>${(price * 0.8).toFixed(3)}</strong> per query</span>
                  <span>Doppel fee 20%</span>
                </div>
              </Field>
            )}
          </div>

          {/* Sample questions */}
          <div className="card">
            <p className="card-title">Sample questions</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -8, marginBottom: 14 }}>
              These appear on your listing as clickable starters.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                "How do you approach system design decisions?",
                "What's your debugging process for hard bugs?",
                "How do you balance speed vs correctness?",
              ].map((q, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: 13, color: 'rgba(255,255,255,0.75)',
                }}>
                  <span style={{ flex: 1 }}>{q}</span>
                  <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 12 }}>×</button>
                </div>
              ))}
              <button className="btn" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                {Icon.plus} Add question
              </button>
            </div>
          </div>
        </div>

        {/* Right side: preview */}
        <div style={{ position: 'sticky', top: 32 }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
            Marketplace preview
          </p>
          {/* Mini clone card */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <div style={{ height: 110, background: '#7B1FA2', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 44, fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>S</span>
              <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 999 }}>Engineering</span>
              <span style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.95)', color: '#7B1FA2', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>
                {pricing === 'free' ? 'Free' : `$${price.toFixed(2)}/q`}
              </span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, background: '#7B1FA2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}>S</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1D1D1F' }}>Sarah Chen</div>
              </div>
              <p style={{ fontSize: 11, color: '#5F6368', lineHeight: 1.5, margin: 0 }}>
                Strategy & architecture trained on 6 years of engineering decisions and post-mortems.
              </p>
              <div style={{ borderTop: '1px solid #F1F3F4', margin: '12px 0 10px' }}></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9CA3AF' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="#FBBF24"><path d="M8 1.5l1.6 4.8H15l-4.1 3 1.5 4.8L8 11.4l-4.4 2.7 1.5-4.8-4.1-3h5.4z"/></svg>
                  <strong style={{ color: '#1D1D1F', fontWeight: 500 }}>4.9</strong> (342)
                </span>
                <span>12,438 q · 12,204 mem</span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
            Auto-updates as you edit.
          </p>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn--primary" style={{ width: '100%', justifyContent: 'center' }}>Save changes</button>
            <button
              className="btn"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setPub(p => !p)}
            >
              {published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, multi, mono, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{label}</label>
      {children ?? (
        multi
          ? <textarea className="input" rows={3} defaultValue={value} style={{ resize: 'none' }}/>
          : <input className="input" type="text" defaultValue={value} style={mono ? { fontFamily: 'ui-monospace, Menlo, monospace' } : {}}/>
      )}
    </div>
  );
}

Object.assign(window, { ListingScreen });
