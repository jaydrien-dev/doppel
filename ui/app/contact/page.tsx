"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`nav ${scrolled ? "nav--scrolled" : ""}`}>
      <div className="nav__inner">
        <Link href="/" className="nav__brand">
          <span className="nav__brand__mark" />
          doppel
        </Link>
        <nav className="nav__links">
          <a className="nav__link" href="/#demo">Demo</a>
          <a className="nav__link" href="/#why">Why</a>
          <a className="nav__link" href="/#pricing">Pricing</a>
          <Link className="nav__link" href="/contact">Contact</Link>
        </nav>
        <div className="nav__cta-group">
          <Link href="/sign-in" className="btn btn--ghost">Sign in</Link>
          <Link href="/sign-up" className="btn btn--primary">
            Start free{" "}
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Foot
// ---------------------------------------------------------------------------
function Foot() {
  return (
    <footer className="foot">
      <div className="foot__inner">
        <div className="foot__brand">doppel</div>
        <span className="foot__legal">&copy; 2026 Doppel AI, Inc.</span>
        <div className="foot__links">
          <Link href="/contact">Contact</Link>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const ICO = {
  msg: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7A1.5 1.5 0 0112.5 12H9l-3 2v-2H3.5A1.5 1.5 0 012 10.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  chart: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="9" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  shield: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4.5v4C3 11.5 5.5 14 8 14.5 10.5 14 13 11.5 13 8.5v-4L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5.5 8.5l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  bug: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="9" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 5.5C6 4.67 6.9 4 8 4s2 .67 2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M2 8.5h2M12 8.5h2M3 6l1.5 1.5M13 6l-1.5 1.5M3 12l1.5-1.5M13 12l-1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  link: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M8.5 11.5l-1.5 1.5a3 3 0 01-4.24-4.24L4.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M7.5 4.5L9 3a3 3 0 014.24 4.24L11.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  star: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 2l1.5 4.5H14l-3.8 2.8 1.5 4.5L8 11l-3.7 2.8 1.5-4.5L2 6.5h4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  bldg: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="10" height="11" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 14v-4h4v4M6 6h1M9 6h1M6 9h1M9 9h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  send: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/>
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10l5 5 7-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
const DEPS = [
  { id: "general",  name: "General",     hint: "Questions & feedback", color: "#4A90E2", icon: ICO.msg   },
  { id: "sales",    name: "Sales",        hint: "Plans & pricing",      color: "#A78BFA", icon: ICO.chart },
  { id: "privacy",  name: "Privacy",      hint: "Data requests",        color: "#34D399", icon: ICO.shield},
  { id: "bug",      name: "Bug report",   hint: "Something broke",      color: "#F87171", icon: ICO.bug   },
  { id: "partner",  name: "Partnership",  hint: "Build with us",        color: "#FBBF24", icon: ICO.link  },
] as const;

type DepId = typeof DEPS[number]["id"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ContactPage() {
  const [dep, setDep]         = useState<DepId>("general");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  const activeDep = DEPS.find((d) => d.id === dep)!;
  const showCompany = dep === "sales" || dep === "partner";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await new Promise((r) => setTimeout(r, 900));
    setSending(false);
    setSent(true);
  }

  return (
    <div className="doppel-marketing" style={{ fontFamily: "var(--font-sans)" }}>
      <Nav />

      <section className="contact">
        <div className="contact__bg">
          <div className="contact__bg__dots" />
        </div>

        <div className="contact__inner">
          {/* Heading */}
          <div className="contact__head">
            <h1 className="contact__h1">
              Talk to <em>a real person.</em>
            </h1>
            <p className="contact__sub">
              We&apos;re a small team. Every message gets read. Be specific and we&apos;ll be fast.
            </p>
            <div className="contact__live">
              <span className="contact__live__dot" />
              Responding now — avg. under 6 hours
            </div>
          </div>

          {/* Body */}
          <div className="contact__layout">
            {/* Form card */}
            <div className="contact__card">
              {sent ? (
                <div className="success">
                  <div className="success__icon">{ICO.check}</div>
                  <p className="success__title">Message sent.</p>
                  <p className="success__sub">
                    We&apos;ll get back to you at <strong>{email}</strong> within 1–2 business days.
                  </p>
                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() => { setSent(false); setName(""); setEmail(""); setCompany(""); setMessage(""); }}
                  >
                    Send another
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {/* Department picker */}
                  <div className="dep-picker">
                    {DEPS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`dep${dep === d.id ? " dep--active" : ""}`}
                        style={{ "--dep-c": d.color } as React.CSSProperties}
                        onClick={() => setDep(d.id)}
                      >
                        <div className="dep__icon">{d.icon}</div>
                        <div className="dep__name">{d.name}</div>
                        <div className="dep__hint">{d.hint}</div>
                      </button>
                    ))}
                  </div>

                  {/* Name + Email */}
                  <div className="form-row">
                    <div className="field" style={{ "--field-c": activeDep.color } as React.CSSProperties}>
                      <label className="field__lbl">Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Smith"
                        required
                      />
                    </div>
                    <div className="field" style={{ "--field-c": activeDep.color } as React.CSSProperties}>
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

                  {/* Company (Sales / Partner only) */}
                  {showCompany && (
                    <div
                      className="field"
                      style={{ "--field-c": activeDep.color, marginBottom: 12 } as React.CSSProperties}
                    >
                      <label className="field__lbl">Company</label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Acme Corp"
                      />
                    </div>
                  )}

                  {/* Message */}
                  <div
                    className="field"
                    style={{ "--field-c": activeDep.color, marginBottom: 18 } as React.CSSProperties}
                  >
                    <label className="field__lbl">Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                      placeholder="The more detail, the faster we can help."
                      required
                    />
                    <div className="field__count">
                      <strong>{message.length}</strong> / 2000
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="send"
                    style={{ "--send-c": activeDep.color } as React.CSSProperties}
                    disabled={sending}
                  >
                    {sending ? "Sending…" : <>{ICO.send} Send message</>}
                  </button>
                </form>
              )}
            </div>

            {/* Side rail */}
            <div className="contact__rail">
              <div className="rail-card" style={{ "--rail-c": "#34D399" } as React.CSSProperties}>
                <div className="rail-card__icon">{ICO.clock}</div>
                <div className="rail-card__label">Response time</div>
                <div className="rail-card__val">Under 6 hours</div>
                <div className="rail-card__hint">Mon–Fri, PST. Urgent issues responded to same day.</div>
                <div className="rail-card__sla">
                  <span className="rail-card__sla__dot" />
                  SLA: 1 business day
                </div>
              </div>

              <div className="rail-card" style={{ "--rail-c": "#A78BFA" } as React.CSSProperties}>
                <div className="rail-card__icon">{ICO.star}</div>
                <div className="rail-card__label">Enterprise</div>
                <div className="rail-card__val">Book a demo</div>
                <div className="rail-card__hint">
                  Custom pricing, SOC 2, dedicated support.{" "}
                  <a href="mailto:sales@doppel.ai" style={{ color: "#A78BFA" }}>
                    Talk to sales →
                  </a>
                </div>
              </div>

              <div className="rail-card" style={{ "--rail-c": "#6BAEFF" } as React.CSSProperties}>
                <div className="rail-card__icon">{ICO.bldg}</div>
                <div className="rail-card__label">Company</div>
                <div className="rail-card__val">Doppel AI, Inc.</div>
                <div className="rail-card__hint">
                  hello@doppel.ai<br />
                  legal@doppel.ai
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Foot />
    </div>
  );
}
