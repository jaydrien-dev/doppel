import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string; id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { handle, id } = await params;
  const res = await backendFetch(`/clones/${handle}/decisions/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  return Response.json(await res.json().catch(() => ({})), { status: res.status });
}
