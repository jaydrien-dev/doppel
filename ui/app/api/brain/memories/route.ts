import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams.toString();
  const res = await backendFetch(`/brain/memories?${params}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  const sourceRef = searchParams.get("source_ref");
  if (!cloneId || !sourceRef) {
    return Response.json({ error: "clone_id and source_ref required" }, { status: 400 });
  }

  const res = await backendFetch(
    `/brain/memories?clone_id=${cloneId}&source_ref=${encodeURIComponent(sourceRef)}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
