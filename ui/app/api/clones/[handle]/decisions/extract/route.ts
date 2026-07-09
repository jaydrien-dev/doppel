import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}/decisions/extract`, {
    method: "POST",
    headers: { "X-User-Id": userId },
  });
  return Response.json(await res.json(), { status: res.status });
}
