import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ handle: string; sourceHandle: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { handle, sourceHandle } = await params;
  const body = await req.json();
  const res = await backendFetch(`/clones/${handle}/import-from/${sourceHandle}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
