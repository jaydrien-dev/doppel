import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

// DELETE /api/tools/[id]?clone_id=...
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return Response.json({ error: "clone_id required" }, { status: 400 });

  const res = await backendFetch(`/clones/${cloneId}/tools/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
