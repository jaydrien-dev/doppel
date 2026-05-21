import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const res = await backendFetch("/credits/packs");
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
