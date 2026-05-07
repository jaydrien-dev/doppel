import { auth, clerkClient } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return Response.json({ error: "No email on account" }, { status: 400 });

  const res = await backendFetch("/org/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, email }),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
