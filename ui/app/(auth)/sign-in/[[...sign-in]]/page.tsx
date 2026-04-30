import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div>
        <div className="text-center mb-8">
          <p className="text-2xl font-light text-white/80 mb-1">doppel</p>
          <p className="text-sm text-white/35">Your digital consciousness</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "glass rounded-2xl overflow-hidden",
              card: "bg-transparent shadow-none",
              headerTitle: "text-white/80 font-light",
              headerSubtitle: "text-white/40",
              formFieldLabel: "text-white/50 text-xs",
              formFieldInput:
                "bg-white/[0.05] border-white/[0.08] text-white/80 placeholder:text-white/20 rounded-xl",
              formButtonPrimary:
                "bg-white/10 hover:bg-white/15 text-white/80 rounded-xl font-normal border border-white/[0.08]",
              footerActionLink: "text-white/50 hover:text-white/70",
              dividerLine: "bg-white/[0.06]",
              dividerText: "text-white/25",
              socialButtonsBlockButton:
                "bg-white/[0.04] border-white/[0.08] text-white/60 hover:bg-white/[0.08] rounded-xl",
            },
          }}
        />
      </div>
    </div>
  );
}
