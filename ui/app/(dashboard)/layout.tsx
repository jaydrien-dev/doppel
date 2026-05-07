import { Sidebar } from "@/components/layout/Sidebar";
import { TourProvider } from "@/components/tour/TourProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TourProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </TourProvider>
  );
}
