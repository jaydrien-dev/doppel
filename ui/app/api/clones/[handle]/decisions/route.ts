import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}/decisions`, {
    headers: { "X-User-Id": userId },
  });
  return Response.json(await res.json(), { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { handle } = await params;
  const body = await req.json();
  const res = await backendFetch(`/clones/${handle}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  return Response.json(await res.json(), { status: res.status });
}
