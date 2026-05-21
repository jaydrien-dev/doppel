/* ============================================================================
   Dashboard — Test screen (/dashboard/test)
   Owner-mode chat: like /c/[handle] but with review/edit/escalate controls
   ========================================================================== */

const { useState: useStateTS, useEffect: useEffectTS, useRef: useRefTS } = React;

const TEST_THREAD = [
  { who: 'user', text: 'Walk me through how we handle the streaming pipeline backpressure.' },
  { who: 'clone', text: "Three layers. (1) Producer side: bounded channel, drops on overflow rather than blocks. (2) Kafka topic with a 7-day retention, dedicated consumer group per service. (3) Consumer side: ack only after successful write, with a dead-letter queue for poison messages. The dead-letter queue is the one most people forget — it'll save you in a 3am incident.", confidence: 89, sources: 'design doc · v2-streaming, Slack #infra', sourceCount: 2 },
  { who: 'user', text: 'What was the reasoning behind the 7-day retention specifically?' },
  { who: 'clone', text: "Budget. Storage costs at the Kafka tier are linear in retention. We modeled it against a worst-case 5-day outage scenario plus 2 days of headroom. If you have an SLA that demands longer replay, push it to 14 — but get sign-off first because the cost roughly doubles.", confidence: 82, sources: 'email thread Q3 budget review', sourceCount: 1 },
];

function ConfidenceBar({ value }) {
  const color = value >= 85 ? '#34D399' : value >= 65 ? '#FBBF24' : '#F87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{value}%</span>
      <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 999 }}></div>
      </div>
    </div>
  );
}

function TestMessage({ msg, ownerMode }) {
  const [feedback, setFeedback] = useStateTS(null);
  if (msg.who === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, borderTopRightRadius: 4,
          padding: '10px 14px', fontSize: 14, color: 'rgba(255,255,255,0.75)',
          lineHeight: 1.6, maxWidth: '75%',
        }}>{msg.text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600,
        flexShrink: 0, marginTop: 2,
      }}>S</div>
      <div style={{ flex: 1, maxWidth: '85%' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 16, borderTopLeftRadius: 4,
          padding: '11px 14px', fontSize: 14, color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.65,
        }}>{msg.text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, paddingLeft: 4 }}>
          <ConfidenceBar value={msg.confidence}/>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {msg.sourceCount} sources · {msg.sources}
          </span>
          {ownerMode && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button
                onClick={() => setFeedback('approve')}
                style={{
                  border: '1px solid', borderColor: feedback === 'approve' ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.06)',
                  background: feedback === 'approve' ? 'rgba(52,211,153,0.10)' : 'transparent',
                  color: feedback === 'approve' ? '#34D399' : 'rgba(255,255,255,0.45)',
                  padding: '4px 10px', borderRadius: 8, fontSize: 11,
                  fontFamily: 'inherit', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>{Icon.check} Approve</button>
              <button
                onClick={() => setFeedback('edit')}
                style={{
                  border: '1px solid', borderColor: feedback === 'edit' ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.06)',
                  background: feedback === 'edit' ? 'rgba(96,165,250,0.10)' : 'transparent',
                  color: feedback === 'edit' ? '#60A5FA' : 'rgba(255,255,255,0.45)',
                  padding: '4px 10px', borderRadius: 8, fontSize: 11,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>Edit</button>
              <button
                onClick={() => setFeedback('reject')}
                style={{
                  border: '1px solid', borderColor: feedback === 'reject' ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.06)',
                  background: feedback === 'reject' ? 'rgba(248,113,113,0.10)' : 'transparent',
                  color: feedback === 'reject' ? '#F87171' : 'rgba(255,255,255,0.45)',
                  padding: '4px 10px', borderRadius: 8, fontSize: 11,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>Reject</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestScreen() {
  const [thread, setThread] = useStateTS(TEST_THREAD);
  const [input, setInput]   = useStateTS('');
  const [thinking, setThinking] = useStateTS(false);
  const [mode, setMode] = useStateTS('owner');
  const bottomRef = useRefTS(null);

  useEffectTS(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [thread, thinking]);

  function send() {
    if (!input.trim()) return;
    setThread(t => [...t, { who: 'user', text: input }]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      setThread(t => [...t, {
        who: 'clone',
        text: "Honest answer: I'd push back on the framing. The right move depends entirely on which constraint you're optimizing for — latency, cost, or developer ergonomics. Tell me which it is and I can give you a real recommendation with citations.",
        confidence: 76, sources: 'design doc, slack #infra', sourceCount: 2,
      }]);
      setThinking(false);
    }, 900);
  }

  return (
    <div data-screen-label="04 Dashboard · Test" className="db-page" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 'unset' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%' }}>
        <PageHead
          eyebrow="Test"
          title={<>Chat with your clone <em>before anyone else does.</em></>}
          subtitle="Owner mode: approve, edit, or reject answers to teach the clone how you'd actually respond."
          actions={<>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 3 }}>
              {['owner','public'].map(m => (
                <button key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '6px 14px', borderRadius: 9, border: 'none',
                    background: mode === m ? 'rgba(255,255,255,0.07)' : 'transparent',
                    color: mode === m ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}>{m === 'owner' ? 'Owner mode' : 'Public preview'}</button>
              ))}
            </div>
          </>}
        />
      </div>

      {/* Chat surface */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 880, margin: '0 auto', width: '100%' }}>
        <div className="card" style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', minHeight: 440 }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {thread.map((m, i) => <TestMessage key={i} msg={m} ownerMode={mode === 'owner'}/>)}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.3)',
                      animation: `pulse 1.4s ${i * 0.15}s infinite cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
                    }}></span>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Thinking…</span>
              </div>
            )}
            <div ref={bottomRef}></div>
          </div>

          {/* Input */}
          <div style={{
            marginTop: 14, background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
            padding: '10px 14px',
            display: 'flex', alignItems: 'flex-end', gap: 8,
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Test a hard question…"
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', resize: 'none',
                fontFamily: 'inherit', fontSize: 14, color: 'rgba(255,255,255,0.85)',
                outline: 'none', lineHeight: 1.5, padding: '4px 0', maxHeight: 100,
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              style={{
                width: 30, height: 30, borderRadius: 10,
                background: input.trim() ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.6)', cursor: input.trim() ? 'pointer' : 'not-allowed',
                flexShrink: 0,
              }}>{Icon.send}</button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', margin: '12px 0 24px' }}>
          {mode === 'owner' ? 'Your feedback trains the clone. Approved responses become new memories.' : 'This is what consumers see — no controls, no internal sources.'}
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

Object.assign(window, { TestScreen });
