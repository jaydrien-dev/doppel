import { auth } from "@clerk/nextjs/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  let res: Response;
  try {
    res = await fetch(`${FASTAPI}/consumer/voice/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": userId },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return Response.json({ error: "Backend unavailable" }, { status: 503 });
    }
    throw err;
  }

  if (!res.ok) {
    return Response.json({ error: "Synthesis failed" }, { status: res.status });
  }

  // Stream audio bytes back to browser
  return new Response(res.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
