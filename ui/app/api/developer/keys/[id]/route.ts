import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await backendFetch(
    `/developer/keys/${id}?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
