import { PageFade } from "@/components/layout/PageFade";

export default function SynthesisLayout({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
