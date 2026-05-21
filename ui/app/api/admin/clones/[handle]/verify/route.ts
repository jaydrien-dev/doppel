import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId: callerId } = await auth();
  if (!callerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const body = await request.json().catch(() => ({}));

  const res = await backendFetch(
    `/admin/clones/${handle}/verify?caller_user_id=${callerId}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId: callerId } = await auth();
  if (!callerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;

  const res = await backendFetch(
    `/admin/clones/${handle}/verify?caller_user_id=${callerId}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
