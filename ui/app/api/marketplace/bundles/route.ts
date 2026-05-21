import { backendFetch } from "@/lib/backendFetch";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  if (searchParams.get("limit")) params.set("limit", searchParams.get("limit")!);
  if (searchParams.get("offset")) params.set("offset", searchParams.get("offset")!);
  const res = await backendFetch(`/marketplace/bundles?${params}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
