import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cloneId = req.nextUrl.searchParams.get("clone_id");
  if (!cloneId) return Response.json({ error: "clone_id required" }, { status: 400 });

  const returnPath = req.nextUrl.searchParams.get("return_path") ?? "/dashboard";
  const res = await backendFetch(
    `/ingestion/gmail/auth-url?clone_id=${cloneId}&return_path=${encodeURIComponent(returnPath)}`
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
