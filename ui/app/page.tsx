"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { MoveRight, ArrowUpRight, Check } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "glass border-b border-white/[0.06]"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-white/80 tracking-tight">
          doppel
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <a href="#problem" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            The problem
          </a>
          <a href="#how" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="px-4 py-2 text-sm text-white/50 hover:text-white/75 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="glass-md hover:glass-hi px-4 py-2 rounded-xl text-sm text-white/75 hover:text-white/95 transition-all flex items-center gap-1.5"
          >
            Get started
            <MoveRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["compound.", "stay.", "last.", "grow.", "live on."],
    []
  );

  useEffect(() => {
    const id = setTimeout(() => {
      setTitleNumber((n) => (n === titles.length - 1 ? 0 : n + 1));
    }, 2200);
    return () => clearTimeout(id);
  }, [titleNumber, titles]);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-10 overflow-hidden">
      {/* Dotted grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.065) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)",
        }}
      />
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/[0.02] blur-[120px]" />
      </div>

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="glass rounded-full px-4 py-1.5 text-xs text-white/45 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/40 inline-block" />
          Knowledge shouldn&apos;t have a lifespan · Private beta
        </div>
      </motion.div>

      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="text-center"
      >
        <h1 className="text-5xl md:text-7xl font-light text-white/85 tracking-tight leading-[1.08] max-w-3xl">
          Knowledge should{" "}
          <span className="relative inline-flex justify-center overflow-y-hidden overflow-x-visible h-[1.15em] align-bottom w-fit min-w-[260px] md:min-w-[420px]">
            {titles.map((title, index) => (
              <motion.span
                key={index}
                className="absolute font-normal text-white/55"
                initial={{ opacity: 0, y: "60%" }}
                transition={{ type: "spring", stiffness: 60, damping: 18 }}
                animate={
                  titleNumber === index
                    ? { y: 0, opacity: 1 }
                    : {
                        y: titleNumber > index ? "-60%" : "60%",
                        opacity: 0,
                      }
                }
              >
                {title}
              </motion.span>
            ))}
          </span>
        </h1>
      </motion.div>

      {/* Subtext */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="mt-6 text-base md:text-lg text-white/35 max-w-xl text-center leading-relaxed"
      >
        The valuable thoughts and skills of your best people are lost when they leave —
        the things that were never on paper. Doppel captures them permanently,
        so your company&apos;s knowledge compounds instead of disappearing.
      </motion.p>

      {/* Scenario callout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="mt-8 glass rounded-2xl px-5 py-4 max-w-md text-center"
      >
        <p className="text-sm text-white/50 leading-relaxed">
          <span className="text-white/70">New engineer, day one:</span>{" "}
          <span className="italic">&ldquo;Why did we build the auth layer this way?&rdquo;</span>
          <br />
          <span className="text-white/30 text-xs mt-1.5 block">
            Sarah left 8 months ago. Her answer is still here.
          </span>
          <span className="text-white/55 mt-1 block">&ldquo;Sarah made that call in April — here&apos;s her reasoning, with sources.&rdquo;</span>
        </p>
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-8 flex flex-col sm:flex-row items-center gap-3"
      >
        <Link
          href="/sign-up"
          className="glass-hi hover:bg-white/[0.14] px-6 py-3 rounded-xl text-sm font-medium text-white/85 hover:text-white transition-all flex items-center gap-2"
        >
          Start preserving knowledge
          <MoveRight className="w-4 h-4" />
        </Link>
        <a
          href="#problem"
          className="glass hover:glass-md px-6 py-3 rounded-xl text-sm text-white/50 hover:text-white/70 transition-all"
        >
          See the problem
        </a>
      </motion.div>

      {/* Stat */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.65 }}
        className="mt-10 text-[11px] text-white/20 tracking-wide"
      >
        The average knowledge worker changes jobs every 2–3 years · That knowledge doesn&apos;t have to leave
      </motion.p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Problem section
// ---------------------------------------------------------------------------

