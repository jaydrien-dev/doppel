"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

// ---------------------------------------------------------------------------
// Nav (minimal, standalone)
// ---------------------------------------------------------------------------

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-white/75 hover:text-white/90 transition-colors">
          doppel
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/terms" className="text-xs text-white/40 hover:text-white/60 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="text-xs text-white/40 hover:text-white/60 transition-colors">
            Privacy
          </Link>
          <Link
            href="/sign-in"
            className="glass-md hover:glass-hi rounded-xl px-4 py-2 text-xs text-white/60 hover:text-white/80 transition-all"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Contact info items
// ---------------------------------------------------------------------------

const CONTACT_ITEMS = [
  {
    label: "General enquiries",
    value: "hello@doppel.ai",
    href: "mailto:hello@doppel.ai",
    desc: "Product questions, feedback, or anything else.",
  },
  {
    label: "Sales",
    value: "sales@doppel.ai",
    href: "mailto:sales@doppel.ai",
    desc: "Enterprise plans, custom deployments, volume pricing.",
  },
  {
    label: "Privacy & data",
    value: "privacy@doppel.ai",
    href: "mailto:privacy@doppel.ai",
    desc: "GDPR requests, data deletion, or compliance questions.",
  },
];

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

type FormState = "idle" | "sending" | "sent" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setFormState("sending");

    // TODO: replace with real form submission endpoint or a service like Resend / Formspree
    await new Promise((r) => setTimeout(r, 800));
    setFormState("sent");
  }

  return (
    <div className="min-h-screen bg-[#080808] font-[var(--font-manrope)]">
      <Nav />

      <main className="pt-28 pb-24 px-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Contact</p>
          <h1 className="text-4xl font-light text-white/85 mb-4">Get in touch</h1>
          <p className="text-base text-white/35 leading-relaxed max-w-xl">
            We&apos;re a small team. Real people read every message — please be specific so we can
            help faster.
          </p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass rounded-2xl p-8"
          >
            {formState === "sent" ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-10 h-10 rounded-full glass-md flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M4 9l4 4 6-7"
                      stroke="rgba(52,211,153,0.8)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-white/70">Message sent</p>
                <p className="text-xs text-white/35 text-center max-w-xs leading-relaxed">
                  We&apos;ll get back to you at <span className="text-white/55">{email}</span>{" "}
                  within 1–2 business days.
                </p>
                <button
                  onClick={() => {
                    setFormState("idle");
                    setName("");
                    setEmail("");
                    setSubject("");
                    setMessage("");
                  }}
                  className="mt-2 glass hover:glass-md rounded-xl px-4 py-2 text-xs text-white/50 hover:text-white/70 transition-all"
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] text-white/40 uppercase tracking-wide">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                      className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] text-white/40 uppercase tracking-wide">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      required
                      className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-white/40 uppercase tracking-wide">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="appearance-none bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white/70 outline-none focus:border-white/20 transition-colors cursor-pointer"
                  >
                    <option value="" className="bg-neutral-900">Select a topic</option>
                    <option value="general" className="bg-neutral-900">General question</option>
                    <option value="sales" className="bg-neutral-900">Sales / enterprise</option>
                    <option value="privacy" className="bg-neutral-900">Privacy or data request</option>
                    <option value="bug" className="bg-neutral-900">Bug report</option>
                    <option value="partnership" className="bg-neutral-900">Partnership</option>
                    <option value="other" className="bg-neutral-900">Other</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-white/40 uppercase tracking-wide">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe what you need. The more detail, the faster we can help."
                    required
                    rows={6}
                    className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors resize-none leading-relaxed"
                  />
                </div>

                {formState === "error" && (
                  <p className="text-xs text-red-400/70">
                    Something went wrong. Email us directly at hello@doppel.ai.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={formState === "sending"}
                  className="glass-hi hover:bg-white/[0.14] rounded-xl px-5 py-3 text-sm text-white/80 hover:text-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed self-start"
                >
                  {formState === "sending" ? "Sending…" : "Send message →"}
                </button>
              </form>
            )}
          </motion.div>

          {/* Contact info */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col gap-4"
          >
            {CONTACT_ITEMS.map(({ label, value, href, desc }) => (
              <div key={label} className="glass rounded-2xl p-5">
                <p className="text-[11px] uppercase tracking-widest text-white/25 mb-2">{label}</p>
                <a
                  href={href}
                  className="text-sm text-white/70 hover:text-white/90 transition-colors underline underline-offset-2"
                >
                  {value}
                </a>
                <p className="text-xs text-white/35 mt-1.5 leading-relaxed">{desc}</p>
              </div>
            ))}

            <div className="glass rounded-2xl p-5 mt-2">
              <p className="text-[11px] uppercase tracking-widest text-white/25 mb-2">Company</p>
              <p className="text-sm text-white/60 font-medium">Doppel AI, Inc.</p>
              <p className="text-xs text-white/30 mt-1 leading-relaxed">
                {/* TODO: add your registered address here */}
                [Address placeholder]
                <br />
                [City, State, ZIP]
              </p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-white/[0.05] py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-xs text-white/25">© 2025 Doppel AI, Inc.</p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-xs text-white/25 hover:text-white/45 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="text-xs text-white/25 hover:text-white/45 transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
