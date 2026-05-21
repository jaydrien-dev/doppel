/* ============================================================================
   Doppel — Browse screen (polished /marketplace landing)
   ========================================================================== */

/* Hero section */
function BrowseHero({ search, setSearch }) {
  return (
    <section className="hero">
      <div className="hero__grid" />
      <div className="hero__inner">
        <div className="anim-fade-up">
          <div className="hero__eyebrow">
            <span className="hero__eyebrow__dot"></span>
            8,420 clones · 412 queries answered in the last hour
          </div>
          <h1 className="hero__title">
            Ask the people who built it.
            <br />
            <em>Pay only when you do.</em>
          </h1>
          <p className="hero__sub">
            Doppel is a marketplace of AI clones trained on real expertise — engineers, operators, designers, clinicians. Query directly. Cite real sources. No subscriptions.
          </p>

          <div className="hero__search">
            <span className="hero__search__icon">{I.search}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Try "scaling a payments team" or "board memo"'
            />
            <button className="hero__search__go">Search {I.arrowS}</button>
          </div>

          <div className="hero__tags">
            <span className="hero__tags__label">Trending:</span>
            {["Engineering leadership", "GTM positioning", "Board prep", "Design critique"].map((t) => (
              <button key={t} className="hero__tag">{t}</button>
            ))}
          </div>
        </div>

        {/* Mock chat card */}
        <div className="hero__card anim-fade-up" style={{ animationDelay: "120ms" }}>
          <div className="hero__card__head">
            <div className="hero__card__head__avatar">SC</div>
            <div>
              <div className="hero__card__head__name">Sarah Chen</div>
              <div className="hero__card__head__role">VP Engineering · former Stripe</div>
            </div>
            <div className="hero__card__head__live">
              <span className="hero__card__head__live__dot"></span>
              Live
            </div>
          </div>
          <div className="hero__card__msg">When should I rewrite our payments service instead of refactoring?</div>
          <div className="hero__card__msg hero__card__msg--ai">
            Three signals push me toward rewrite: API surface is fundamentally wrong, the team can't reason about failure modes, and on-call cost exceeds new-feature cost. Otherwise refactor in flight.
          </div>
          <div className="hero__card__sources">
            <strong>92% confident</strong>
            <span>·</span>
            <span className="hero__card__sources__pill">3 sources</span>
            <span>·</span>
            <span>1.8s</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Category strip — no emoji, SVG glyphs (resolves design system violation) */
function CatStrip({ active, setActive }) {
  return (
    <div className="cats">
      <button
        className={`cat ${active === "" ? "cat--active" : ""}`}
        onClick={() => setActive("")}
        style={{ "--cat-color": "var(--fg-light-2)" }}
      >
        <span className="cat__glyph">{I.layers}</span>
        All
        <span className="cat__count">{CLONES.length}</span>
      </button>
      {catKeys.map((k) => (
        <button
          key={k}
          className={`cat ${active === k ? "cat--active" : ""}`}
          onClick={() => setActive(active === k ? "" : k)}
          style={{ "--cat-color": CATS[k].color }}
        >
          <span className="cat__glyph">{CATS[k].glyph}</span>
          {CATS[k].label}
          <span className="cat__count">{CAT_COUNTS[k]}</span>
        </button>
      ))}
    </div>
  );
}

/* Sort row */
function SortRow({ count, total, view, setView, sort, setSort, hasFilter, clear }) {
  return (
    <div className="sortrow">
      <div className="sortrow__count">
        <strong>{count.toLocaleString()}</strong> of {total.toLocaleString()} clones
        {hasFilter && (
          <button className="btn btn--ghost btn--sm" onClick={clear} style={{ marginLeft: 8 }}>
            {I.close} Clear filters
          </button>
        )}
      </div>
      <div className="sortrow__right">
        <div className="sortrow__view">
          <button
            className={`sortrow__view__btn ${view === "grid" ? "sortrow__view__btn--active" : ""}`}
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >{I.grid}</button>
          <button
            className={`sortrow__view__btn ${view === "list" ? "sortrow__view__btn--active" : ""}`}
            onClick={() => setView("list")}
            aria-label="List view"
          >{I.list}</button>
        </div>
        <div className="sortrow__sort">
          <span>Sort:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="best_rated">Best rated</option>
            <option value="most_queries">Most popular</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="newest">Newest</option>
            <option value="free_first">Free first</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/* Level badge (no emoji) */
function LevelBadge({ level }) {
  if (level === "top") return <span className="gig__pill gig__pill--top">{I.bolt} Top rated</span>;
  if (level === "lvl2") return <span className="gig__pill gig__pill--lvl2"><span className="gig__pill__dot"></span>Level 2</span>;
  if (level === "lvl1") return <span className="gig__pill gig__pill--lvl1"><span className="gig__pill__dot"></span>Level 1</span>;
  return null;
}

/* Clone card — quieter, ship-ready */
function CloneCard({ clone, onOpen, saved, toggleSave }) {
  const color = catColor(clone.cat);
  return (
    <a
      href={`#detail-${clone.id}`}
      className="gig"
      style={{ "--clone-color": color }}
      onClick={(e) => { e.preventDefault(); onOpen?.(clone); }}
    >
      <div className="gig__media">
        <div className="gig__media__initial">{clone.name[0]}</div>
        <div className="gig__media__badges">
          {clone.verified && (
            <span className="gig__pill gig__pill--verified">{I.check} Verified</span>
          )}
          <LevelBadge level={clone.level} />
        </div>
        <button
          className={`gig__heart ${saved ? "gig__heart--saved" : ""}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSave?.(clone.id); }}
          aria-label={saved ? "Remove from saved" : "Save clone"}
        >
          {saved ? I.heartFilled : I.heart}
        </button>
        <span className="gig__cat">{catLabel(clone.cat)}</span>
      </div>

      <div className="gig__body">
        <div className="gig__seller">
          <Monogram name={clone.name} color={color} size={24} radius={6} />
          <span className="gig__seller__name">{clone.name}</span>
          <span className="gig__seller__meta">{clone.role.split("·")[0].trim()}</span>
        </div>

        <p className="gig__desc">{clone.short}</p>

        <Stars rating={clone.rating} count={clone.ratings} />

        <div className="gig__divider"></div>

        <div className="gig__foot">
          <div className={`gig__price ${clone.free ? "gig__price--free" : ""}`}>
            <span>{clone.free ? "Free" : "Per query"}</span>
            <strong>{clone.free ? "Free" : `$${clone.price.toFixed(2)}`}</strong>
          </div>
          <span className="gig__queue">
            <span className="gig__queue__dot"></span>
            {clone.response}
          </span>
        </div>
      </div>
    </a>
  );
}

/* Skeleton (shimmer while loading) */
function SkeletonCard() {
  return (
    <div className="skel">
      <div className="skel__media shimmer"></div>
      <div className="skel__body">
        <div className="skel__line shimmer" style={{ width: "60%" }}></div>
        <div className="skel__line shimmer" style={{ width: "100%" }}></div>
        <div className="skel__line shimmer" style={{ width: "85%" }}></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <div className="skel__line shimmer" style={{ width: 70 }}></div>
          <div className="skel__line shimmer" style={{ width: 50 }}></div>
        </div>
      </div>
    </div>
  );
}

/* Main browse screen */
function BrowseScreen({ onOpen }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("best_rated");
  const [view, setView] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState({});
  const tref = useRef();

  // Initial "load" — short delay then reveal stagger
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 380);
    return () => clearTimeout(t);
  }, []);

  // Debounce search
  useEffect(() => {
    if (tref.current) clearTimeout(tref.current);
    tref.current = setTimeout(() => setDebounced(search), 220);
    return () => clearTimeout(tref.current);
  }, [search]);

  // Reset stagger when filters change
  const [filterKey, setFilterKey] = useState(0);
  useEffect(() => { setFilterKey((k) => k + 1); }, [cat, sort, debounced]);

  const toggleSave = (id) => setSaved((s) => ({ ...s, [id]: !s[id] }));

  const results = useMemo(() => {
    let list = CLONES.filter((c) => {
      if (cat && c.cat !== cat) return false;
      const q = debounced.trim().toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.short.toLowerCase().includes(q) && !c.tags.some((t) => t.includes(q))) return false;
      return true;
    });
    switch (sort) {
      case "most_queries": list = [...list].sort((a, b) => b.queries - a.queries); break;
      case "price_asc":    list = [...list].sort((a, b) => a.price - b.price); break;
      case "price_desc":   list = [...list].sort((a, b) => b.price - a.price); break;
      case "newest":       list = [...list].reverse(); break;
      case "free_first":   list = [...list].sort((a, b) => (a.free ? 0 : 1) - (b.free ? 0 : 1)); break;
      default:             list = [...list].sort((a, b) => b.rating - a.rating);
    }
    return list;
  }, [cat, sort, debounced]);

  const hasFilter = !!cat || !!debounced;

  return (
    <div data-screen-label="01 Marketplace — browse">
      <AppHeader variant="browse" search={search} setSearch={setSearch} />
      <BrowseHero search={search} setSearch={setSearch} />

      <div className="page">
        <CatStrip active={cat} setActive={setCat} />

        <SortRow
          count={results.length}
          total={CLONES.length}
          view={view}
          setView={setView}
          sort={sort}
          setSort={setSort}
          hasFilter={hasFilter}
          clear={() => { setCat(""); setSearch(""); setDebounced(""); }}
        />

        {loading ? (
          <div className="grid">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : results.length === 0 ? (
          <div className="empty anim-fade-up">
            <div className="empty__icon">{I.search}</div>
            <h3 className="empty__title">No clones match these filters.</h3>
            <p className="empty__sub">Try clearing the search or picking a different category.</p>
            <div className="empty__ctas">
              <button className="btn btn--primary" onClick={() => { setCat(""); setSearch(""); setDebounced(""); }}>Clear filters</button>
              <button className="btn btn--outline">List your clone {I.arrowS}</button>
            </div>
          </div>
        ) : (
          <div className={`grid stagger`} key={filterKey}>
            {results.map((c) => (
              <CloneCard
                key={c.id}
                clone={c}
                onOpen={onOpen}
                saved={!!saved[c.id]}
                toggleSave={toggleSave}
              />
            ))}
          </div>
        )}

        {/* For-creators CTA */}
        <div className="cta-strip anim-fade-up">
          <div className="cta-strip__grid" />
          <div className="cta-strip__inner">
            <div className="cta-strip__eyebrow">For creators</div>
            <h3 className="cta-strip__title">Earn from what you know.</h3>
            <p className="cta-strip__sub">Train a clone on your work. Set a price. Keep 80% of every paid query.</p>
          </div>
          <button className="btn btn--lg" style={{ background: "#fff", color: "var(--fg-light-1)" }}>
            Start selling {I.arrowS}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BrowseScreen, CloneCard, BrowseHero });
