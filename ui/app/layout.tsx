import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./landing.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
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
    <ClerkProvider signInFallbackRedirectUrl="/home" signUpFallbackRedirectUrl="/onboarding">
      <html lang="en" className={`${plusJakartaSans.variable} h-full`}>
        <body className="min-h-full antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
