import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const res = await backendFetch("/help/clone");
  return Response.json(await res.json(), { status: res.status });
}
