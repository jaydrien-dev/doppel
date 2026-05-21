"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}
    >
      {children}
    </motion.div>
  );
}
