import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(_request: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId } = await params;
  const res = await backendFetch(`/bundles/${bundleId}/items`, {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId } = await params;
  const body = await request.json();
  const res = await backendFetch(`/bundles/${bundleId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
