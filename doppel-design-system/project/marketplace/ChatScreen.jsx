/* ============================================================================
   Doppel — Public Chat (dark surface)
   ========================================================================== */

/* Scripted conversation — gives a realistic "send to customers" preview */
const CHAT_THREAD = [
  { who: "ai", t: "Hi — I'm Sarah's clone. I'll answer in her voice, cite real sources, and give you a confidence score. What are you working on?", sources: 0 },
  { who: "me", t: "We're rewriting our payments service. Three engineers want a clean room rewrite. Two want to refactor in flight. How would you decide?" },
  { who: "ai", t: "Short version: don't rewrite unless you're solving a problem refactor can't solve.",
    paras: [
      "Three signals push me toward a rewrite: the API surface is fundamentally wrong, the team can't reason about failure modes anymore, and on-call cost exceeds the cost of new feature work. If any one of those is true, refactor is fighting gravity.",
      "If it's mostly performance, structure, or test coverage — refactor wins. You keep traffic, you keep tribal knowledge, you keep velocity.",
      "When I rewrote it at Stripe in 2021 we made the rule explicit: rewrite is allowed only when refactor has been tried for two quarters and the on-call rotation is still bleeding people.",
    ],
    sources: [
      { kind: "Notion", title: "Payments rewrite RFC, Apr 2021" },
      { kind: "Slack",  title: "#payments-arch, 14 threads" },
      { kind: "Email",  title: "Post-mortem, June 2021" },
    ],
    confidence: 92,
    elapsed: "1.8s",
  },
  { who: "me", t: "How did you actually make the call internally? Was it consensus?" },
];

function CitePill({ s }) {
  return (
    <span className="msg__cite__pill">
      <span className="msg__cite__pill__icon">{I.source}</span>
      <span>{s.kind}</span>
      <span style={{ color: "var(--fg-dark-3)" }}>— {s.title}</span>
    </span>
  );
}

/* Animated confidence bar that fills on mount */
function ConfidenceBar({ value }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value), 80);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="msg__conf">
      <span style={{ color: "var(--fg-dark-2)" }}>Confidence</span>
      <span className="msg__conf__bar"><span style={{ width: `${w}%` }}></span></span>
      <span className="msg__conf__val">{value}%</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg msg--ai">
      <div className="msg__av" style={{ background: catColor("engineering") }}>S</div>
      <div className="typing">
        <span className="typing__dot"></span>
        <span className="typing__dot"></span>
        <span className="typing__dot"></span>
      </div>
    </div>
  );
}

