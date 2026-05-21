import "../marketplace/marketplace.css";
import { PageFade } from "@/components/layout/PageFade";

export default function SynthesisLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade className="mk-root">
      {children}
    </PageFade>
  );
}
