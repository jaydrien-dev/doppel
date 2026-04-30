import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/c/(.*)",
  "/api/clones/(.*)",         // public clone info
  "/api/chat",                // anyone can chat with a public clone
  "/api/meetings/webhook",    // Recall.ai calls this — no user auth
  "/api/slack/events",        // Slack posts here — no user auth
]);

const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Authenticated users visiting sign-in/up → send to dashboard
  if (userId && isAuthPage(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Protect everything that isn't public
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
