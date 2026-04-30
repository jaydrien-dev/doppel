import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: callerId } = await auth();
  if (!callerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const body = await request.json();

  const res = await backendFetch(
    `/admin/users/${userId}/plan?caller_user_id=${callerId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
