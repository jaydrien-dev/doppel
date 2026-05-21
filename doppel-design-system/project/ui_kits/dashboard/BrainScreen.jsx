/* ============================================================================
   Dashboard — Brain screen (/dashboard/brain)
   The "knowledge inspector" — topic coverage, memory inspector, gaps
   ========================================================================== */

function TopicRow({ topic, count, coverage, kind }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{topic}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{count} mem</span>
          {kind === 'gap' && <span className="badge badge--warn" style={{ padding: '1px 7px', fontSize: 9 }}>Gap</span>}
          {kind === 'strong' && <span className="badge badge--pos" style={{ padding: '1px 7px', fontSize: 9 }}>Strong</span>}
        </div>
        <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ width: `${coverage}%`, height: '100%',
            background: kind === 'gap' ? '#F87171' : kind === 'strong' ? '#34D399' : '#1A73E8',
            borderRadius: 999 }}></div>
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'ui-monospace, Menlo, monospace', width: 38, textAlign: 'right' }}>{coverage}%</span>
    </div>
  );
}

function MemoryCard({ title, kind, source, when, snippet }) {
  const kindColor = kind === 'episodic' ? '#1A73E8' : kind === 'semantic' ? '#34D399' : '#A78BFA';
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: kindColor, padding: '2px 7px', borderRadius: 6,
          background: `color-mix(in srgb, ${kindColor} 14%, transparent)`,
        }}>{kind}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{source}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{when}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{title}</div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, margin: 0 }}>{snippet}</p>
    </div>
  );
}

function BrainScreen() {
  const topics = [
    { topic: 'System architecture',     count: 412, coverage: 92, kind: 'strong' },
    { topic: 'Code review patterns',    count: 318, coverage: 88, kind: 'strong' },
    { topic: 'Hiring decisions',        count: 184, coverage: 71 },
    { topic: 'Budget planning',         count: 47,  coverage: 32, kind: 'gap' },
    { topic: 'Customer escalations',    count: 296, coverage: 84 },
    { topic: 'OKR planning',            count: 22,  coverage: 18, kind: 'gap' },
    { topic: 'Performance reviews',     count: 156, coverage: 68 },
  ];

  return (
    <div data-screen-label="03 Dashboard · Brain" className="db-page">
      <PageHead
        eyebrow="Brain"
        title={<>Inspect what your clone <em>actually knows.</em></>}
        subtitle="Every memory is traceable. See coverage gaps before someone else does."
        actions={<>
          <button className="btn">Export brain</button>
          <button className="btn btn--primary">Run audit</button>
        </>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatTile value="12,438" label="Total memories" sub="across 47 topics"/>
        <StatTile value="8,205"  label="Episodic" sub="conversations, decisions"/>
        <StatTile value="3,920"  label="Semantic" sub="facts, definitions"/>
        <StatTile value="313"    label="Procedural" sub="how-to patterns"/>
      </div>

      {/* Two col: topics + recent memories */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="db-h3">Topic coverage</h3>
            <button className="btn btn--ghost btn--sm">All 47 topics →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topics.map(t => <TopicRow key={t.topic} {...t}/>)}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="db-h3">Recent memories</h3>
            <button className="btn btn--ghost btn--sm">Browse all →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MemoryCard
              title="Postgres vs Dynamo for events"
              kind="episodic"
              source="design doc · #infra"
              when="Apr 2"
              snippet='"Single-table model would have forced duplicate writes everywhere. Picking Postgres + PgBouncer instead."'
            />
            <MemoryCard
              title="PgBouncer pool sizing"
              kind="semantic"
              source="email thread"
              when="Mar 28"
              snippet="Default pool of 20 is too small at 10M events/day. We run 50 with reserve."
            />
            <MemoryCard
              title="Code review checklist"
              kind="procedural"
              source="GitHub PRs"
              when="Mar 24"
              snippet="(1) Trace user flow, (2) check error paths, (3) test under load, (4) ask for the doc."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BrainScreen, TopicRow, MemoryCard });
