import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function PATCH(request: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId } = await params;
  const body = await request.json().catch(() => ({}));
  const res = await backendFetch(`/consumer-bundles/${bundleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId } = await params;
  const res = await backendFetch(`/consumer-bundles/${bundleId}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  return new Response(null, { status: res.status });
}
