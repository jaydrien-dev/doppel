/* ============================================================================
   Marketplace UI kit — Browse screen (the /marketplace landing)
   ========================================================================== */

const { useState: useStateB } = React;

// Sample clone fixtures
const CLONES = [
  { id: '1', name: 'Sarah Chen',  cat: 'engineering', price: 0.50, free: false, desc: 'Strategy & architecture trained on 6 years of engineering decisions and post-mortems.', rating: 4.9, ratings: 342, queries: 12438, mem: 11204, verified: true, level: 'top' },
  { id: '2', name: 'Amit Rao',    cat: 'engineering', price: 0,    free: true,  desc: 'Debugging, system design, code review — patterns from real PR threads.', rating: 4.8, ratings: 128, queries: 8205, mem: 7402, verified: true, level: '2' },
  { id: '3', name: 'Maya Lee',    cat: 'design',      price: 0.25, free: false, desc: 'Product design critique. Drawn from 700+ portfolio reviews and design-eng escalations.', rating: 4.7, ratings: 86,  queries: 1842, mem: 3120, verified: false, level: '1' },
  { id: '4', name: 'Reza Karim',  cat: 'marketing',   price: 0.40, free: false, desc: 'Positioning, GTM, brand. Series B → IPO playbooks from three exits.', rating: 4.9, ratings: 211, queries: 6920, mem: 5400, verified: true, level: '2' },
  { id: '5', name: 'Jia Park',    cat: 'finance',     price: 1.00, free: false, desc: 'CFO advisor. Cap table, runway, board prep — for first-time founders.', rating: 5.0, ratings: 64,  queries: 540,  mem: 2210, verified: true, level: '1' },
  { id: '6', name: 'Tom Vance',   cat: 'business',    price: 0.30, free: false, desc: 'Operator notes from scaling 3 SaaS companies past $50M ARR.', rating: 4.6, ratings: 154, queries: 4080, mem: 6280, verified: false, level: '2' },
  { id: '7', name: 'Lin Wei',     cat: 'healthcare',  price: 0,    free: true,  desc: 'Clinical operations playbook. Triage, staffing, EHR pitfalls.', rating: 4.5, ratings: 39,  queries: 312,  mem: 1820, verified: false, level: null },
  { id: '8', name: 'Eli Brooks',  cat: 'education',   price: 0.20, free: false, desc: 'Curriculum design + tutoring frameworks. 8 years teaching grad-level CS.', rating: 4.8, ratings: 92,  queries: 1612, mem: 2840, verified: true, level: '1' },
];

function CategoryStrip({ active, onChange }) {
  const cats = ['all', ...Object.keys(CATS).filter(k => k !== 'all')];
  return (
    <div className="mk-cats">
      {cats.map(c => (
        <button
          key={c}
          className={`mk-cat ${active === c ? 'mk-cat--active' : ''}`}
          style={{ '--cat-color': CATS[c].color }}
          onClick={() => onChange(c)}
        >
          <span className="mk-cat__glyph" style={{ color: active === c ? '#fff' : CATS[c].color }}>
            <svg width="12" height="12" viewBox="0 0 12 12">{CATS[c].glyph}</svg>
          </span>
          {CATS[c].label}
        </button>
      ))}
    </div>
  );
}

function LevelBadge({ level }) {
  if (level === 'top') return <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
    background: 'rgba(255,255,255,0.95)', color: '#D97706',
  }}>★ Top rated</span>;
  if (level === '2') return <span style={{
    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
    background: 'rgba(255,255,255,0.95)', color: 'var(--doppel-blue)',
  }}>Level 2</span>;
  if (level === '1') return <span style={{
    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
    background: 'rgba(255,255,255,0.95)', color: '#2E7D32',
  }}>Level 1</span>;
  return null;
}

