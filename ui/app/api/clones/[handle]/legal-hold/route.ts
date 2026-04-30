import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const body = await req.json();

  const res = await backendFetch(`/admin/clones/${handle}/legal-hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, user_id: userId }),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const res = await backendFetch(
    `/admin/clones/${handle}/legal-hold?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
