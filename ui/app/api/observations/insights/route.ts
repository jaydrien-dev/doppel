import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cloneId = req.nextUrl.searchParams.get("clone_id");
  if (!cloneId) return Response.json({ error: "clone_id required" }, { status: 400 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const limit = req.nextUrl.searchParams.get("limit") ?? "20";
  const res = await backendFetch(
    `/observation/insights?clone_id=${cloneId}&status=${status}&limit=${limit}`,
    { headers: { "X-User-Id": userId } },
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
