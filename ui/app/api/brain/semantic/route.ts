import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const res = await backendFetch(`/brain/semantic?${searchParams.toString()}`, { cache: "no-store" } as RequestInit);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
