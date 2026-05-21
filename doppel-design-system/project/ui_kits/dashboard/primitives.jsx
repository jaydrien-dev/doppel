/* ============================================================================
   Dashboard UI kit — primitives & Sidebar
   ========================================================================== */

const { useState: useStateP } = React;

// --------------------------------------------------------------------------
// Icon library — sidebar + chrome
// --------------------------------------------------------------------------
const Icon = {
  overview: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.9"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.3"/></svg>,
  train: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.5"/></svg>,
  identity: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" fill="currentColor" opacity="0.7"/><path d="M2.5 14c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/></svg>,
  brain: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" fill="currentColor" opacity="0.9"/><circle cx="3" cy="4.5" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="13" cy="4.5" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="3" cy="11.5" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="13" cy="11.5" r="1.5" fill="currentColor" opacity="0.4"/><path d="M4.5 5L6.2 6.8M9.8 9.2L11.5 11M11.5 5L9.8 6.8M6.2 9.2L4.5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35"/></svg>,
  test: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 13.5L7 9.5M9 9.5L11 13.5M4 5H12L10 9.5H6L4 5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/><path d="M6.5 2.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/></svg>,
  deploy: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L13 7L8 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/><path d="M3 7H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/></svg>,
  browse: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.7"/><path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.8"/></svg>,
  listing: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" opacity="0.6"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7"/></svg>,
  earnings: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12L5.5 8l3 2 3-5 2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/><path d="M2 14.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.35"/></svg>,
  credits: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.6"/><path d="M8 5v6M5.5 7h4a1 1 0 010 2H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8"/></svg>,
  synthesis: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="4.5" cy="5" r="2.5" fill="currentColor" opacity="0.7"/><circle cx="11.5" cy="5" r="2.5" fill="currentColor" opacity="0.4"/><circle cx="8" cy="12" r="2.5" fill="currentColor" opacity="0.55"/><path d="M4.5 7.5L8 9.5M11.5 7.5L8 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/></svg>,
  bundles: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.65"/><path d="M5 5V4a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/></svg>,
  email: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/><path d="M1.5 6l6.5 4.5L14.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/></svg>,
  billing: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/><path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" opacity="0.5"/><rect x="3.5" y="9" width="3" height="1.5" rx="0.5" fill="currentColor" opacity="0.5"/></svg>,
  developer: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.6"/><path d="M5 7L3.5 8.5 5 10M11 7l1.5 1.5L11 10M8.5 6l-1.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" opacity="0.7"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.27 1.27M11.33 11.33l1.27 1.27M12.6 3.4l-1.27 1.27M4.67 11.33l-1.27 1.27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/></svg>,
  arrowRight: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrowUpRight: <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M5 11L11 5M5 5h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  send: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M8 3L3 8M8 3l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// --------------------------------------------------------------------------
// Sidebar — replicates components/layout/Sidebar.tsx
// --------------------------------------------------------------------------
const NAV_GROUPS = [
  { label: 'Clone',       color: '#1A73E8', items: [
    { id: 'overview', label: 'Overview', icon: Icon.overview },
    { id: 'train',    label: 'Train',    icon: Icon.train },
    { id: 'identity', label: 'Identity', icon: Icon.identity },
    { id: 'brain',    label: 'Brain',    icon: Icon.brain },
    { id: 'test',     label: 'Test',     icon: Icon.test },
    { id: 'deploy',   label: 'Deploy',   icon: Icon.deploy },
  ]},
  { label: 'Marketplace', color: '#34A853', items: [
    { id: 'browse',    label: 'Browse',    icon: Icon.browse },
    { id: 'listing',   label: 'Listing',   icon: Icon.listing },
    { id: 'earnings',  label: 'Earnings',  icon: Icon.earnings },
    { id: 'credits',   label: 'Credits',   icon: Icon.credits },
    { id: 'synthesis', label: 'Synthesis', icon: Icon.synthesis },
    { id: 'bundles',   label: 'Bundles',   icon: Icon.bundles },
  ]},
  { label: 'Surfaces',    color: '#EA4335', items: [
    { id: 'email',     label: 'Email',     icon: Icon.email },
  ]},
  { label: 'Account',     color: '#F59E0B', items: [
    { id: 'billing',   label: 'Billing',   icon: Icon.billing },
    { id: 'developer', label: 'Developer', icon: Icon.developer },
    { id: 'settings',  label: 'Settings',  icon: Icon.settings },
  ]},
];

function Sidebar({ active, onNav }) {
  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__brand-mark"></div>
        <span className="sb__brand-name">doppel</span>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="sb__group">
            <div className="sb__group-label" style={{ color: group.color }}>{group.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map(item => {
                const isActive = active === item.id;
                return (
                  <a key={item.id}
                     href="#"
                     className={`sb__item ${isActive ? 'sb__item--active' : ''}`}
                     style={isActive ? { '--active-color': group.color } : {}}
                     onClick={(e) => { e.preventDefault(); onNav(item.id); }}>
                    <span className="sb__item-icon">{item.icon}</span>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sb__footer">
        <div className="sb__user">
          <div className="sb__user-avatar">S</div>
          <div>
            <div className="sb__user-name">Sarah Chen</div>
            <span className="sb__user-tier">Pro</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// --------------------------------------------------------------------------
// Page chrome
// --------------------------------------------------------------------------
function PageHead({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="db-page-head">
      <div>
        {eyebrow && <p className="db-eyebrow">{eyebrow}</p>}
        <h1 className="db-h1">{title}</h1>
        {subtitle && <p style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.45)', maxWidth: 520, lineHeight: 1.6 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

function StatTile({ value, label, sub }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
      {sub && <div className="stat-tile__sub">{sub}</div>}
    </div>
  );
}

Object.assign(window, { Icon, NAV_GROUPS, Sidebar, PageHead, StatTile });
