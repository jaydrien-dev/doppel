import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const res = await backendFetch("/consumer-bundles", {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const res = await backendFetch("/consumer-bundles", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