function CloneCard({ clone, onOpen }) {
  const color = catColor(clone.cat);
  return (
    <a
      href="#"
      className="clone-card"
      style={{ '--clone-color': color }}
      onClick={(e) => { e.preventDefault(); onOpen(clone); }}
    >
      <div className="clone-card__banner">
        <span className="clone-card__banner-initial">{clone.name[0]}</span>
        <span className="clone-card__cat-pill">{CATS[clone.cat]?.label ?? 'Other'}</span>
        <span className={`clone-card__price ${clone.free ? 'clone-card__price--free' : 'clone-card__price--paid'}`}>
          {clone.free ? 'Free' : `$${clone.price.toFixed(2)}/q`}
        </span>
        <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 }}>
          {clone.verified && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
              background: 'rgba(255,255,255,0.95)', color: '#0D9488',
            }}>{Icon.check}Verified</span>
          )}
          <LevelBadge level={clone.level}/>
        </div>
      </div>
      <div className="clone-card__body">
        <div className="clone-card__seller">
          <Avatar name={clone.name} color={color} size={26}/>
          <div className="clone-card__name">{clone.name}</div>
        </div>
        <p className="clone-card__desc">{clone.desc}</p>
        <div className="clone-card__divider"></div>
        <div className="clone-card__footer">
          <Stars rating={clone.rating} count={clone.ratings}/>
          <span className="clone-card__stats">{clone.queries.toLocaleString()} queries · {clone.mem.toLocaleString()} mem</span>
        </div>
      </div>
    </a>
  );
}

function CTAStrip() {
  return (
    <div style={{
      marginTop: 40, padding: 24, borderRadius: 20,
      background: '#111827',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>For creators</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: '#fff' }}>List your clone. Earn per query.</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Keep 80% of every paid query. Set your own price.</div>
      </div>
      <button style={{
        padding: '12px 22px', borderRadius: 16, border: 'none',
        background: '#fff', color: '#1D1D1F',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}>Start selling →</button>
    </div>
  );
}

function BrowseScreen({ search, setSearch, category, setCategory, onOpen }) {
  const [sort, setSort] = useStateB('best_rated');
  const filtered = CLONES.filter(c => {
    if (category && category !== 'all' && c.cat !== category) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div data-screen-label="01 Marketplace · browse" className="app-shell">
      <Header search={search} onSearch={setSearch}/>

      <section className="mk-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="mk-hero__eyebrow">Marketplace</div>
          <h1 className="mk-hero__title">Knowledge for hire.</h1>
          <p className="mk-hero__subtitle">
            Query expert clones directly. Pay per question. No subscriptions, no gatekeepers.
          </p>
          <div className="mk-hero__search">
            {Icon.search}
            <input
              placeholder='Try "business strategy" or "system design"…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn--primary">Search</button>
          </div>
          <div className="mk-hero__tags">
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginRight: 4 }}>Popular:</span>
            {['business','engineering','finance','design'].map(c => (
              <button key={c} className="mk-hero__tag" onClick={() => setCategory(c)}>{CATS[c].label}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="mk-content">
        <CategoryStrip active={category || 'all'} onChange={(c) => setCategory(c === 'all' ? '' : c)}/>

        <div className="mk-sort">
          <span className="mk-sort__count">
            <strong>{filtered.length}</strong> clone{filtered.length !== 1 ? 's' : ''}
            {category ? ` in ${CATS[category].label}` : ' available'}
            {search ? ` matching "${search}"` : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-light-3)' }}>Sort by:</span>
            <select className="mk-sort__select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="best_rated">Best rated</option>
              <option value="most_queries">Most popular</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="newest">Newest</option>
              <option value="free_first">Free first</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ fontSize: 16, color: 'var(--fg-light-1)', fontWeight: 500 }}>No clones match.</p>
            <p style={{ fontSize: 13, color: 'var(--fg-light-3)', marginTop: 6 }}>Try clearing the filter or search.</p>
          </div>
        ) : (
          <div className="mk-grid">
            {filtered.map(c => <CloneCard key={c.id} clone={c} onOpen={onOpen}/>)}
          </div>
        )}

        <CTAStrip/>
      </div>
    </div>
  );
}

Object.assign(window, { BrowseScreen, CLONES, CategoryStrip, CloneCard, LevelBadge });
