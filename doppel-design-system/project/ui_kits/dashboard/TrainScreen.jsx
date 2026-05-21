/* ============================================================================
   Dashboard — Train screen (/dashboard/train)
   ========================================================================== */

const { useState: useStateT } = React;

function ConnectorTile({ name, status, count, type, color }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: color, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, fontWeight: 600,
          }}>{name[0]}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{type}</div>
          </div>
        </div>
        {status === 'on' ? (
          <span className="badge badge--pos"><span className="badge__dot"></span>Connected</span>
        ) : status === 'syncing' ? (
          <span className="badge badge--neutral"><span className="badge__dot" style={{ background: '#FBBF24' }}></span>Syncing</span>
        ) : null}
      </div>
      {count != null && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>{count.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>items ingested</div>
          </div>
          <button className="btn btn--sm" style={{ background: 'transparent' }}>Configure</button>
        </div>
      )}
      {status === 'off' && (
        <button className="btn btn--primary" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
          {Icon.plus} Connect
        </button>
      )}
    </div>
  );
}

function TrainScreen() {
  const connectors = [
    { name: 'Gmail',   status: 'on',  count: 4820,  type: 'Email · 90 days history', color: '#EA4335' },
    { name: 'Slack',   status: 'on',  count: 6204,  type: '12 channels',             color: '#611F69' },
    { name: 'GitHub',  status: 'on',  count: 842,   type: 'PR reviews + commits',    color: '#1F2328' },
    { name: 'Notion',  status: 'on',  count: 392,   type: '4 spaces',                color: '#2F2F2F' },
    { name: 'Meetings',status: 'syncing', count: 156, type: 'Zoom · 30 days',        color: '#0B5CFF' },
    { name: 'File upload', status: 'on', count: 24, type: '23 PDFs · 1 XLSX',         color: '#6B7280' },
    { name: 'Manual Q&A',  status: 'off', count: null, type: 'Seed questions',        color: '#8E24AA' },
  ];

  return (
    <div data-screen-label="02 Dashboard · Train" className="db-page">
      <PageHead
        eyebrow="Train"
        title={<>Capture once. Compound forever.</>}
        subtitle="Connect sources, upload files, seed Q&A. Every signal sharpens the clone."
        actions={<button className="btn btn--primary">{Icon.plus} Add source</button>}
      />

      {/* Progress strip */}
      <div className="card" style={{ marginBottom: 24, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Training run · v3</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>4,233 new memories embedded · 1m 12s remaining</div>
          </div>
          <span className="badge badge--neutral">
            <span className="badge__dot" style={{ background: '#FBBF24' }}></span>Embedding
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ width: '68%', height: '100%', background: '#1A73E8', borderRadius: 999 }}></div>
        </div>
      </div>

      <h3 className="db-h3" style={{ marginBottom: 14 }}>Sources</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {connectors.map(c => <ConnectorTile key={c.name} {...c}/>)}
      </div>
    </div>
  );
}

Object.assign(window, { TrainScreen, ConnectorTile });
