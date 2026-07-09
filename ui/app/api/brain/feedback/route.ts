import { backendFetch } from "@/lib/backendFetch";
import { getUserId } from "@/lib/getAuth";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const res = await backendFetch("/brain/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  // 204 No Content
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
