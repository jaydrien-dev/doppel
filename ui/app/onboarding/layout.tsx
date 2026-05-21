import "./onboarding.css";
import { PageFade } from "@/components/layout/PageFade";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade className="min-h-dvh flex flex-col bg-[#0a0a0a]">
      {children}
    </PageFade>
  );
}
