import "./marketplace.css";
import { PageFade } from "@/components/layout/PageFade";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade className="mk-root">
      {children}
    </PageFade>
  );
}
