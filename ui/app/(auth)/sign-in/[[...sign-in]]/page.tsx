import { SignIn } from "@clerk/nextjs";

function DoppelMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="21" height="21" rx="6.5"
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.14)" />
      <circle cx="8.88" cy="8.88" r="4.65" fill="rgba(255,255,255,0.95)" />
      <circle cx="13.96" cy="13.96" r="3.80" fill="rgba(167,139,250,0.70)" />
    </svg>
  );
}

export default function SignInPage() {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px 16px 64px",
      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
      position: "relative",
    }}>
      {/* Background */}
      <div style={{
        position: "fixed", inset: 0,
        background: "#080808",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)",
        zIndex: 0, pointerEvents: "none",
      }} />
      <div style={{
        position: "fixed", inset: 0, background: "#080808", zIndex: -1, pointerEvents: "none",
      }} />
      {/* Ambient orb */}
      <div style={{
        position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)",
        width: 560, height: 560, borderRadius: "50%",
        background: "rgba(167,139,250,0.07)",
        filter: "blur(120px)", pointerEvents: "none", zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <DoppelMark />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 19, fontWeight: 500, color: "rgba(255,255,255,0.88)", letterSpacing: "-0.02em", margin: 0 }}>doppel</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", marginTop: 5, letterSpacing: "-0.01em" }}>
              Knowledge shouldn&apos;t have a lifespan.
            </p>
          </div>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorBackground: "rgba(255,255,255,0.04)",
              colorText: "rgba(255,255,255,0.82)",
              colorTextSecondary: "rgba(255,255,255,0.40)",
              colorInputBackground: "rgba(255,255,255,0.05)",
              colorInputText: "rgba(255,255,255,0.80)",
              borderRadius: "12px",
              fontFamily: "var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)",
            },
            elements: {
              rootBox: "w-full",
              card: "!bg-white/[0.04] !backdrop-blur-2xl !border !border-white/[0.08] !rounded-2xl !shadow-none",
              headerTitle: "!text-white/85 !font-medium !text-[15px]",
              headerSubtitle: "!text-white/38 !text-[13px]",
              formFieldLabel: "!text-white/45 !text-[12px] !font-normal",
              formFieldInput:
                "!bg-white/[0.05] !border-white/[0.08] !text-white/80 placeholder:!text-white/20 !rounded-xl focus:!border-white/[0.18]",
              formButtonPrimary:
                "!bg-white/[0.10] hover:!bg-white/[0.15] !text-white/85 !rounded-xl !font-medium !border !border-white/[0.10] !shadow-none !transition-all",
              footerActionLink: "!text-white/50 hover:!text-white/72",
              footerActionText: "!text-white/32",
              dividerLine: "!bg-white/[0.07]",
              dividerText: "!text-white/25 !text-[12px]",
              socialButtonsBlockButton:
                "!bg-white/[0.05] !border !border-white/[0.08] hover:!bg-white/[0.09] !rounded-xl !transition-all",
              socialButtonsBlockButtonText: "!text-white/55 !font-normal !text-[13px]",
              identityPreviewText: "!text-white/55",
              identityPreviewEditButton: "!text-white/38 hover:!text-white/60",
              formResendCodeLink: "!text-white/45 hover:!text-white/65",
              otpCodeFieldInput: "!bg-white/[0.05] !border-white/[0.08] !text-white/80 !rounded-xl",
              alertText: "!text-white/55 !text-[12px]",
              formFieldErrorText: "!text-red-400/70 !text-[12px]",
            },
          }}
        />
      </div>
    </div>
  );
}
