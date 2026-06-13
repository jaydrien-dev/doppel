import { Sidebar } from "@/components/layout/Sidebar";
import { TourProvider } from "@/components/tour/TourProvider";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { HelpWidget } from "@/components/help/HelpWidget";
import { AdvancedModeProvider } from "@/lib/context/AdvancedModeContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdvancedModeProvider>
      <TourProvider>
        <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "#080808" }}>
          <Sidebar />
          <main className="db-main">
            <PageWrapper>{children}</PageWrapper>
          </main>
        </div>
        <HelpWidget />
      </TourProvider>
    </AdvancedModeProvider>
  );
}
