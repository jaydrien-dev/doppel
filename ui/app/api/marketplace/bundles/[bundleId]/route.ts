import { backendFetch } from "@/lib/backendFetch";

export async function GET(_request: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const { bundleId } = await params;
  const res = await backendFetch(`/marketplace/bundles/${bundleId}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
