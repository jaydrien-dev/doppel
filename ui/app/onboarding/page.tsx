"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useClone } from "@/lib/hooks/useClone";
import { getGmailAuthUrl, ingestText, updateClone } from "@/lib/api";
import { ChatInterface } from "@/components/chat/ChatInterface";

// ─── Step progress indicator ────────────────────────────────────────────────

const STEPS = ["Connect", "About you", "Test", "Share"];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < current
                  ? "bg-white/60"
                  : i === current
                  ? "bg-white/90 ring-2 ring-white/20"
                  : "bg-white/15"
              }`}
            />
            <span
              className={`text-[9px] uppercase tracking-wider font-medium ${
                i === current ? "text-white/50" : "text-white/20"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-8 h-px mb-3 transition-colors duration-300 ${
                i < current ? "bg-white/30" : "bg-white/10"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Connect Gmail ───────────────────────────────────────────────────

function GmailStep({
  cloneId,
  gmailConnected,
  onContinue,
}: {
  cloneId: string;
  gmailConnected: boolean;
  onContinue: () => void;
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (gmailConnected) {
      const t = setTimeout(onContinue, 1200);
      return () => clearTimeout(t);
    }
  }, [gmailConnected, onContinue]);

  async function handleConnect() {
    setLoading(true);
    try {
      const url = await getGmailAuthUrl(cloneId, "/onboarding?gmail_connected=1");
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto px-6">
      {gmailConnected ? (
        <>
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"/>
            </svg>
          </div>
          <h2 className="text-xl font-light text-white/85 mb-2">Gmail connected</h2>
          <p className="text-sm text-white/40">Your emails are being imported. Moving on…</p>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full glass-md flex items-center justify-center mb-5">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="2" y="5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" className="text-white/40"/>
              <path d="M2 7.5l9 6 9-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-white/40"/>
            </svg>
          </div>
          <h2 className="text-xl font-light text-white/85 mb-2">Connect your Gmail</h2>
          <p className="text-sm text-white/40 mb-8 leading-relaxed">
            Give your clone real data instantly. We'll import your sent emails so it can learn how you actually write and think.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={handleConnect}
              disabled={loading}
              className="glass-md hover:glass-hi rounded-xl px-6 py-3 text-sm text-white/80 hover:text-white/95 transition-all disabled:opacity-50"
            >
              {loading ? "Redirecting…" : "Connect Gmail →"}
            </button>
            <button
              onClick={onContinue}
              className="text-sm text-white/30 hover:text-white/50 transition-colors py-2"
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step 2: Seed Q&A ────────────────────────────────────────────────────────

const SEED_QUESTIONS = [
  "What do you work on and what's your role?",
  "How do you make hard decisions?",
  "What do you believe that most people don't?",
  "What are your top 3 priorities right now?",
  "How would a close colleague describe your communication style?",
];

function QAStep({
  cloneId,
  onContinue,
}: {
  cloneId: string;
  onContinue: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(SEED_QUESTIONS.map(() => ""));
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    const filled = SEED_QUESTIONS.map((q, i) => ({ q, a: answers[i] })).filter(
      ({ a }) => a.trim().length > 0
    );
    if (filled.length === 0) {
      onContinue();
      return;
    }
    setSaving(true);
    try {
      const text = filled.map(({ q, a }) => `Q: ${q}\nA: ${a}`).join("\n\n");
      await ingestText({ clone_id: cloneId, text, source: "qa_seed", is_pinned: true });
    } catch {
      // best-effort
    } finally {
      setSaving(false);
      onContinue();
    }
  }

  return (
    <div className="flex flex-col max-w-xl mx-auto w-full px-6">
      <div className="text-center mb-8">
        <h2 className="text-xl font-light text-white/85 mb-2">Tell your clone about you</h2>
        <p className="text-sm text-white/40">Answer a few questions to anchor your clone's identity. Skip any you'd rather not answer.</p>
      </div>
      <div className="flex flex-col gap-4">
        {SEED_QUESTIONS.map((q, i) => (
          <div key={i} className="glass rounded-2xl px-5 py-4">
            <p className="text-xs text-white/40 mb-2">{q}</p>
            <textarea
              value={answers[i]}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value;
                setAnswers(next);
              }}
              placeholder="Your answer…"
              rows={2}
              className="w-full bg-transparent resize-none text-sm text-white/80 placeholder:text-white/20 outline-none leading-relaxed"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 mt-6">
        <button
          onClick={handleContinue}
          disabled={saving}
          className="glass-md hover:glass-hi rounded-xl px-6 py-3 text-sm text-white/80 hover:text-white/95 transition-all disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue →"}
        </button>
        <button
          onClick={onContinue}
          className="text-sm text-white/30 hover:text-white/50 transition-colors py-2 text-center"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Test your clone ─────────────────────────────────────────────────

function TestStep({
  cloneId,
  cloneName,
  onContinue,
}: {
  cloneId: string;
  cloneName: string;
  onContinue: () => void;
}) {
  const [hasMessaged, setHasMessaged] = useState(false);

  return (
    <div className="flex flex-col max-w-lg mx-auto w-full px-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-light text-white/85 mb-2">Say hello to yourself</h2>
        <p className="text-sm text-white/40">Ask your clone anything — see how it responds.</p>
      </div>
      <div className="glass rounded-2xl overflow-hidden h-[360px]">
        <ChatInterface
          cloneId={cloneId}
          cloneName={cloneName}
          contextType="chat"
          ownerMode={false}
          suggestedQuestions={["What are you working on?", "How do you make decisions?", "What motivates you?"]}
          onFirstMessage={() => setHasMessaged(true)}
        />
      </div>
      <div className="flex flex-col gap-2 mt-5">
        <button
          onClick={onContinue}
          className={`glass-md hover:glass-hi rounded-xl px-6 py-3 text-sm transition-all ${
            hasMessaged ? "text-white/80 hover:text-white/95" : "text-white/40"
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Share ───────────────────────────────────────────────────────────

function ShareStep({
  clone,
  onComplete,
}: {
  clone: { clone_id: string; handle: string; display_name: string };
  onComplete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = `${appUrl}/c/${clone.handle}`;

  async function handlePublish() {
    setPublishing(true);
    try {
      await updateClone(clone.handle, { access_mode: "public" });
      setPublished(true);
    } catch {
      // best-effort
      setPublished(true);
    } finally {
      setPublishing(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto px-6">
      {published ? (
        <>
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"/>
            </svg>
          </div>
          <h2 className="text-xl font-light text-white/85 mb-2">Your clone is live</h2>
          <p className="text-sm text-white/40 mb-6 leading-relaxed">Share the link with anyone.</p>
          <div className="flex items-center gap-2 glass rounded-xl px-4 py-3 w-full mb-6">
            <span className="flex-1 text-sm text-white/60 truncate text-left">{publicUrl}</span>
            <button onClick={handleCopy} className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <label className="flex items-start gap-3 cursor-pointer w-full mb-4 text-left">
            <input
              type="checkbox"
              checked={tcAccepted}
              onChange={(e) => setTcAccepted(e.target.checked)}
              className="mt-0.5 accent-white/60 shrink-0"
            />
            <span className="text-xs text-white/40 leading-relaxed">
              I agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white/60 underline underline-offset-2 hover:text-white/80">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/60 underline underline-offset-2 hover:text-white/80">
                Privacy Policy
              </a>
            </span>
          </label>
          <button
            onClick={onComplete}
            disabled={!tcAccepted}
            className="glass-md hover:glass-hi rounded-xl px-6 py-3 text-sm text-white/80 hover:text-white/95 transition-all w-full disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Go to Dashboard →
          </button>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full glass-md flex items-center justify-center mb-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 8.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0zM13 15l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-white/40"/>
            </svg>
          </div>
          <h2 className="text-xl font-light text-white/85 mb-2">Share your clone</h2>
          <p className="text-sm text-white/40 mb-3 leading-relaxed">
            Make your clone public so others can talk to it. Your link:
          </p>
          <div className="flex items-center gap-2 glass rounded-xl px-4 py-3 w-full mb-8">
            <span className="flex-1 text-sm text-white/50 truncate text-left">{publicUrl}</span>
            <button onClick={handleCopy} className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="glass-md hover:glass-hi rounded-xl px-6 py-3 text-sm text-white/80 hover:text-white/95 transition-all disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Make public & share →"}
            </button>
            <button
              onClick={onComplete}
              className="text-sm text-white/30 hover:text-white/50 transition-colors py-2"
            >
              Skip — go to dashboard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { clone, isLoading } = useClone();

  const gmailConnected = searchParams.get("gmail_connected") === "1";
  const initialStep = gmailConnected ? 1 : 0;
  const [step, setStep] = useState(initialStep);

  function markComplete() {
    if (user?.id) {
      localStorage.setItem(`doppel_onboarded_${user.id}`, "1");
    }
    router.push("/dashboard");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  useEffect(() => {
    if (!isLoading && !clone) {
      router.push("/dashboard");
    }
  }, [isLoading, clone, router]);

  if (!isLoading && !clone) return null;

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
        <span className="text-sm font-semibold text-white/70 tracking-tight">doppel</span>
        <StepDots current={step} />
        <button
          onClick={markComplete}
          className="text-xs text-white/25 hover:text-white/45 transition-colors"
        >
          Skip setup
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center py-12">
        {step === 0 && (
          <GmailStep
            cloneId={clone.clone_id}
            gmailConnected={gmailConnected}
            onContinue={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <QAStep cloneId={clone.clone_id} onContinue={() => setStep(2)} />
        )}
        {step === 2 && (
          <TestStep
            cloneId={clone.clone_id}
            cloneName={clone.display_name}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <ShareStep clone={clone} onComplete={markComplete} />
        )}
      </main>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}
