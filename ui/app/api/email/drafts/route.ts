import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams.toString();
  const res = await backendFetch(`/email/drafts?${params}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