function MsgBubble({ m }) {
  return (
    <div className={`msg msg--${m.who}`}>
      {m.who === "ai" && <div className="msg__av" style={{ background: catColor("engineering") }}>S</div>}
      <div className="msg__col">
        <div className="msg__bubble">
          {m.paras ? m.paras.map((p, i) => <p key={i}>{p}</p>) : <p>{m.t}</p>}
        </div>

        {m.sources && m.sources.length > 0 && (
          <div className="msg__cite">
            <span className="msg__cite__label">{I.source} Sources</span>
            {m.sources.map((s, i) => <CitePill key={i} s={s} />)}
          </div>
        )}

        {m.confidence !== undefined && (
          <div className="msg__conf">
            <ConfidenceBar value={m.confidence} />
            <span className="msg__conf__bar" style={{ width: 60, background: "transparent" }}></span>
            <span style={{ color: "var(--fg-dark-3)" }}>· {m.elapsed}</span>
          </div>
        )}

        {m.who === "ai" && (
          <div className="msg__actions">
            <button className="msg__act" aria-label="Copy">{I.copy}</button>
            <button className="msg__act" aria-label="Regenerate">{I.refresh}</button>
            <button className="msg__act" aria-label="Helpful">{I.up}</button>
            <button className="msg__act" aria-label="Not helpful">{I.down}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatHeader({ clone, onBack }) {
  return (
    <header className="chat-hdr">
      <div className="chat-hdr__inner">
        <button className="chat-hdr__back" onClick={onBack} aria-label="Back">{I.back}</button>
        <div className="chat-hdr__av" style={{ background: catColor(clone.cat) }}>{clone.name[0]}</div>
        <div className="chat-hdr__id">
          <div className="chat-hdr__name">
            {clone.name}
            <span className="chat-hdr__status">
              <span className="chat-hdr__status__dot"></span>
              Online · {clone.queue} asking now
            </span>
          </div>
          <div className="chat-hdr__meta">
            <span>{clone.role}</span>
            <span className="chat-hdr__meta__sep">·</span>
            <span>{clone.queries.toLocaleString()} queries</span>
            <span className="chat-hdr__meta__sep">·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {I.star(true)} {clone.rating.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="chat-hdr__actions">
          <button className="chat-hdr__act" aria-label="Share">{I.share}</button>
          <button className="chat-hdr__act" aria-label="More">{I.more}</button>
        </div>
      </div>
    </header>
  );
}

function Composer({ value, setValue, onSend, sending }) {
  const ref = useRef(null);
  // Auto-grow textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(200, el.scrollHeight) + "px";
  }, [value]);
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend();
    }
  };
  return (
    <>
      <div className="composer">
        <button className="composer__tool" aria-label="Attach">{I.paperclip}</button>
        <textarea
          ref={ref}
          rows="1"
          placeholder="Ask anything…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="composer__send" disabled={!value.trim() || sending} onClick={onSend} aria-label="Send">
          {I.send}
        </button>
      </div>
      <div className="composer-meta">
        <span className="composer-meta__cost">{I.bolt} <strong>1 credit</strong> per question</span>
        <span>· $0.50 each, refundable</span>
        <span className="composer-meta__right">Enter to send · Shift+Enter for new line</span>
      </div>
    </>
  );
}

function ChatScreen({ clone, onBack }) {
  if (!clone) clone = CLONES.find((c) => c.id === "sarah-chen") ?? CLONES[0];
  const [thread, setThread] = useState(() => CHAT_THREAD);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  // Scroll to bottom when thread changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [thread, pending]);

  const suggestions = useMemo(() => SAMPLE_QS[clone.cat] ?? SAMPLE_QS.engineering, [clone.cat]);

  const send = (text) => {
    const t = (text ?? draft).trim();
    if (!t) return;
    setThread((th) => [...th, { who: "me", t }]);
    setDraft("");
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setThread((th) => [...th, {
        who: "ai",
        paras: [
          "Honestly? Not consensus. We tried for a while and it bled out into a six-week debate. What worked was a written decision: I wrote a one-pager with the call, the reasons, and what would change my mind.",
          "Then I shared it before the meeting and asked: 'Where am I wrong?' That separated the people who had real objections from the ones who were upset I'd already decided.",
        ],
        sources: [{ kind: "Notion", title: "Decision-doc template" }, { kind: "Slack",  title: "#payments-arch thread, May 2021" }],
        confidence: 88,
        elapsed: "2.1s",
      }]);
    }, 1400);
  };

  return (
    <div className="chat-page" data-screen-label="03 Public chat — Sarah Chen">
      <ChatHeader clone={clone} onBack={onBack} />

      <div className="chat-banner">
        <span className="chat-banner__pill">{I.sparkle} Sarah's clone remembers your last 2 sessions</span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="msg-day">Today · 2:34 PM</div>

        {thread.map((m, i) => (
          <MsgBubble key={i} m={m} />
        ))}

        {pending && <TypingIndicator />}

        {/* Suggestion chips after the AI's first message */}
        {thread.length <= 1 && !pending && (
          <div style={{ marginLeft: 44 }}>
            <span className="chat-intro__caption">Try one of these</span>
            <div className="suggest">
              {suggestions.map((q, i) => (
                <button key={i} className="suggest__chip" onClick={() => send(q)}>
                  <span className="suggest__chip__icon">{I.msg}</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <Composer
          value={draft}
          setValue={setDraft}
          onSend={() => send()}
          sending={pending}
        />
      </div>
    </div>
  );
}

Object.assign(window, { ChatScreen });
