export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100dvh", background: "#080808", overflow: "hidden" }}>
      {children}
    </div>
  );
}
