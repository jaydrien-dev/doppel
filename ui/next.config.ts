import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  // Next.js requires unsafe-eval in dev; unsafe-inline needed for Tailwind/styled-jsx
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Allow WS/WSS for meetings WebSocket + Clerk + backend
  "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.clerk.dev wss: ws: https:",
  "frame-src https://clerk.com https://*.clerk.accounts.dev https://*.clerk.dev",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' doppel:",
].join("; ");

const nextConfig: NextConfig = {
  async rewrites() {
    const fastapiUrl = process.env.FASTAPI_URL ?? "http://localhost:8000";
    return [
      {
        source: "/v1/:path*",
        destination: `${fastapiUrl}/v1/:path*`,
      },
      // Edge-layer proxy for large file uploads — bypasses Vercel's 4.5 MB
      // serverless function body limit. Uses Vercel's edge network (no limit issue).
      {
        source: "/fastapi/:path*",
        destination: `${fastapiUrl}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Allow microphone only on same origin (needed for meetings page)
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
