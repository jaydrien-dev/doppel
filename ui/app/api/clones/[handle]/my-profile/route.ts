import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ exists: false });

  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}/my-profile?caller_user_id=${userId}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}/my-profile?caller_user_id=${userId}`, { method: "DELETE" });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
