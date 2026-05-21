import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(_request: Request, { params }: { params: Promise<{ bundleId: string; itemId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId, itemId } = await params;
  const res = await backendFetch(`/bundles/${bundleId}/items/${itemId}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
