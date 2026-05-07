import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 font-[var(--font-manrope)]">
      <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">404</p>
      <h1 className="text-3xl font-light text-white/70 mb-2">Page not found</h1>
      <p className="text-sm text-white/35 mb-8 text-center max-w-xs leading-relaxed">
        This page doesn&apos;t exist or has been moved.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="glass-hi hover:bg-white/[0.14] rounded-xl px-5 py-2.5 text-sm text-white/70 hover:text-white/85 transition-all"
        >
          Go home
        </Link>
        <Link
          href="/dashboard"
          className="glass hover:glass-md rounded-xl px-5 py-2.5 text-sm text-white/45 hover:text-white/65 transition-all"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
