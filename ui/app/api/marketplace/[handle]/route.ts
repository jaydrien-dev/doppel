import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const res = await backendFetch(`/marketplace/${handle}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
