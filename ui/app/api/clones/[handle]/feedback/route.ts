import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  const { handle } = await params;
  const body = await request.json();

  const res = await backendFetch(`/clones/${handle}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(userId ? { "X-User-Id": userId } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
