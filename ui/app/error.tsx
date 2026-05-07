"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: send to error monitoring (Sentry, etc.)
    console.error("[doppel error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 font-[var(--font-manrope)]">
      <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Error</p>
      <h1 className="text-3xl font-light text-white/70 mb-2">Something went wrong</h1>
      <p className="text-sm text-white/35 mb-8 text-center max-w-xs leading-relaxed">
        An unexpected error occurred. It&apos;s been logged automatically.
      </p>
      {error.digest && (
        <p className="text-[11px] text-white/20 font-mono mb-6">ref: {error.digest}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="glass-hi hover:bg-white/[0.14] rounded-xl px-5 py-2.5 text-sm text-white/70 hover:text-white/85 transition-all"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/45 hover:text-white/65 transition-all"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
