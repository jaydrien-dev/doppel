import { PageFade } from "@/components/layout/PageFade";
import { HelpWidget } from "@/components/help/HelpWidget";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade style={{ display: "contents" }}>
      {children}
      <HelpWidget />
    </PageFade>
  );
}
