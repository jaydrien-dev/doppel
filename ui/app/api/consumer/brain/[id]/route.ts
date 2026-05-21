import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const res = await backendFetch(`/consumer/brain/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  return Response.json(await res.json(), { status: res.status });
}
