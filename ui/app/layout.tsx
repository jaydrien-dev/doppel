import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Doppel — Your Digital Consciousness",
  description: "Train an AI clone that thinks and sounds exactly like you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${manrope.variable} h-full`}>
        <body className="min-h-full antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
