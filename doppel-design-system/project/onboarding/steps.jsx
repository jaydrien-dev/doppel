/* ============================================================================
   Doppel onboarding — steps
   ========================================================================== */

/* ============ STEP 1: Pick a source ====================================== */
function Step1_Source({ onPick, onSkip, userName }) {
  const first = userName?.split(" ")[0] ?? "You";
  return (
    <>
      <div className="eyebrow"><span className="eyebrow__dot" /> Step 1 of 3 · 10 seconds</div>
      <h1 className="h-title">Welcome, {first}. Let's <em>feed your clone.</em></h1>
      <p className="h-sub">Pick a source. Your clone will start learning instantly — you'll see it work in the next step.</p>

      <div className="sources">
        {SOURCES.map((s) => (
          <button key={s.id} className="source" style={{ "--src-c": s.color }} onClick={() => onPick(s)}>
            <div className="source__head">
              <span className="source__icon">{s.icon}</span>
              <span className="source__name">{s.name}</span>
              {s.id === "gmail" && <span className="source__badge">Recommended</span>}
            </div>
            <div className="source__desc">{s.desc}</div>
            <div className="source__count"><span className="source__count__dot" />{s.count}</div>
          </button>
        ))}
      </div>

      <div className="source-alt">
        <span className="source-alt__line" />
        <button className="source-alt__btn" onClick={onSkip}>Skip — explore the app instead</button>
        <span className="source-alt__line" />
      </div>
    </>
  );
}

