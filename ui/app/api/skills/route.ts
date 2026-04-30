import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return Response.json({ error: "org_id required" }, { status: 400 });

  const res = await backendFetch(`/v1/org/${encodeURIComponent(orgId)}/skills`, {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
