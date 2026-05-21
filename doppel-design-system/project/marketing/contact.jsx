/* ============================================================================
   Doppel — Contact page (with personality)
   ========================================================================== */

const DEPARTMENTS = [
  { id: "general", name: "General",     hint: "Anything else",      email: "hello@doppel.ai",   icon: I.msg,       color: "#1A73E8" },
  { id: "sales",   name: "Sales",       hint: "Enterprise, demos",  email: "sales@doppel.ai",   icon: I.building,  color: "#A78BFA" },
  { id: "privacy", name: "Privacy",     hint: "GDPR, data, audit",  email: "privacy@doppel.ai", icon: I.shield,    color: "#34D399" },
  { id: "bug",     name: "Bug report",  hint: "Something broken",   email: "support@doppel.ai", icon: I.bug,       color: "#FBBF24" },
  { id: "partner", name: "Partnership", hint: "Integrations, comms",email: "hi@doppel.ai",      icon: I.handshake, color: "#E91E63" },
];

function ContactPage({ onHome }) {
  const [dep, setDep] = useState("general");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [msg, setMsg] = useState("");
  const [stage, setStage] = useState("idle"); // idle | sending | sent

  const active = DEPARTMENTS.find((d) => d.id === dep);
  const max = 1200;

  const onSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !msg.trim()) return;
    setStage("sending");
    setTimeout(() => setStage("sent"), 900);
  };

  const reset = () => {
    setStage("idle"); setName(""); setEmail(""); setCompany(""); setMsg("");
  };

  return (
    <div className="contact" data-screen-label="Contact">
      <Nav onContact={() => {}} />
      <div className="contact__bg" />
      <div className="contact__bg__dots" />

      <div className="contact__inner">
        <div className="contact__head anim-fade-up">
          <div className="eyebrow" style={{ "--eyebrow-c": active.color }}>
            <span className="eyebrow__dot" /> Contact
          </div>
          <h1 className="contact__h1">
            Real people. <em>Quick replies.</em>
          </h1>
          <p className="contact__sub">
            A small team. We read every message. Pick the right desk and we'll route it fast.
          </p>

          <div className="contact__live">
            <span className="contact__live__dot" />
            On now · usually back in under 2 hours
          </div>
        </div>

        <div className="contact__layout">
          {/* Form card */}
          <div className="contact__card anim-fade-up" style={{ animationDelay: "60ms" }}>
            {stage === "sent" ? (
              <div className="success">
                <div className="success__icon">{I.check}</div>
                <h3 className="success__title">Got it.</h3>
                <p className="success__sub">
                  We'll reply to <strong>{email}</strong> within a couple of hours.
                </p>
                <button className="btn btn--secondary" onClick={reset}>Send another</button>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                {/* Department picker */}
                <div className="dep-picker">
                  {DEPARTMENTS.map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      className={`dep ${dep === d.id ? "dep--active" : ""}`}
                      style={{ "--dep-c": d.color }}
                      onClick={() => setDep(d.id)}
                    >
                      <span className="dep__icon">{d.icon}</span>
                      <div className="dep__name">{d.name}</div>
                      <div className="dep__hint">{d.hint}</div>
                    </button>
                  ))}
                </div>

                <div className="form-row">
                  <div className="field" style={{ "--field-c": active.color }}>
                    <label className="field__lbl">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                    />
                  </div>
                  <div className="field" style={{ "--field-c": active.color }}>
                    <label className="field__lbl">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      required
                    />
                  </div>
                </div>

                {(dep === "sales" || dep === "partner") && (
                  <div className="field" style={{ "--field-c": active.color, marginBottom: 12 }}>
                    <label className="field__lbl">Company</label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Acme Inc."
                    />
                  </div>
                )}

                <div className="field" style={{ "--field-c": active.color, marginBottom: 6 }}>
                  <label className="field__lbl">How can we help?</label>
                  <textarea
                    value={msg}
                    onChange={(e) => setMsg(e.target.value.slice(0, max))}
                    placeholder={
                      dep === "bug"     ? "What broke, what you expected, and steps to reproduce — please paste any console output." :
                      dep === "sales"   ? "Team size, primary use case, and any timeline." :
                      dep === "privacy" ? "Account email and the specific request (export, delete, etc.)." :
                      dep === "partner" ? "What you're building and how doppel might fit." :
                                          "The more detail, the faster we can help."
                    }
                    rows={6}
                    required
                  />
                </div>
                <div className="field__count">
                  <strong>{msg.length}</strong> / {max}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
                  <button
                    type="submit"
                    className="send"
                    style={{ "--send-c": active.color }}
                    disabled={stage === "sending"}
                  >
                    {stage === "sending" ? "Sending…" : <>Send to {active.name.toLowerCase()} {I.arrowS}</>}
                  </button>
                  <span style={{ fontSize: 12, color: "var(--fg-dark-3)" }}>
                    Or email <a href={`mailto:${active.email}`} style={{ color: active.color, textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.18)" }}>{active.email}</a>
                  </span>
                </div>
              </form>
            )}
          </div>

          {/* Side rail — color-coded support info */}
          <div className="contact__rail">
            <div className="rail-card anim-fade-up" style={{ "--rail-c": "#34D399", animationDelay: "120ms" }}>
              <div className="rail-card__icon">{I.clock}</div>
              <div className="rail-card__label">Response time</div>
              <div className="rail-card__val">Under 2 hours</div>
              <div className="rail-card__hint">Median across the last 30 days. Privacy & legal requests confirmed within 24 hours.</div>
              <div className="rail-card__sla"><span className="rail-card__sla__dot" /> On now · 9am–6pm PT</div>
            </div>

            <div className="rail-card anim-fade-up" style={{ "--rail-c": "#1A73E8", animationDelay: "180ms" }}>
              <div className="rail-card__icon">{I.brain}</div>
              <div className="rail-card__label">Looking to buy?</div>
              <div className="rail-card__val">Book a 20-minute walkthrough</div>
              <div className="rail-card__hint">A real human, no slides. We'll set up a clone on your own data on the call.</div>
            </div>

            <div className="rail-card anim-fade-up" style={{ "--rail-c": "#A78BFA", animationDelay: "240ms" }}>
              <div className="rail-card__icon">{I.building}</div>
              <div className="rail-card__label">Doppel AI, Inc.</div>
              <div className="rail-card__val">Made in San Francisco</div>
              <div className="rail-card__hint">SOC 2 Type II · GDPR compliant. Your data, your model, your control.</div>
            </div>
          </div>
        </div>
      </div>

      <Foot onContact={() => {}} />
    </div>
  );
}

Object.assign(window, { ContactPage });
