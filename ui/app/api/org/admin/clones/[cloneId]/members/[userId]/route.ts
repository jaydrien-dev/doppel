import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cloneId: string; userId: string }> }
) {
  const { userId: adminId } = await auth();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cloneId, userId: targetId } = await params;
  const res = await backendFetch(`/org/clones/${cloneId}/members/${targetId}`, {
    method: "DELETE",
    headers: { "X-User-Id": adminId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
