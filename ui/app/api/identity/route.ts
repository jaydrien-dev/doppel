import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cloneId = new URL(req.url).searchParams.get("clone_id");
  const qs = cloneId
    ? `user_id=${encodeURIComponent(userId)}&clone_id=${encodeURIComponent(cloneId)}`
    : `user_id=${encodeURIComponent(userId)}`;

  const res = await backendFetch(`/identity?${qs}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const res = await backendFetch("/identity", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, user_id: userId }),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
