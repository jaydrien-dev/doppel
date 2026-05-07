import { auth, clerkClient } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return Response.json({ invite: null });

  const res = await backendFetch(`/org/pending-invite?email=${encodeURIComponent(email)}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
