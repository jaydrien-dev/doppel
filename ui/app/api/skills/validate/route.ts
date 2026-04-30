import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { org_id, ...rest } = body;
  if (!org_id) return Response.json({ error: "org_id required" }, { status: 400 });

  const res = await backendFetch(`/v1/org/${encodeURIComponent(org_id)}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(rest),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
