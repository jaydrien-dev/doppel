import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}/suggested-questions`);
  return Response.json(await res.json(), { status: res.status });
}
