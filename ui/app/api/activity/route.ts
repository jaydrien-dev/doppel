import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  const limit = searchParams.get("limit") ?? "50";
  const offset = searchParams.get("offset") ?? "0";

  if (!cloneId) {
    return Response.json({ error: "clone_id required" }, { status: 400 });
  }

  const res = await backendFetch(
    `/brain/traces?clone_id=${cloneId}&limit=${limit}&offset=${offset}`
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
