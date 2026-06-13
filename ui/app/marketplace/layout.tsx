import "./marketplace.css";
import { PageFade } from "@/components/layout/PageFade";
import { HelpWidget } from "@/components/help/HelpWidget";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade className="mk-root">
      {children}
      <HelpWidget />
    </PageFade>
  );
}
