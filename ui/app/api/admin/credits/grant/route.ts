import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(request: Request) {
  const { userId: callerId } = await auth();
  if (!callerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const res = await backendFetch(
    `/admin/credits/grant?caller_user_id=${callerId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
