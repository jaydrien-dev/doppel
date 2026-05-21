import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(request: Request) {
  const { userId } = await auth();
  const body = await request.json();
  const userHeader: Record<string, string> = userId ? { "X-User-Id": userId } : {};
  const res = await backendFetch("/marketplace/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...userHeader },
    body: JSON.stringify(body),
  });
  return Response.json(await res.json(), { status: res.status });
}
