import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(_: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { bundleId } = await params;
  const res = await backendFetch(`/consumer-bundles/${bundleId}/read`, {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
