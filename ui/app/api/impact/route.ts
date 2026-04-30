import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const params = req.nextUrl.searchParams.toString();
  const res = await backendFetch(`/brain/impact?${params}`);
  return Response.json(await res.json(), { status: res.status });
}
