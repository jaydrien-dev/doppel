/* ============================================================================
   Marketplace UI kit — Synthesis screen (/synthesis)
   ========================================================================== */

const { useState: useStateS } = React;

const SUB_CLONES = CLONES; // reuse

function CloneChip({ clone, selected, onToggle, disabled }) {
  const color = catColor(clone.cat);
  return (
    <button
      className={`clone-chip ${selected ? 'clone-chip--selected' : ''}`}
      onClick={onToggle}
      disabled={disabled && !selected}
      style={disabled && !selected ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
    >
      <span className="clone-chip__avatar" style={{ background: color }}>{clone.name[0]}</span>
      <span style={{ fontWeight: 500 }}>{clone.name}</span>
      {clone.price > 0 && <span style={{ fontSize: 10, color: selected ? 'rgba(255,255,255,0.6)' : 'var(--fg-light-3)' }}>{clone.price}cr</span>}
      {selected && <span style={{ color: 'var(--emerald-400)' }}>{Icon.check}</span>}
    </button>
  );
}

// Sample results
const SAMPLE_PERSPECTIVES = [
  { id: '4', name: 'Reza Karim',  confidence: 0.91, response: "Don't raise on the metric you have, raise on the narrative your last 6 months earns you. Current market = punishment for hand-wavy stories. If your numbers don't tell a clean compounding story, fix that for 2 more quarters before opening a process." },
  { id: '5', name: 'Jia Park',    confidence: 0.86, response: "Math first. If you have <14 months runway, you don't choose — you raise. Above 18 months, you have leverage; below that you're a buyer of capital not a seller. Bridge from existing investors at a flat round is usually faster than chasing new leads in this market." },
  { id: '1', name: 'Sarah Chen',  confidence: 0.78, response: "Not my domain, but from board prep work I've watched — the technical story matters more in 2025 than it did. Funds are pattern-matching on AI moats. If you have one, lead with it; if you don't, don't manufacture one." },
];
const SAMPLE_SYNTHESIS = "All three converge on the same point: don't raise from a position of weakness. Reza emphasizes the narrative — that the last 6 months of metrics need to tell a compounding story. Jia frames it as runway math: below 14 months you have no choice; above 18 you have leverage. Sarah adds that AI moats are now first-class diligence material. If you have one, surface it; if you don't, focus on metric quality first.";

function SynthesisScreen({ onNav }) {
  const [mode, setMode]         = useStateS('query');
  const [selected, setSelected] = useStateS(['4','5','1']);
  const [message, setMessage]   = useStateS('Should we raise a Series A right now, or wait two more quarters?');
  const [rounds, setRounds]     = useStateS(3);
  const [result, setResult]     = useStateS('query');  // 'idle' | 'query' | 'deliberate' | 'loading'
  const [activeTab, setActiveTab] = useStateS('synthesis');
  const [search, setSearchS]    = useStateS('');

  const maxSel = mode === 'deliberate' ? 2 : 5;
  const minSel = 2;
  const filtered = SUB_CLONES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const ready = selected.length >= minSel && selected.length <= maxSel && message.trim();

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function submit() {
    if (!ready) return;
    setResult(mode);
  }

  return (
    <div data-screen-label="03 Synthesis" className="app-shell">
      {/* Slim sticky top */}
      <header className="mk-header">
        <button onClick={() => onNav?.('browse')} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--fg-light-3)', display: 'flex' }}>{Icon.back}</button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-light-1)' }}>Synthesis</div>
          <div style={{ fontSize: 11, color: 'var(--fg-light-3)' }}>Query multiple clones together</div>
        </div>
        <div className="mk-header__actions">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-light-muted)', borderRadius: 12, fontSize: 12, fontWeight: 500, color: 'var(--fg-light-2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#1A73E8' }}></span>
            42 credits
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Mode toggle */}
        <div>
          <div className="synth-tabs">
            <button className={`synth-tab ${mode === 'query' ? 'synth-tab--active' : ''}`} onClick={() => { setMode('query'); setSelected(['4','5','1']); }}>Query all</button>
            <button className={`synth-tab ${mode === 'deliberate' ? 'synth-tab--active' : ''}`} onClick={() => { setMode('deliberate'); setSelected(['4','5']); }}>Deliberate</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--fg-light-2)', margin: '14px 0 0', lineHeight: 1.6 }}>
            {mode === 'query'
              ? 'Ask the same question to 2–5 clones. Get individual perspectives plus a synthesised answer. Costs 1 credit per clone.'
              : `Pick exactly 2 clones and give them a topic. They debate back and forth for ${rounds} rounds. Costs ${rounds * 2} credits.`}
          </p>
        </div>

        {/* Clone picker */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F3F4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-light-1)', margin: 0 }}>
              Select clones <span style={{ color: 'var(--fg-light-3)', fontWeight: 400 }}>({selected.length}/{maxSel}{mode === 'deliberate' ? ', exactly 2 required' : ''})</span>
            </p>
            {selected.length > 0 && (
              <button onClick={() => setSelected([])} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--fg-light-3)', cursor: 'pointer' }}>Clear</button>
            )}
          </div>
          <div style={{ padding: 12, borderBottom: '1px solid #F1F3F4' }}>
            <input
              placeholder="Search clones…"
              value={search}
              onChange={(e) => setSearchS(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px',
                background: 'var(--bg-light)', border: '1px solid var(--border-light)',
                borderRadius: 12, fontFamily: 'inherit', fontSize: 13,
                color: 'var(--fg-light-1)', outline: 'none',
              }}
            />
          </div>
          <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {filtered.map(c => (
              <CloneChip key={c.id} clone={c} selected={selected.includes(c.id)} onToggle={() => toggle(c.id)} disabled={selected.length >= maxSel}/>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F3F4' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-light-1)', margin: 0 }}>
              {mode === 'query' ? 'Your question' : 'Topic for deliberation'}
            </p>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={mode === 'query' ? 'Should we raise a Series A right now?' : 'Should startups focus on growth or profitability?'}
            rows={3}
            style={{
              width: '100%', padding: '12px 16px',
              border: 'none', resize: 'none', outline: 'none',
              fontFamily: 'inherit', fontSize: 13, color: 'var(--fg-light-1)',
              lineHeight: 1.6, background: 'transparent',
            }}
          />
        </div>

        {/* Rounds slider */}
        {mode === 'deliberate' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-light-2)', margin: 0 }}>Rounds: {rounds}</p>
            <input type="range" min={2} max={5} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--doppel-blue)' }}/>
            <p style={{ fontSize: 12, color: 'var(--fg-light-3)', margin: 0 }}>{rounds * 2} credits</p>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="primary" onClick={submit} icon={Icon.sparkle}>
            {mode === 'query'
              ? `Synthesise (${selected.length} credit${selected.length !== 1 ? 's' : ''})`
              : `Deliberate (${rounds * 2} credits)`}
          </Button>
          {!ready && <span style={{ fontSize: 12, color: 'var(--fg-light-3)' }}>
            {selected.length < minSel ? `Select at least ${minSel} clones` : 'Enter a question'}
          </span>}
        </div>

        {/* Results */}
        {result === 'query' && (
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg-light)', borderBottom: '1px solid #F1F3F4', display: 'flex', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-light-2)', margin: 0 }}>Results</p>
              <span style={{ fontSize: 10, color: 'var(--fg-light-3)' }}>3 credits used</span>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, padding: '12px 12px 0', background: 'var(--bg-light)', borderBottom: '1px solid #F1F3F4' }}>
              <button
                onClick={() => setActiveTab('synthesis')}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 500,
                  border: '1px solid', borderColor: activeTab === 'synthesis' ? 'var(--border-light)' : 'transparent',
                  borderBottom: activeTab === 'synthesis' ? '1px solid #fff' : '1px solid transparent',
                  marginBottom: -1, borderRadius: '8px 8px 0 0',
                  background: activeTab === 'synthesis' ? '#fff' : 'transparent',
                  color: activeTab === 'synthesis' ? 'var(--fg-light-1)' : 'var(--fg-light-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Synthesis</button>
              {SAMPLE_PERSPECTIVES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActiveTab(p.id)}
                  style={{
                    padding: '7px 14px', fontSize: 12, fontWeight: 500,
                    border: '1px solid', borderColor: activeTab === p.id ? 'var(--border-light)' : 'transparent',
                    borderBottom: activeTab === p.id ? '1px solid #fff' : '1px solid transparent',
                    marginBottom: -1, borderRadius: '8px 8px 0 0',
                    background: activeTab === p.id ? '#fff' : 'transparent',
                    color: activeTab === p.id ? 'var(--fg-light-1)' : 'var(--fg-light-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{p.name.split(' ')[0]}</button>
              ))}
            </div>
            <div style={{ padding: 22 }}>
              {activeTab === 'synthesis' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--fg-light-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{Icon.check}</div>
                    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-light-2)' }}>Synthesised answer</span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--fg-light-1)', lineHeight: 1.7, margin: 0 }}>{SAMPLE_SYNTHESIS}</p>
                </>
              ) : (
                (() => {
                  const p = SAMPLE_PERSPECTIVES.find(x => x.id === activeTab);
                  const c = SUB_CLONES.find(x => x.id === p.id);
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <Avatar name={p.name} color={catColor(c.cat)} size={26}/>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-light-1)', margin: 0 }}>{p.name}</p>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-light-3)' }}>{Math.round(p.confidence * 100)}% confidence</span>
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--fg-light-1)', lineHeight: 1.7, margin: 0 }}>{p.response}</p>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { SynthesisScreen, CloneChip });
