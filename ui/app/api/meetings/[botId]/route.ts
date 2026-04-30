import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { botId } = await params;
  const res = await backendFetch(`/meetings/${botId}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
