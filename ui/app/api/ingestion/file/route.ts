import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Forward the multipart body as-is to FastAPI
  const body = await req.arrayBuffer();
  const contentType = req.headers.get("content-type") ?? "";

  let res: Response;
  try {
    res = await fetch(`${FASTAPI}/ingestion/file`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  } catch {
    return Response.json({ error: "Backend unavailable" }, { status: 503 });
  }

  const data = await res.json().catch(() => ({ error: res.statusText }));
  return Response.json(data, { status: res.status });
}
