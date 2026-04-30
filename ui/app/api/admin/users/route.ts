import { auth, clerkClient } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ?? "50";
  const offset = searchParams.get("offset") ?? "0";

  const fastApiUrl = process.env.FASTAPI_URL ?? "http://localhost:8000";
  const res = await backendFetch(
    `/admin/users?caller_user_id=${userId}&limit=${limit}&offset=${offset}`
  );
  if (!res.ok) {
    const data = await res.json();
    // Include backend URL (host only) for easier debugging
    const urlHost = (() => { try { return new URL(fastApiUrl).host; } catch { return fastApiUrl; } })();
    return Response.json({ ...data, _backend: urlHost }, { status: res.status });
  }

  const data = await res.json();
  const users: { user_id: string }[] = data.users ?? [];

  // Enrich with real names/emails from Clerk
  const client = await clerkClient();
  const enriched = await Promise.all(
    users.map(async (u) => {
      try {
        const clerkUser = await client.users.getUser(u.user_id);
        return {
          ...u,
          clerk_name:
            [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
            clerkUser.username ||
            null,
          clerk_email:
            clerkUser.emailAddresses[0]?.emailAddress ?? null,
        };
      } catch {
        return { ...u, clerk_name: null, clerk_email: null };
      }
    })
  );

  return Response.json({ ...data, users: enriched });
}
