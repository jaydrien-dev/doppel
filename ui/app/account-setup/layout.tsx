import { PageFade } from "@/components/layout/PageFade";

export default function AccountSetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade className="min-h-dvh flex flex-col bg-[#080808]">
      {children}
    </PageFade>
  );
}
