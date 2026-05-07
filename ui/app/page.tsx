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
          <a href="#for-you" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            For individuals
          </a>
          <a href="#for-teams" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            For teams
          </a>
          <a href="#how" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            Pricing
          </a>
          <Link href="/contact" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            Contact
          </Link>
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
  const [scenario, setScenario] = useState<"individual" | "team">("individual");

  const titles = useMemo(
    () => ["scale beyond you.", "answer for you.", "outlast you.", "compound.", "live on."],
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
          What you know should{" "}
          <span className="relative inline-flex justify-center overflow-y-hidden overflow-x-visible h-[1.15em] align-bottom w-fit min-w-[280px] md:min-w-[440px]">
            {titles.map((title, index) => (
              <motion.span
                key={index}
                className="absolute font-normal text-white/55"
                initial={{ opacity: 0, y: "60%" }}
                transition={{ type: "spring", stiffness: 60, damping: 18 }}
                animate={
                  titleNumber === index
                    ? { y: 0, opacity: 1 }
                    : { y: titleNumber > index ? "-60%" : "60%", opacity: 0 }
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
        Doppel turns your expertise into a permanent, queryable intelligence —
        for yourself, and for the teams that depend on you.
      </motion.p>

      {/* Scenario callout — tabbed */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="mt-8 glass rounded-2xl p-1 max-w-md w-full"
      >
        <div className="flex gap-1 p-1 mb-3">
          {(["individual", "team"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs transition-all",
                scenario === s ? "glass-md text-white/75" : "text-white/30 hover:text-white/50"
              )}
            >
              {s === "individual" ? "For individuals" : "For teams"}
            </button>
          ))}
        </div>

        <div className="px-4 pb-4 text-sm leading-relaxed min-h-[80px]">
          {scenario === "individual" ? (
            <>
              <p className="text-white/50">
                <span className="text-white/70">Colleague on Slack:</span>{" "}
                <span className="italic">&ldquo;Quick question about that infra pattern you use?&rdquo;</span>
              </p>
              <p className="text-white/25 text-xs mt-2">You&apos;re in a meeting. Your clone isn&apos;t.</p>
              <p className="text-white/50 mt-1.5">
                <span className="text-white/65">[Your clone]:</span>{" "}
                &ldquo;I avoid that pattern because of X — here&apos;s how I&apos;d approach it instead.&rdquo;
              </p>
            </>
          ) : (
            <>
              <p className="text-white/50">
                <span className="text-white/70">New engineer, day one:</span>{" "}
                <span className="italic">&ldquo;Why did we build auth this way?&rdquo;</span>
              </p>
              <p className="text-white/25 text-xs mt-2">
                Sarah left 8 months ago. Her answer is still here.
              </p>
              <p className="text-white/50 mt-1.5">
                <span className="text-white/65">[Sarah&apos;s clone]:</span>{" "}
                &ldquo;Made that call in April — here&apos;s her reasoning, with sources.&rdquo;
              </p>
            </>
          )}
        </div>
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
          Start free
          <MoveRight className="w-4 h-4" />
        </Link>
        <Link
          href="/contact"
          className="glass hover:glass-md px-6 py-3 rounded-xl text-sm text-white/50 hover:text-white/70 transition-all"
        >
          Request a team demo →
        </Link>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.65 }}
        className="mt-10 text-[11px] text-white/20 tracking-wide text-center"
      >
        Free for individuals · Company Brain on Enterprise plans
      </motion.p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// For individuals section
// ---------------------------------------------------------------------------

function ForIndividualsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const USE_CASES = [
    {
      who: "Consultant",
      problem: "Clients ask the same strategic questions. You answer each one from scratch.",
      solution: "Your clone answers with your frameworks — you focus on the work that needs you.",
    },
    {
      who: "Engineer",
      problem: "Junior devs pull you into Slack for context you've explained ten times.",
      solution: "Your clone surfaces the right answer from your actual decisions and code reviews.",
    },
    {
      who: "Executive",
      problem: "Your judgment is the bottleneck. You can't be in every room.",
      solution: "Your reasoning process is queryable. Decisions get made without the meeting.",
    },
    {
      who: "Creator",
      problem: "Your audience wants you — more than you can produce.",
      solution: "Your clone engages, answers, and teaches. Trained on everything you've written.",
    },
  ];

  return (
    <section id="for-you" className="relative py-24 px-6 max-w-6xl mx-auto" ref={ref}>
      <div className="max-w-2xl mb-16">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-[11px] uppercase tracking-widest text-white/25 mb-3"
        >
          For individuals
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-light text-white/85 mb-4 leading-tight"
        >
          You are the bottleneck.
          <br />
          <span className="text-white/40">You don&apos;t have to be.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base text-white/35 leading-relaxed"
        >
          Your knowledge is more valuable than your availability.
          Doppel lets you deploy your expertise at scale — without giving up more of your time.
        </motion.p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {USE_CASES.map((uc, i) => (
          <motion.div
            key={uc.who}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
            className="glass rounded-2xl p-6"
          >
            <p className="text-xs text-white/30 uppercase tracking-wider mb-3">{uc.who}</p>
            <p className="text-sm text-white/40 leading-relaxed mb-4 flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-red-400/40 inline-block mt-2 shrink-0" />
              {uc.problem}
            </p>
            <p className="text-sm text-white/60 leading-relaxed flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-emerald-400/60 inline-block mt-2 shrink-0" />
              {uc.solution}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.55 }}
        className="mt-8 flex items-center gap-6"
      >
        <Link
          href="/sign-up"
          className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/65 hover:text-white/85 transition-all flex items-center gap-2"
        >
          Start free
          <MoveRight className="w-3.5 h-3.5" />
        </Link>
        <p className="text-xs text-white/25">Free forever · No credit card</p>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// For teams section (replaces old problem section)
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
    what: "Which customers to bend the rules for. How to handle the edge cases that aren't in the policy doc. The instincts from 10,000 tickets.",
  },
  {
    role: "Head of sales",
    years: "7 years",
    what: "When to discount, when to hold firm, which objections are real. The pricing intuition that closed $4M last year.",
  },
  {
    role: "Founding PM",
    years: "5 years",
    what: "Why the product is the way it is. The decisions that were tried and failed. The customer conversations that shaped every major feature.",
  },
];

function ForTeamsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      id="for-teams"
      className="relative py-24 px-6 max-w-5xl mx-auto overflow-hidden"
      ref={ref}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 85%)",
        }}
      />

      <div className="relative max-w-2xl mb-20">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-[11px] uppercase tracking-widest text-white/25 mb-3"
        >
          For teams
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-light text-white/85 mb-4 leading-tight"
        >
          When they leave,
          <br />
          <span className="text-white/40">it doesn&apos;t have to go with them.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base text-white/35 leading-relaxed"
        >
          Not the things in documents — the judgment, the instincts, the reasoning
          behind the reasoning. Every departure takes it. Until now.
        </motion.p>
      </div>

      {/* Timeline */}
      <div className="relative max-w-3xl mx-auto">
        <div
          className="absolute left-1/2 -translate-x-px top-0 bottom-0 w-px hidden md:block"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 6px, transparent 6px, transparent 16px)",
          }}
        />
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
              <div className={`hidden md:block w-[calc(50%-28px)] glass rounded-2xl p-5 ${isLeft ? "mr-auto" : "ml-auto"}`}>
                <CardContent item={item} />
              </div>
              <div className="md:hidden flex-1 glass rounded-2xl p-5">
                <CardContent item={item} />
              </div>
              <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#080808] border border-white/20 z-10" />
              <div className="md:hidden absolute left-4 top-6 -translate-x-1/2 w-2 h-2 rounded-full bg-[#080808] border border-white/20 z-10" />
            </motion.div>
          );
        })}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, delay: 0.7 }}
          className="relative flex justify-center pt-2 pl-10 md:pl-0"
        >
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
// Dashboard mock
// ---------------------------------------------------------------------------

