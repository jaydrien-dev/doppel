import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const res = await backendFetch(`/billing/status?user_id=${userId}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
