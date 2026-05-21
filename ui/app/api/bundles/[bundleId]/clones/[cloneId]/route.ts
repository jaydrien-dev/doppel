import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(_: Request, { params }: { params: Promise<{ bundleId: string; cloneId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId, cloneId } = await params;
  const res = await backendFetch(`/bundles/${bundleId}/clones/${cloneId}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  return new Response(null, { status: res.status });
}
