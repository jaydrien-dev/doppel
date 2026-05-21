import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(_request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const res = await backendFetch("/consumer/brain", {
    headers: { "X-User-Id": userId },
  });
  return Response.json(await res.json(), { status: res.status });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const res = await backendFetch("/consumer/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  return Response.json(await res.json(), { status: res.status });
}
