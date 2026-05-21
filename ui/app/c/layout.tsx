import { PageFade } from "@/components/layout/PageFade";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFade style={{ display: "contents" }}>
      {children}
    </PageFade>
  );
}
