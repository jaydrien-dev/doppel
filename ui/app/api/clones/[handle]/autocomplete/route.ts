import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const res = await backendFetch(`/clones/${handle}/autocomplete?q=${encodeURIComponent(q)}`);
  return Response.json(await res.json(), { status: res.status });
}
