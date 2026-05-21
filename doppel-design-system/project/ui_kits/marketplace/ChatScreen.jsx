/* ============================================================================
   Marketplace UI kit — Public chat (/c/[handle]) — DARK surface
   The chat surface is dark even though entered from light marketplace.
   ========================================================================== */

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

const DEFAULT_THREAD = [
  { who: 'user', text: 'Why did we choose Postgres over Dynamo for the events table?' },
  { who: 'clone', text: "We evaluated both in Q3 2024. The main constraint was complex join patterns — Dynamo's single-table model would've forced duplicate writes everywhere. The events table is read by three different analytics queries that all need different access patterns.", confidence: 92, sources: 'email, Slack, design doc', sourceCount: 3 },
  { who: 'user', text: 'Were there any trade-offs you worried about?' },
  { who: 'clone', text: "Connection pool exhaustion at scale. That's why we set up PgBouncer from day one. I left a note about revisiting the choice at 10M events/day — we're not close to that yet.", confidence: 88, sources: 'design doc, slack #infra', sourceCount: 2 },
];

const SUGGESTED = [
  "What's the most important thing I should know about your domain?",
  "How do you make decisions under pressure?",
  "What trips up new people most often?",
];

function MessageBubble({ msg }) {
  if (msg.who === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, borderTopRightRadius: 4,
          padding: '10px 14px', fontSize: 14, color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.6, maxWidth: '75%',
        }}>{msg.text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600,
        flexShrink: 0, marginTop: 4,
      }}>{msg.cloneInitial ?? 'S'}</div>
      <div style={{ flex: 1, maxWidth: '80%' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 16, borderTopLeftRadius: 4,
          padding: '10px 14px', fontSize: 14, color: 'rgba(255,255,255,0.6)',
          lineHeight: 1.65,
        }}>{msg.text}</div>
        {msg.confidence && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 6,
              border: '1px solid rgba(52,211,153,0.25)', color: '#10B981',
            }}>{msg.confidence}% confident</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
              {msg.sourceCount} sources · {msg.sources}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatScreen({ clone, onBack }) {
  const [thread, setThread] = useStateC(clone ? DEFAULT_THREAD : []);
  const [input, setInput]   = useStateC('');
  const [thinking, setThinking] = useStateC(false);
  const bottomRef = useRefC(null);
  const initial = clone?.name?.[0] ?? 'S';

  useEffectC(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [thread, thinking]);

  function send(text) {
    if (!text.trim()) return;
    setThread(t => [...t, { who: 'user', text }]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      setThread(t => [...t, {
        who: 'clone', cloneInitial: initial,
        text: "That's a great question. From my notes: the team's instinct was to over-rotate on theory early, but every time we did the experiment we learned the answer was in the data, not the framework. Specific to your case — start with one customer cohort, instrument hard, and iterate weekly.",
        confidence: 84, sources: 'email, Slack, design doc', sourceCount: 3,
      }]);
      setThinking(false);
    }, 1100);
  }

  return (
    <div data-screen-label="04 Public chat (dark)" style={{
      minHeight: '100vh', background: '#080808', color: 'rgba(255,255,255,0.85)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,8,8,0.7)', backdropFilter: 'blur(12px) saturate(140%)',
        display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.45)', display: 'flex', padding: 6,
        }}>{Icon.back}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: clone ? catColor(clone.cat) : 'rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600,
          }}>{initial}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
              {clone?.name ?? 'Sarah Chen'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              @{clone?.name?.toLowerCase().replace(/\s+/g, '-') ?? 'sarah-chen'} · {clone?.queries?.toLocaleString() ?? '12,438'} queries
            </div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 999,
            background: 'rgba(52,211,153,0.10)', color: '#10B981',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: '#34D399' }}></span>
            knowledge preserved
          </span>
        </div>
      </header>

      {/* Conversation */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
        {thread.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: 360, gap: 28, textAlign: 'center',
          }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{clone?.name ?? 'Sarah Chen'}</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Trained on 6 years of decisions. Ask anything.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 380 }}>
              {SUGGESTED.map((q, i) => (
                <button
                  key={i}
                  onClick={() => send(q)}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12, padding: '12px 16px', fontFamily: 'inherit',
                    fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'left',
                    cursor: 'pointer', transition: 'all 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                >{q}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {thread.map((m, i) => <MessageBubble key={i} msg={m}/>)}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: 999,
                      background: 'rgba(255,255,255,0.3)',
                      animation: `pulse 1.4s ${i * 0.15}s infinite cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
                    }}></span>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Thinking…</span>
              </div>
            )}
            <div ref={bottomRef}></div>
          </>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '0 24px 20px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
        <div style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: '10px 14px',
          display: 'flex', alignItems: 'flex-end', gap: 8,
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={`Ask ${clone?.name?.split(' ')[0] ?? 'Sarah'} anything…`}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', resize: 'none',
              fontFamily: 'inherit', fontSize: 14, color: 'rgba(255,255,255,0.85)',
              outline: 'none', lineHeight: 1.5, padding: '4px 0', maxHeight: 120,
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            style={{
              width: 32, height: 32, borderRadius: 12,
              background: input.trim() ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.6)', cursor: input.trim() ? 'pointer' : 'not-allowed',
              flexShrink: 0,
            }}
          >{Icon.send}</button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>
          Shift+Enter for new line · Enter to send
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50%      { opacity: 0.9; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { ChatScreen });
