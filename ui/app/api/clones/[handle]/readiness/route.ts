import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}/readiness`, {
    headers: { "X-User-Id": userId },
  });
  if (!res.ok) return Response.json({ error: "Failed" }, { status: res.status });
  return Response.json(await res.json(), { status: 200 });
}
