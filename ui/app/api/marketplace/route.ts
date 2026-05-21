import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const params = new URLSearchParams();
  if (searchParams.get("category")) params.set("category", searchParams.get("category")!);
  if (searchParams.get("limit")) params.set("limit", searchParams.get("limit")!);
  if (searchParams.get("offset")) params.set("offset", searchParams.get("offset")!);
  if (searchParams.get("sort")) params.set("sort", searchParams.get("sort")!);
  if (searchParams.get("q")) params.set("q", searchParams.get("q")!);

  const res = await backendFetch(`/marketplace?${params}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
