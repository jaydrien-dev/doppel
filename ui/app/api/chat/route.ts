import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch, backendStream } from "@/lib/backendFetch";
import { getUserId } from "@/lib/getAuth";

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  const body = await req.json();
  const { stream: wantsStream, ...brainInput } = body;

  const userHeader: Record<string, string> = userId ? { "X-User-Id": userId } : {};
  // Only fetch currentUser for web sessions (Clerk cookie auth) — skip for Electron Bearer auth
  if (userId) {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const user = await currentUser();
      const email = user?.emailAddresses?.[0]?.emailAddress;
      if (email) userHeader["X-User-Email"] = email;
    }
  }

  if (wantsStream) {
    const res = await backendStream("/brain/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...userHeader },
      body: JSON.stringify(brainInput),
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const res = await backendFetch("/brain/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...userHeader },
    body: JSON.stringify(brainInput),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
