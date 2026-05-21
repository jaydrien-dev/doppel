import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(_request: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { userId } = await auth();
  const { bundleId } = await params;
  const res = await backendFetch(`/bundles/${bundleId}/access`, {
    headers: userId ? { "X-User-Id": userId } : {},
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