const LOSSES = [
  {
    role: "Senior engineer",
    years: "6 years",
    what: "Why every architectural decision was made. Which shortcuts will hurt you. Where the bodies are buried in the codebase.",
  },
  {
    role: "Support lead",
    years: "4 years",
    what: "Which customers to bend the rules for. How to handle the edge cases that aren't in the policy doc. The instincts that come from 10,000 tickets.",
  },
  {
    role: "Head of sales",
    years: "7 years",
    what: "When to discount, when to hold firm, which objections are real. The deals she almost lost and why. The pricing intuition that closed $4M last year.",
  },
  {
    role: "Founding PM",
    years: "5 years",
    what: "Why the product is the way it is. The decisions that were tried and failed. The customer conversations that shaped every major feature.",
  },
];

function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      id="problem"
      className="relative py-24 px-6 max-w-5xl mx-auto overflow-hidden"
      ref={ref}
    >
      {/* Dotted grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 85%)",
        }}
      />

      {/* Heading */}
      <div className="relative max-w-2xl mx-auto text-center mb-20">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-[11px] uppercase tracking-widest text-white/25 mb-3"
        >
          The problem
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-light text-white/85 mb-4 leading-tight"
        >
          When they leave, it&apos;s gone
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base text-white/35 leading-relaxed"
        >
          Not the things in documents — the judgment, the instincts, the reasoning
          behind the reasoning. Every departure takes it.
        </motion.p>
      </div>

      {/* Trail */}
      <div className="relative max-w-3xl mx-auto">

        {/* Vertical dashed spine */}
        <div
          className="absolute left-1/2 -translate-x-px top-0 bottom-0 w-px hidden md:block"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 6px, transparent 6px, transparent 16px)",
          }}
        />
        {/* Mobile: left-edge spine */}
        <div
          className="absolute left-4 top-0 bottom-0 w-px md:hidden"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 6px, transparent 6px, transparent 16px)",
          }}
        />

        {LOSSES.map((item, i) => {
          const isLeft = i % 2 === 0;
          return (
            <motion.div
              key={item.role}
              initial={{ opacity: 0, x: isLeft ? -24 : 24 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.25 + i * 0.1 }}
              className="relative mb-8 flex md:block pl-10 md:pl-0"
            >
              {/* Desktop: alternating card */}
              <div
                className={`hidden md:block w-[calc(50%-28px)] glass rounded-2xl p-5 ${
                  isLeft ? "mr-auto" : "ml-auto"
                }`}
              >
                <CardContent item={item} />
              </div>

              {/* Mobile: full-width card */}
              <div className="md:hidden flex-1 glass rounded-2xl p-5">
                <CardContent item={item} />
              </div>

              {/* Center dot (desktop) */}
              <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#080808] border border-white/20 z-10" />
              {/* Left dot (mobile) */}
              <div className="md:hidden absolute left-4 top-6 -translate-x-1/2 w-2 h-2 rounded-full bg-[#080808] border border-white/20 z-10" />
            </motion.div>
          );
        })}

        {/* Trail end — DOPPEL node */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, delay: 0.7 }}
          className="relative flex justify-center pt-2 pl-10 md:pl-0"
        >
          {/* End dot */}
          <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white/15 border border-white/35 z-10" />
          <div className="md:hidden absolute top-1 left-4 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white/15 border border-white/35 z-10" />

          <div className="mt-6 md:w-auto w-full glass-hi border border-white/[0.13] rounded-2xl px-8 py-6 text-center max-w-xs">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mb-2">Until now</p>
            <p className="text-xl font-semibold text-white/80 tracking-tight mb-1">doppel</p>
            <p className="text-sm text-white/45 font-light leading-snug">
              The knowledge doesn&apos;t leave<br />when the person does.
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 inline-block" />
              <span className="text-[11px] text-emerald-400/60">Knowledge preserved</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CardContent({ item }: { item: { role: string; years: string; what: string } }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm font-medium text-white/65">{item.role}</span>
        <span className="text-[10px] text-white/20">·</span>
        <span className="text-xs text-white/30">{item.years}</span>
      </div>
      <p className="text-xs text-white/40 leading-relaxed">{item.what}</p>
      <p className="text-[11px] text-red-400/40 mt-3 flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-red-400/40 inline-block" />
        Gone on their last day
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Mock
// ---------------------------------------------------------------------------

function DashboardMock() {
  return (
    <div className="h-full w-full bg-[#080808] overflow-hidden flex select-none text-[11px]">
      {/* Sidebar */}
      <div className="w-[160px] shrink-0 border-r border-white/[0.05] flex flex-col p-2.5">
        <div className="px-2.5 py-2 mb-4">
          <span className="text-xs font-semibold text-white/65">doppel</span>
        </div>
        {[
          { label: "Overview", active: false },
          { label: "Train", active: false },
          { label: "Identity", active: false },
          { label: "Brain", active: false },
          { label: "Test", active: true },
          { label: "Company Brain", active: false },
          { label: "Skills API", active: false },
        ].map(({ label, active }) => (
          <div
            key={label}
            className={cn(
              "px-2.5 py-2 rounded-lg mb-0.5 text-[11px] transition-colors",
              active ? "bg-white/[0.07] text-white/80" : "text-white/30"
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 border-b border-white/[0.05] flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-white/[0.07] flex items-center justify-center text-[10px] text-white/50 font-medium shrink-0">
            S
          </div>
          <div>
            <p className="text-[12px] font-medium text-white/80">Sarah Chen · Arch lead</p>
            <p className="text-[10px] text-white/30">@sarah-chen · departed Jan 2026</p>
          </div>
          <div className="ml-auto glass rounded-md px-2 py-0.5 text-[9px] text-emerald-400/60">
            knowledge preserved
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
          <div className="flex justify-end">
            <div className="bg-white/[0.07] border border-white/[0.06] rounded-2xl rounded-tr-sm px-3 py-2 text-white/65 max-w-[70%] leading-relaxed">
              Why did we choose Postgres over Dynamo for the events table?
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <div className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center text-[9px] text-white/40 shrink-0 mt-0.5">
              S
            </div>
            <div className="flex flex-col gap-1.5 max-w-[80%]">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3 py-2 text-white/55 leading-relaxed">
                We evaluated both in Q3 2024. The main constraint was complex join patterns across event streams — Dynamo&apos;s single-table model would&apos;ve forced us into duplicate writes everywhere.
              </div>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[9px] font-medium border border-emerald-400/25 text-emerald-400/80 rounded px-1.5 py-0.5">92% confident</span>
                <span className="text-[9px] text-white/20">3 sources · email, Slack, design doc</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="bg-white/[0.07] border border-white/[0.06] rounded-2xl rounded-tr-sm px-3 py-2 text-white/65 max-w-[70%] leading-relaxed">
              Were there any trade-offs she worried about?
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <div className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center text-[9px] text-white/40 shrink-0 mt-0.5">
              S
            </div>
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3 py-2 text-white/55 max-w-[80%] leading-relaxed">
              Yes — connection pool exhaustion at scale. That&apos;s why we set up PgBouncer from day one. She left a note about revisiting this at 10M events/day.
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 shrink-0">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5">
            <span className="flex-1 text-white/20 text-[11px]">Ask Sarah anything…</span>
            <div className="w-6 h-6 rounded-lg bg-white/[0.07] flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-3 h-3 text-white/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll demo section
// ---------------------------------------------------------------------------

function ScrollSection() {
  return (
    <section id="demo" className="relative">
      <ContainerScroll
        titleComponent={
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-white/25">
              The product
            </p>
            <h2 className="text-4xl md:text-5xl font-light text-white/85 leading-tight">
              Query the people who built it
            </h2>
            <p className="text-base text-white/35 max-w-md mx-auto leading-relaxed">
              Every clone answers with real sources — emails, decisions, Slack threads.
              Confidence-scored. Always cited.
            </p>
          </div>
        }
      >
        <DashboardMock />
      </ContainerScroll>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 7h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M6 11h2M11 11h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: "Capture",
    desc: "Connect Gmail, Slack, GitHub, and docs. Every decision, email, and thread becomes queryable memory — not lost in someone's inbox when they leave.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 9h3M13 9h3M9 2v3M9 13v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: "Preserve",
    desc: "When someone leaves, their clone stays — permanently. New hires query the people who built what they're inheriting. The knowledge doesn't walk out the door.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 15 L9 3 L15 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5.5 10.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: "Compound",
    desc: "Every brain added makes the whole stronger. Role brains aggregate expertise across your team. The longer you use Doppel, the more irreplaceable your knowledge layer becomes.",
  },
];

function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how" className="py-24 px-6 max-w-6xl mx-auto" ref={ref}>
      <div className="text-center mb-16">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-[11px] uppercase tracking-widest text-white/25 mb-3"
        >
          How it works
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-light text-white/85"
        >
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.12}
            staggerFrom="first"
            containerClassName="justify-center"
            transition={{ type: "spring", stiffness: 220, damping: 38, delay: 0.2 }}
          >
            Knowledge that compounds
          </VerticalCutReveal>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-sm text-white/30 mt-4 max-w-md mx-auto leading-relaxed"
        >
          Every departure used to subtract. With Doppel, it adds.
        </motion.p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
          >
            <div className="glass rounded-2xl p-6 h-full">
              <div className="w-9 h-9 rounded-xl glass-md flex items-center justify-center text-white/45 mb-5">
                {f.icon}
              </div>
              <h3 className="text-base font-medium text-white/80 mb-2">{f.title}</h3>
              <p className="text-sm text-white/35 leading-relaxed">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Social proof quote */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-10 glass rounded-2xl p-8 text-center max-w-2xl mx-auto"
      >
        <p className="text-base text-white/55 leading-relaxed italic mb-4">
          &ldquo;The founding engineer left in November. By January, new hires were asking her Doppel clone
          architecture questions — and getting cited answers from her actual design docs.&rdquo;
        </p>
        <p className="text-sm text-white/30">Engineering team, Series B SaaS · 40 engineers</p>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Company Brain section
// ---------------------------------------------------------------------------

function CompanyBrainSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-24 px-6 max-w-6xl mx-auto" ref={ref}>
      <div className="max-w-4xl mx-auto">
        <div className="glass rounded-3xl p-10 md:p-14">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Company Brain</p>
            <h2 className="text-3xl md:text-4xl font-light text-white/85 leading-tight mb-4">
              Individual knowledge becomes<br className="hidden md:block" /> company knowledge
            </h2>
            <p className="text-base text-white/35 leading-relaxed max-w-xl">
              Individual clones are the start. Doppel then aggregates them into role brains —
              and extracts structured, executable skills your AI agents can use before acting.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-3">
            {[
              {
                step: "01",
                title: "Individual brain",
                desc: "Sarah's 6 years of emails, decisions, and reasoning — preserved and queryable.",
                color: "text-white/50",
              },
              {
                step: "02",
                title: "Role brain",
                desc: "All five support leads aggregated into one. How does your team handle refunds, escalations, edge cases?",
                color: "text-white/55",
              },
              {
                step: "03",
                title: "Skills API",
                desc: "AI agents query your company brain before acting. Correct decisions, at scale, grounded in your actual procedures.",
                color: "text-white/60",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 16 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
                className="glass rounded-2xl p-5"
              >
                <span className="text-[10px] text-white/20 font-mono mb-3 block">{item.step}</span>
                <h3 className={`text-sm font-medium mb-2 ${item.color}`}>{item.title}</h3>
                <p className="text-xs text-white/30 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-8 glass rounded-xl p-4 font-mono text-[11px]"
          >
            <span className="text-white/25">POST </span>
            <span className="text-white/50">/v1/org/&#123;id&#125;/query</span>
            <span className="text-white/20 ml-4">// &ldquo;How do we handle a 45-day VIP refund?&rdquo;</span>
            <br />
            <span className="text-white/20">→ </span>
            <span className="text-emerald-400/50">recommendation: </span>
            <span className="text-white/40">&ldquo;Approve — VIP exception extends window to 90 days&rdquo;</span>
            <span className="text-white/20 ml-2">confidence: 0.94</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const PLANS = [
  {
    name: "Free",
    desc: "Try every feature — no Company Brain. No credit card required.",
    monthly: 0,
    yearly: 0,
    cta: "Start free",
    popular: false,
    badge: null,
    queriesLabel: "50 queries / month",
    features: [
      "1 clone",
      "All ingestion sources",
      "Public shareable link",
      "Confidence + source UI",
      "Gmail, Slack, GitHub connectors",
      "50 queries / month",
    ],
  },
  {
    name: "Personal",
    desc: "Full power for individuals. 5× the queries. Keep your knowledge forever.",
    monthly: 15,
    yearly: 150,
    cta: "Get Personal",
    popular: false,
    badge: null,
    queriesLabel: "250 queries / month",
    features: [
      "Everything in Free",
      "250 queries / month (5×)",
      "Priority response speed",
      "Data export (GDPR Art. 20)",
      "Clone preservation + legal hold",
      "API access",
    ],
  },
  {
    name: "Enterprise Pro",
    desc: "Company Brain + 5× Personal queries. For teams that can't afford to lose knowledge.",
    monthly: 59,
    yearly: 590,
    cta: "Get Pro",
    popular: true,
    badge: "Most popular",
    perSeat: true,
    queriesLabel: "1,250 queries / seat / month",
    features: [
      "Everything in Personal",
      "1,250 queries / seat / month (5×)",
      "Company Brain + Role Brains",
      "Skills API for AI agents",
      "Cross-clone org search",
      "SCIM provisioning",
      "SSO / SAML",
      "Audit log + webhooks",
    ],
  },
  {
    name: "Enterprise Max",
    desc: "20× Personal queries. For orgs running knowledge at full scale.",
    monthly: 179,
    yearly: 1790,
    cta: "Talk to us",
    popular: false,
    badge: null,
    perSeat: true,
    queriesLabel: "5,000 queries / seat / month",
    features: [
      "Everything in Enterprise Pro",
      "5,000 queries / seat / month (20×)",
      "Dedicated CSM",
      "SOC 2 Type II",
      "Custom SLAs",
      "Volume discounts at 50+ seats",
    ],
  },
];

function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="pricing" className="py-24 px-6 max-w-6xl mx-auto" ref={ref}>
      <div className="text-center mb-12">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-[11px] uppercase tracking-widest text-white/25 mb-3"
        >
          Pricing
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-light text-white/85 mb-2"
        >
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.12}
            staggerFrom="first"
            containerClassName="justify-center"
            transition={{ type: "spring", stiffness: 220, damping: 38, delay: 0.15 }}
          >
            Start free. Scale when it matters.
          </VerticalCutReveal>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-sm text-white/35"
        >
          Free forever for individuals. Company Brain unlocks at Enterprise.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex justify-center mt-8"
        >
          <div className="glass rounded-full p-1 flex gap-1">
            <button
              onClick={() => setIsYearly(false)}
              className={cn(
                "relative px-5 py-1.5 rounded-full text-sm transition-all",
                !isYearly ? "text-white/85" : "text-white/35 hover:text-white/55"
              )}
            >
              {!isYearly && (
                <motion.span
                  layoutId="pricing-pill"
                  className="absolute inset-0 glass-md rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">Monthly</span>
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={cn(
                "relative px-5 py-1.5 rounded-full text-sm transition-all",
                isYearly ? "text-white/85" : "text-white/35 hover:text-white/55"
              )}
            >
              {isYearly && (
                <motion.span
                  layoutId="pricing-pill"
                  className="absolute inset-0 glass-md rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                Yearly
                <span className="text-[10px] text-white/30">2 months free</span>
              </span>
            </button>
          </div>
        </motion.div>
      </div>

      {/* 2×2 grid */}
      <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {PLANS.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
          >
            <div
              className={cn(
                "rounded-2xl p-6 border h-full flex flex-col transition-all",
                plan.popular
                  ? "glass-hi border-white/[0.14]"
                  : "glass border-white/[0.08]"
              )}
            >
              {/* Header */}
              <div className="mb-5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-lg font-medium text-white/85">{plan.name}</h3>
                  {plan.badge && (
                    <span className="text-[10px] uppercase tracking-widest text-white/40 glass rounded-full px-2.5 py-0.5 shrink-0">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/35 leading-relaxed">{plan.desc}</p>
              </div>

              {/* Price */}
              <div className="mb-5">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-light text-white/85">
                    {plan.monthly === 0 ? (
                      "Free"
                    ) : (
                      <>
                        $
                        <NumberFlow
                          value={isYearly ? Math.round(plan.yearly / 12) : plan.monthly}
                          className="inline"
                        />
                      </>
                    )}
                  </span>
                  {plan.monthly > 0 && (
                    <span className="text-sm text-white/30">
                      /seat/mo{isYearly && <span className="text-[11px] text-white/20">, billed annually</span>}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/25 mt-1">
                  {plan.perSeat ? "5-seat minimum · " : ""}{plan.queriesLabel}
                </p>
              </div>

              {/* CTA */}
              <Link
                href={plan.name === "Enterprise Max" ? "mailto:team@doppel.ai" : "/sign-up"}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all mb-5",
                  plan.popular
                    ? "glass-hi text-white/85 hover:bg-white/[0.14]"
                    : "glass text-white/55 hover:glass-md hover:text-white/75"
                )}
              >
                {plan.cta}
                <MoveRight className="w-3.5 h-3.5" />
              </Link>

              {/* Features */}
              <ul className="space-y-2 mt-auto">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-white/40">
                    <Check className="w-3.5 h-3.5 text-white/25 shrink-0 mt-0.5" />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Company Brain callout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.75 }}
        className="mt-6 max-w-4xl mx-auto glass rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left"
      >
        <div className="flex-1">
          <p className="text-sm text-white/55 font-medium">Company Brain is Enterprise-only</p>
          <p className="text-xs text-white/30 mt-0.5 leading-relaxed">
            Role brains, Skills API, and agent-ready org knowledge require Enterprise Pro or Max.
            Free and Personal plans get full individual clone features.
          </p>
        </div>
        <Link
          href="mailto:team@doppel.ai"
          className="glass-md hover:glass-hi rounded-xl px-5 py-2 text-sm text-white/60 hover:text-white/80 transition-all whitespace-nowrap shrink-0"
        >
          Talk to us →
        </Link>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-sm font-semibold text-white/40 tracking-tight">doppel</span>
          <p className="text-xs text-white/20 mt-1">Knowledge shouldn&apos;t have a lifespan.</p>
        </div>
        <div className="flex items-center gap-6">
          <a href="/privacy" className="text-xs text-white/25 hover:text-white/50 transition-colors">
            Privacy
          </a>
          <a href="/terms" className="text-xs text-white/25 hover:text-white/50 transition-colors">
            Terms
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/25 hover:text-white/50 transition-colors flex items-center gap-1"
          >
            GitHub
            <ArrowUpRight className="w-2.5 h-2.5" />
          </a>
        </div>
        <p className="text-xs text-white/20">&copy; 2026 Doppel. All rights reserved.</p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <main className="relative overflow-x-hidden">
      <Nav />
      <HeroSection />
      <ProblemSection />
      <ScrollSection />
      <FeaturesSection />
      <CompanyBrainSection />
      <PricingSection />
      <Footer />
    </main>
  );
}