/* ============ STEP 2: Live training + first question ===================== */
function Step2_Train({ source, onContinue }) {
  const accent = source?.color ?? "#1A73E8";
  const [progress, setProgress] = useState(0);
  const [shown, setShown] = useState([]);  // discoveries surfaced so far
  const [stage, setStage] = useState("training"); // training -> ready -> answered
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState([]); // chat messages
  const [typing, setTyping] = useState(false);

  // Animate progress over ~12 seconds
  useEffect(() => {
    let raf, t0 = performance.now();
    const tick = (t) => {
      const dt = (t - t0) / 1000;
      const target = Math.min(100, dt * 9); // ~9% / sec
      setProgress(target);
      // Reveal discoveries as we cross thresholds
      setShown((prev) => {
        const next = DISCOVERIES.filter((d) => target >= d.at);
        return next.length > prev.length ? next : prev;
      });
      if (target < 100) raf = requestAnimationFrame(tick);
      else setStage((s) => (s === "training" ? "ready" : s));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The clone becomes "askable" at 30% (the aha trigger)
  const chatUnlocked = progress >= 30;

  // Counters derived from progress (fake-but-believable)
  const items = Math.round(progress * 142 / 100);
  const patterns = Math.min(8, Math.round(progress / 12));
  const memUnits = Math.round(progress * 4200 / 100);

  const suggestions = useMemo(() => {
    if (!source) return [];
    const map = {
      gmail:  ["What's been on my mind lately?", "Summarize my last 30 days of email", "What am I avoiding?"],
      slack:  ["What did I push back on this week?", "Who do I escalate to most?", "What are my open threads?"],
      notion: ["Summarize my latest RFCs", "What patterns recur in my docs?", "Help me draft a memo"],
      github: ["What do I push back on in code review?", "What's my comment style?", "Most common nit I leave"],
      upload: ["What's in the file I uploaded?", "Summarize the key points", "What are the open questions?"],
      paste:  ["What are the main themes in what I pasted?", "Summarize this in three bullets", "What's missing?"],
    };
    return map[source.id] ?? ["Tell me what you know about me", "What patterns have you noticed?", "What are my priorities?"];
  }, [source]);

  const ask = (text) => {
    if (!text.trim() || typing) return;
    setThread((th) => [...th, { who: "me", text }]);
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const responses = {
        "What's been on my mind lately?": {
          text: "Three things keep showing up: the Q3 hiring plan, technical debt around the events table, and customer #427's renewal. The third one comes up the most — six threads in two weeks.",
          conf: 91,
          srcs: [
            { kind: "Email", color: "#EA4335", label: "renewal thread, 6 emails" },
            { kind: "Email", color: "#EA4335", label: "hiring plan v3" },
          ],
        },
        "What am I avoiding?": {
          text: "You haven't replied to three messages from your CFO in the last 11 days. Subject lines all mention runway. That's higher than your baseline.",
          conf: 88,
          srcs: [{ kind: "Email", color: "#EA4335", label: "3 unread CFO threads" }],
        },
      };
      const r = responses[text] ?? {
        text: `From what I've seen so far in your ${source?.name}: you're consistent on the things that matter, and you defer the ones that don't have an owner. Ask me something specific and I'll go deeper.`,
        conf: 78,
        srcs: [{ kind: source?.name ?? "Source", color: accent, label: `${items} items reviewed` }],
      };
      setThread((th) => [...th, { who: "ai", ...r }]);
      setStage("answered");
    }, 1400);
  };

  return (
    <>
      <div className="eyebrow"><span className="eyebrow__dot" /> Step 2 of 3 · the moment</div>
      <h1 className="h-title">Your clone is <em>learning</em> from you.</h1>
      <p className="h-sub">Watch what it picks up. The second it has enough, you can ask it something — try it.</p>

      <div className="train">
        {/* Left: training */}
        <div className="train-card">
          <div className="train-head">
            <div className="train-head__icon">
              {source?.icon ?? I.brain}
              {progress < 100 && <span className="train-head__icon__spin" />}
            </div>
            <div>
              <div className="train-head__title">Training on {source?.name ?? "your data"}</div>
              <div className="train-head__sub">{progress < 100 ? "live · usually under a minute" : "ready to answer"}</div>
            </div>
            <div className="train-head__pct">{Math.round(progress)}%</div>
          </div>

          <div className="train-progress">
            <div className="train-progress__fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="train-counters">
            <div className="train-counter">
              <div className="train-counter__val">{items.toLocaleString()}</div>
              <div className="train-counter__lbl">items read</div>
            </div>
            <div className="train-counter">
              <div className="train-counter__val">{patterns}</div>
              <div className="train-counter__lbl">patterns found</div>
            </div>
            <div className="train-counter">
              <div className="train-counter__val">{memUnits.toLocaleString()}</div>
              <div className="train-counter__lbl">memory units</div>
            </div>
          </div>

          <div className="discoveries">
            <span className="discoveries__label">As your clone learns</span>
            {shown.length === 0 && (
              <div className="discovery" style={{ "--disc-c": accent }}>
                <span className="discovery__icon">{I.sparkle}</span>
                <span>
                  <span className="discovery__cat">Starting</span>
                  Connecting to {source?.name}…
                </span>
              </div>
            )}
            {[...shown].reverse().slice(0, 5).map((d, i) => (
              <div key={d.at} className="discovery" style={{ "--disc-c": d.color }}>
                <span className="discovery__icon">{d.icon}</span>
                <span>
                  <span className="discovery__cat">{d.cat}</span>
                  <span dangerouslySetInnerHTML={{ __html: d.text }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: chat (locked until 30%) */}
        <div className={`chat-card ${!chatUnlocked ? "chat-card--locked" : ""}`}>
          <div className="chat-card__head">
            <div className="chat-card__av">{(source?.name ?? "Y")[0]}</div>
            <div>
              <div className="chat-card__name">your clone</div>
              <div className={`chat-card__status ${chatUnlocked ? "chat-card__status--ready" : ""}`}>
                {chatUnlocked ? "Ready to answer" : "Warming up…"}
              </div>
            </div>
          </div>

          <div className="chat-card__body">
            {!chatUnlocked ? (
              <div className="chat-locked-state">
                <div className="chat-locked-state__icon">{I.bolt}</div>
                <div className="chat-locked-state__title">Just a moment.</div>
                <div className="chat-locked-state__sub">Your clone needs a few seconds of context. You'll be able to ask it something at 30%.</div>
              </div>
            ) : (
              <>
                {thread.length === 0 ? (
                  <div className="chat-locked-state" style={{ paddingTop: 12 }}>
                    <div className="chat-locked-state__title">Try asking your clone</div>
                    <div className="chat-locked-state__sub">Pick a suggestion below — or type your own. It'll answer using what it just learned.</div>
                  </div>
                ) : (
                  thread.map((m, i) => (
                    <div key={i} className={`chat-msg chat-msg--${m.who === "me" ? "me" : "ai"}`}>
                      <div className="chat-msg__bubble">{m.text}</div>
                    </div>
                  )).reduce((acc, el, i) => {
                    // Append source/confidence under AI bubbles
                    acc.push(el);
                    const m = thread[i];
                    if (m.who === "ai" && (m.srcs || m.conf)) {
                      acc.push(
                        <div key={`${i}-meta`} className="chat-msg chat-msg--ai">
                          <div style={{ width: "100%" }}>
                            {m.srcs && (
                              <div className="chat-msg__src">
                                {m.srcs.map((s, j) => (
                                  <span key={j} className="chat-msg__src__pill" style={{ "--src-c": s.color }}>
                                    <span className="chat-msg__src__pill__dot" />
                                    {s.kind} · {s.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {m.conf !== undefined && (
                              <div className="chat-msg__conf">
                                <span>Confidence</span>
                                <span className="chat-msg__conf__bar"><span style={{ width: `${m.conf}%` }} /></span>
                                <span className="chat-msg__conf__val">{m.conf}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return acc;
                  }, [])
                )}
                {typing && (
                  <div className="chat-msg chat-msg--ai">
                    <div className="chat-typing">
                      <span className="chat-typing__dot" />
                      <span className="chat-typing__dot" />
                      <span className="chat-typing__dot" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {chatUnlocked && thread.length === 0 && (
            <div className="chat-card__suggest">
              {suggestions.map((q, i) => (
                <button
                  key={i}
                  className="chat-suggest"
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => ask(q)}
                >
                  <span style={{ display: "inline-flex", color: accent }}>{I.msg}</span>
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="chat-card__composer">
            <input
              placeholder={chatUnlocked ? "Ask your clone something…" : "Warming up…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
              disabled={!chatUnlocked || typing}
            />
            <button onClick={() => ask(draft)} disabled={!chatUnlocked || !draft.trim() || typing} aria-label="Send">{I.send}</button>
          </div>
        </div>
      </div>

      <div className="foot-row">
        <button className="btn btn--primary btn--lg" onClick={onContinue} disabled={stage !== "answered"}>
          {stage === "answered" ? <>Continue {I.arrow}</> : "Ask your clone first"}
        </button>
        <button className="btn btn--ghost" onClick={onContinue}>Skip for now</button>
        <span className="foot-row__hint">
          {stage === "training" && <>Training… {Math.round(progress)}%</>}
          {stage === "ready" && <>Ready · ask anything above</>}
          {stage === "answered" && <span style={{ color: "#34D399" }}>Nice. Your clone works.</span>}
        </span>
      </div>
    </>
  );
}

/* ============ STEP 3: Share ============================================== */
function Step3_Share({ source, userName, onFinish }) {
  const accent = source?.color ?? "#1A73E8";
  const first = userName?.split(" ")[0] ?? "You";
  const handle = (userName?.split(" ")[0] ?? "you").toLowerCase();
  const url = `doppel.ai/c/${handle}`;
  const [copied, setCopied] = useState(false);
  const [public_, setPublic] = useState(true);
  const [terms, setTerms] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(`https://${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // Decorative orbiting dots
  const dots = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    color: ["#1A73E8","#A78BFA","#E91E63","#34D399","#FBBF24","#00838F"][i],
    delay: i * 0.4,
    duration: 6 + (i % 3),
  })), []);

  return (
    <>
      <div className="eyebrow"><span className="eyebrow__dot" /> Step 3 of 3 · share</div>
      <h1 className="h-title">Your clone is <em>live.</em></h1>
      <p className="h-sub">Share the link with anyone — they can ask it questions without an account.</p>

      <div className="share">
        <div className="share-preview">
          <div className="share-orbits">
            {dots.map((d, i) => (
              <span key={i} className="share-orbit-dot" style={{
                "--orbit-c": d.color,
                animation: `orbit ${d.duration}s linear infinite`,
                animationDelay: `${d.delay}s`,
                transform: `rotate(${i * 60}deg) translateX(${160 + (i % 3) * 30}px)`,
                marginLeft: "-4px", marginTop: "-4px",
              }} />
            ))}
          </div>
          <div className="share-card" style={{ "--accent": accent }}>
            <div className="share-card__chip">
              <span className="share-card__chip__dot" />
              Live
            </div>
            <div className="share-card__brand">
              <span className="share-card__brand__mark" />
              doppel
            </div>
            <div className="share-card__av">{first[0]}</div>
            <h3 className="share-card__name">{first}'s clone</h3>
            <p className="share-card__handle">@{handle} · trained on {source?.name ?? "your data"}</p>
            <div className="share-card__stats">
              <span className="share-card__stat"><strong>4,200</strong> memories</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span className="share-card__stat"><strong>8</strong> patterns</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span className="share-card__stat" style={{ marginLeft: "auto" }}>Ask anything →</span>
            </div>
          </div>
        </div>

        <div className="share-controls" style={{ "--accent": accent }}>
          <div className="share-url">
            <span className="share-url__label">URL</span>
            <span className="share-url__val">{url}</span>
            <button className={`share-url__copy ${copied ? "share-url__copy--copied" : ""}`} onClick={copy}>
              {copied ? <>{I.check} Copied</> : <>{I.copy} Copy</>}
            </button>
          </div>

          <div className="share-btns">
            <button className="share-btn" style={{ "--share-c": "#1DA1F2" }}>
              <span className="share-btn__icon">{I.twitter}</span>
              X / Twitter
            </button>
            <button className="share-btn" style={{ "--share-c": "#0A66C2" }}>
              <span className="share-btn__icon">{I.linkedin}</span>
              LinkedIn
            </button>
            <button className="share-btn" style={{ "--share-c": "#34D399" }}>
              <span className="share-btn__icon">{I.link}</span>
              Embed
            </button>
          </div>

          <div className="share-options">
            <label className={`share-option ${public_ ? "share-option--checked" : ""}`} onClick={() => setPublic(!public_)}>
              <span className="share-option__check">{I.check}</span>
              <div>
                <div className="share-option__body">Make my clone public</div>
                <div className="share-option__sub">Anyone with the link can ask. You can flip this off anytime.</div>
              </div>
            </label>
            <label className={`share-option ${terms ? "share-option--checked" : ""}`} onClick={() => setTerms(!terms)}>
              <span className="share-option__check">{I.check}</span>
              <div>
                <div className="share-option__body">I agree to the terms</div>
                <div className="share-option__sub">Standard ToS and privacy. Your data stays yours.</div>
              </div>
            </label>
          </div>

          <div className="cta-row">
            <button className="btn btn--primary btn--lg" onClick={onFinish} disabled={!terms}>
              Finish & enter your clone {I.arrow}
            </button>
            <button className="btn btn--ghost" onClick={onFinish}>Skip to dashboard</button>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Step1_Source, Step2_Train, Step3_Share });
