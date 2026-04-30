import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = await params;
  const res = await backendFetch(
    `/clones/me/keys/${provider}?user_id=${userId}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
