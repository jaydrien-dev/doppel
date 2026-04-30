import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const res = await backendFetch(
    `/clones/${handle}/permissions?user_id=${encodeURIComponent(userId)}`
  );

  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const body = await req.json();

  const res = await backendFetch(`/clones/${handle}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, owner_user_id: userId }),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