function DashboardMock() {
  return (
    <div className="h-full w-full bg-[#080808] overflow-hidden flex select-none text-[11px]">
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
              "px-2.5 py-2 rounded-lg mb-0.5 text-[11px]",
              active ? "bg-white/[0.07] text-white/80" : "text-white/30"
            )}
          >
            {label}
          </div>
        ))}
      </div>

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
            <div className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center text-[9px] text-white/40 shrink-0 mt-0.5">S</div>
            <div className="flex flex-col gap-1.5 max-w-[80%]">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3 py-2 text-white/55 leading-relaxed">
                We evaluated both in Q3 2024. The main constraint was complex join patterns — Dynamo&apos;s single-table model would&apos;ve forced duplicate writes everywhere.
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
            <div className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center text-[9px] text-white/40 shrink-0 mt-0.5">S</div>
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3 py-2 text-white/55 max-w-[80%] leading-relaxed">
              Yes — connection pool exhaustion at scale. That&apos;s why we set up PgBouncer from day one. She left a note about revisiting at 10M events/day.
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

function ScrollSection() {
  return (
    <section id="demo" className="relative">
      <ContainerScroll
        titleComponent={
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-white/25">The product</p>
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
    desc: "Connect Gmail, Slack, GitHub, Notion, and docs. Every email, decision, and thread becomes memory — not lost in someone's inbox.",
    tag: "Individual & team",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 9h3M13 9h3M9 2v3M9 13v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: "Deploy",
    desc: "Your clone is queryable via chat link, API, Slack bot, or email. Anyone you give access can ask — you answer once, for everyone.",
    tag: "Individual",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 15 L9 3 L15 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 10.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: "Compound",
    desc: "Individual clones aggregate into role brains. Team knowledge becomes a queryable layer. Every brain added makes the whole stronger.",
    tag: "Team",
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
          Works at the individual level. Scales to the org.
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
            <div className="glass rounded-2xl p-6 h-full flex flex-col">
              <div className="w-9 h-9 rounded-xl glass-md flex items-center justify-center text-white/45 mb-5">
                {f.icon}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-medium text-white/80">{f.title}</h3>
                <span className="text-[10px] text-white/25 glass rounded-full px-2 py-px">{f.tag}</span>
              </div>
              <p className="text-sm text-white/35 leading-relaxed">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

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
            <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">
              For teams · Company Brain
            </p>
            <h2 className="text-3xl md:text-4xl font-light text-white/85 leading-tight mb-4">
              Individual knowledge becomes<br className="hidden md:block" /> company knowledge
            </h2>
            <p className="text-base text-white/35 leading-relaxed max-w-xl">
              Individual clones are the foundation. Doppel aggregates them into role brains —
              then extracts structured, executable skills your AI agents can use before acting.
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
    desc: "Your personal clone, fully functional. No credit card. Keep it forever.",
    monthly: 0,
    yearly: 0,
    cta: "Start free",
    popular: false,
    badge: null,
    queriesLabel: "50 queries / month",
    features: [
      "1 personal clone",
      "Gmail, Slack, GitHub, Notion connectors",
      "File upload (PDF, DOCX, XLSX…)",
      "Shareable public link",
      "Confidence + source citations",
      "50 queries / month",
    ],
  },
  {
    name: "Personal",
    desc: "Full individual power. All surfaces, higher limits, your own API access.",
    monthly: 15,
    yearly: 150,
    cta: "Get Personal",
    popular: false,
    badge: null,
    queriesLabel: "250 queries / month",
    features: [
      "Everything in Free",
      "250 queries / month",
      "Email drafts (inbox triage)",
      "Meeting bot (Zoom, Meet, Teams)",
      "Knowledge handoff report",
      "Developer API access",
      "Data export (GDPR Art. 20)",
    ],
  },
  {
    name: "Enterprise Pro",
    desc: "Company Brain for your team. Role knowledge, cross-clone search, org controls.",
    monthly: 59,
    yearly: 590,
    cta: "Get Pro",
    popular: true,
    badge: "Most popular",
    perSeat: true,
    queriesLabel: "1,250 queries / seat / month",
    features: [
      "Everything in Personal × whole team",
      "Company Brain + Role Brains",
      "Team Knowledge directory",
      "Skills API for AI agents",
      "Org workspace + cross-clone search",
      "SSO / SAML · SCIM provisioning",
      "Audit log + webhooks",
    ],
  },
  {
    name: "Enterprise Max",
    desc: "The full intelligence layer. Org feed, drift detection, spec generation.",
    monthly: 179,
    yearly: 1790,
    cta: "Talk to us",
    popular: false,
    badge: null,
    perSeat: true,
    queriesLabel: "5,000 queries / seat / month",
    features: [
      "Everything in Enterprise Pro",
      "Org Intelligence Feed",
      "Goals & drift detection",
      "AI spec generator",
      "Decision log",
      "SOC 2 Type II · Custom SLAs",
      "Dedicated CSM · Volume discounts",
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
          Free forever for individuals · Company Brain unlocks at Enterprise
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
                "rounded-2xl p-6 border h-full flex flex-col",
                plan.popular ? "glass-hi border-white/[0.14]" : "glass border-white/[0.08]"
              )}
            >
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
                  {"perSeat" in plan && plan.perSeat ? "5-seat minimum · " : ""}{plan.queriesLabel}
                </p>
              </div>

              <Link
                href={plan.name === "Enterprise Max" ? "/contact" : "/sign-up"}
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.75 }}
        className="mt-6 max-w-4xl mx-auto glass rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left"
      >
        <div className="flex-1">
          <p className="text-sm text-white/55 font-medium">Company Brain is Enterprise-only</p>
          <p className="text-xs text-white/30 mt-0.5 leading-relaxed">
            Role brains, Skills API, org intelligence feed, and agent-ready org knowledge require Enterprise Pro or Max.
            Free and Personal plans get the full individual clone.
          </p>
        </div>
        <Link
          href="/contact"
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
          <Link href="/contact" className="text-xs text-white/25 hover:text-white/50 transition-colors">Contact</Link>
          <a href="/privacy" className="text-xs text-white/25 hover:text-white/50 transition-colors">Privacy</a>
          <a href="/terms" className="text-xs text-white/25 hover:text-white/50 transition-colors">Terms</a>
        </div>
        <p className="text-xs text-white/20">&copy; 2026 Doppel AI, Inc.</p>
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
      <ForIndividualsSection />
      <ForTeamsSection />
      <ScrollSection />
      <FeaturesSection />
      <CompanyBrainSection />
      <PricingSection />
      <Footer />
    </main>
  );
}
