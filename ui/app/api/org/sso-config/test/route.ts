import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const res = await backendFetch(
    `/org/sso-config/test?user_id=${encodeURIComponent(userId)}`,
    { method: "POST" }
  );

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
