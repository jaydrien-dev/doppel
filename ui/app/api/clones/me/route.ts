import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const res = await backendFetch(
    `/clones/me?user_id=${encodeURIComponent(userId)}`
  );

  if (res.status === 404) return Response.json(null, { status: 404 });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const confirm = req.headers.get("X-Confirm-Delete") ?? "";

  const res = await backendFetch(
    `/clones/me?user_id=${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: { "X-Confirm-Delete": confirm },
    }
  );

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
