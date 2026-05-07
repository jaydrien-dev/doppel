import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const handle = req.nextUrl.searchParams.get("handle");
  if (!handle) return Response.json({ error: "handle required" }, { status: 400 });

  const res = await backendFetch(`/clones/${handle}/handoff-report`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
