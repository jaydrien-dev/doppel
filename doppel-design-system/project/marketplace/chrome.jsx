/* ============================================================================
   Doppel — shared chrome (header, demo-bar, scroll-aware behavior)
   ========================================================================== */

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/* Top demo-bar — lets reviewers switch between the polished surfaces in one place. */
function DemoBar({ screen, setScreen }) {
  const tabs = [
    { id: "browse", label: "Marketplace" },
    { id: "detail", label: "Clone detail" },
    { id: "chat",   label: "Public chat" },
  ];
  const tabsRowRef = useRef(null);
  const [pill, setPill] = useState({ left: 3, width: 0 });

  useEffect(() => {
    const row = tabsRowRef.current;
    if (!row) return;
    const btn = row.querySelector(`[data-tab="${screen}"]`);
    if (!btn) return;
    setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [screen]);

  return (
    <div className="demo-bar" data-screen-label="Demo · screen switcher">
      <div className="demo-bar__inner">
        <div className="demo-bar__brand"><span>d</span>oppel</div>
        <div className="demo-bar__caption">production polish · v1</div>
        <div className="demo-bar__tabs" ref={tabsRowRef}>
          <div className="demo-bar__tab-pill" style={{ left: pill.left, width: pill.width }} />
          {tabs.map((t) => (
            <button
              key={t.id}
              data-tab={t.id}
              className={`demo-bar__tab ${screen === t.id ? "demo-bar__tab--active" : ""}`}
              onClick={() => setScreen(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Light-surface header (browse + detail) */
function AppHeader({ variant, search, setSearch, breadcrumb, onCrumbClick, credits = 12 }) {
  const scrolled = useScrolled(4);
  return (
    <header className={`hdr ${scrolled ? "hdr--scrolled" : ""}`}>
      <div className="hdr__inner">
        <a className="hdr__brand" href="#" onClick={(e) => { e.preventDefault(); onCrumbClick?.("home"); }}>
          <span>d</span>oppel
        </a>

        {breadcrumb ? (
          <div className="hdr__crumbs">
            <span className="hdr__crumb__sep">{I.chevR}</span>
            <a className="hdr__crumb" href="#" onClick={(e) => { e.preventDefault(); onCrumbClick?.("browse"); }}>Marketplace</a>
            <span className="hdr__crumb__sep">{I.chevR}</span>
            <span className="hdr__crumb hdr__crumb--cur">{breadcrumb}</span>
          </div>
        ) : (
          <div className="hdr__search">
            <span className="hdr__search__icon">{I.search}</span>
            <input
              type="text"
              value={search ?? ""}
              onChange={(e) => setSearch?.(e.target.value)}
              placeholder="Search clones, expertise, topics…"
            />
            <span className="hdr__search__kbd">⌘ K</span>
          </div>
        )}

        <div className="hdr__actions">
          <span className="hdr__credits">
            <span className="hdr__credits__dot"></span>
            {credits} credits
          </span>
          <button className="btn btn--ghost btn--sm">Sell your knowledge</button>
          <button className="btn btn--primary btn--sm">Dashboard {I.arrowS}</button>
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { DemoBar, AppHeader, useScrolled });
