"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

interface PageFadeProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Lightweight page fade-in.
 * No exit animation — content appears immediately, fades in over 200ms.
 * key={pathname} re-triggers the enter animation on every navigation.
 */
export function PageFade({ children, style, className }: PageFadeProps) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ minHeight: "100%", ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
