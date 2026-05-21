import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(_request: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId } = await params;
  const res = await backendFetch(`/bundles/${bundleId}/generate`, {
    method: "POST",
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
