import { auth } from "@clerk/nextjs/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Forward the multipart form directly — do NOT parse it in Next.js
  const formData = await request.formData();

  let res: Response;
  try {
    res = await fetch(`${FASTAPI}/consumer/brain/upload`, {
      method: "POST",
      headers: { "X-User-Id": userId },
      body: formData,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return Response.json({ error: "Backend unavailable" }, { status: 503 });
    }
    throw err;
  }

  return Response.json(await res.json(), { status: res.status });
}
