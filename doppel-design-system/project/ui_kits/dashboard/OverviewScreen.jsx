/* ============================================================================
   Dashboard — Overview screen (/dashboard)
   ========================================================================== */

function SourcesPanel() {
  const sources = [
    { key: 'gmail',   label: 'Gmail',         on: true },
    { key: 'slack',   label: 'Slack',         on: true },
    { key: 'github',  label: 'GitHub',        on: true },
    { key: 'notion',  label: 'Notion',        on: true },
    { key: 'meeting', label: 'Meetings',      on: false },
    { key: 'upload',  label: 'File upload',   on: true },
    { key: 'seed_qa', label: 'Manual Q&A',    on: false },
  ];
  return (
    <div className="card">
      <p className="card-title">Data sources</p>
      <div>
        {sources.map(s => (
          <div key={s.key} className="src-row">
            <span className="src-row__name">{s.label}</span>
            {s.on ? (
              <span className="src-row__status src-row__status--on">
                <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34D399' }}></span>
                Connected
              </span>
            ) : (
              <span className="src-row__status src-row__status--off">Not connected</span>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn--sm" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
        Manage sources
      </button>
    </div>
  );
}

function StyleFingerprint() {
  const traits = [
    ['Direct',         88],
    ['Cites sources',  94],
    ['Asks back',      62],
    ['Concise',        76],
    ['Reasoned',       85],
  ];
  return (
    <div className="card">
      <p className="card-title">Style fingerprint</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {traits.map(([name, pct]) => (
          <div key={name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{name}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#A78BFA', borderRadius: 999 }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTIVITY = [
  { text: 'Why did we choose Postgres over Dynamo for the events table?', conf: 92, sig: 'approved', when: '2m' },
  { text: 'How do you handle PgBouncer pool exhaustion at scale?',         conf: 88, sig: 'edited',   when: '14m' },
  { text: 'What was the reasoning behind the v3 auth refactor?',           conf: 76, sig: null,       when: '38m' },
  { text: 'When would you choose ClickHouse over Postgres?',               conf: 94, sig: 'approved', when: '1h' },
  { text: 'Why did Sarah escalate the K8s migration last quarter?',        conf: 45, sig: 'rejected', when: '2h', escalated: true },
  { text: 'Walk me through the design doc for the streaming pipeline.',    conf: 81, sig: 'approved', when: '3h' },
  { text: 'What\'s our policy on adding new dependencies?',                conf: 89, sig: null,       when: '4h' },
];

function RecentActivity() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ACTIVITY.map((a, i) => {
        const dotColor = a.sig === 'approved' ? '#34D399'
                       : a.sig === 'edited'   ? '#60A5FA'
                       : a.sig === 'rejected' ? '#F87171'
                       :                        'rgba(255,255,255,0.18)';
        return (
          <div key={i} className="act-row">
            <span className="act-row__dot" style={{ background: dotColor }}></span>
            <span className="act-row__text">{a.text}</span>
            <span className="act-row__meta">
              <span className="act-row__conf">{a.conf}%</span>
              {a.escalated && <span className="badge badge--warn" style={{ padding: '1px 7px', fontSize: 10 }}>escalated</span>}
              <span style={{ width: 22, textAlign: 'right', color: 'rgba(255,255,255,0.25)' }}>{a.when}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OverviewScreen() {
  return (
    <div data-screen-label="01 Dashboard · Overview" className="db-page">
      <PageHead
        eyebrow="Overview"
        title={<>Your clone is responding. <em>Stay in the loop.</em></>}
        actions={<>
          <button className="btn">View activity</button>
          <button className="btn btn--primary">Test clone {Icon.arrowRight}</button>
        </>}
      />

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatTile value="12,438" label="Memories" sub="6 sources connected"/>
        <StatTile value="8,205"  label="Episodic" sub="+4,233 semantic facts"/>
        <StatTile value="1,294"  label="Responses" sub="all reviewed"/>
        <StatTile value="92%"    label="Approval" sub="88% avg confidence"/>
      </div>

      {/* Two-up: activity + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
        <div>
          <h3 className="db-h3" style={{ marginBottom: 14 }}>Recent queries</h3>
          <RecentActivity/>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SourcesPanel/>
          <StyleFingerprint/>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OverviewScreen });
