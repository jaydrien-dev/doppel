import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await backendFetch(`/ingestion/jobs/${id}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
