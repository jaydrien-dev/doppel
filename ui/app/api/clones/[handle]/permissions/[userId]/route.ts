import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string; userId: string }> }
) {
  const { userId: ownerId } = await auth();
  if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle, userId: targetUserId } = await params;
  const res = await backendFetch(
    `/clones/${handle}/permissions/${targetUserId}?owner_user_id=${encodeURIComponent(ownerId)}`,
    { method: "DELETE" }
  );

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
