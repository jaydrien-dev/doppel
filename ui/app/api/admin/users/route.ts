import { auth, clerkClient } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

type BackendUser = {
  user_id: string;
  display_name?: string;
  handle?: string;
  subscription_tier?: string;
  credits_remaining?: number;
  clone_count?: number;
  admin_tier_override?: boolean;
  stripe_customer_id?: string;
  created_at?: string | null;
};

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "500");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // Fetch all Clerk users — source of truth for who exists
  const client = await clerkClient();
  const clerkResponse = await client.users.getUserList({ limit: 500, offset });
  const clerkUsers = clerkResponse.data;

  // Fetch backend data — high limit so we get everyone
  const backendMap: Record<string, BackendUser> = {};
  try {
    const res = await backendFetch(
      `/admin/users?caller_user_id=${userId}&limit=200&offset=0`
    );
    if (res.ok) {
      const data = await res.json();
      for (const row of (data.users ?? []) as BackendUser[]) {
        backendMap[row.user_id] = row;
      }
    }
  } catch {
    // Non-fatal — still return Clerk users with empty backend data
  }

  // Merge: every Clerk user gets a row; backend data enriches it
  const users = clerkUsers.slice(0, limit).map((cu) => {
    const b = backendMap[cu.id] ?? {};
    const clerkName =
      [cu.firstName, cu.lastName].filter(Boolean).join(" ") ||
      cu.username ||
      null;
    return {
      user_id: cu.id,
      display_name: b.display_name ?? clerkName ?? cu.id,
      handle: b.handle ?? "",
      subscription_tier: b.subscription_tier ?? "free",
      credits_remaining: b.credits_remaining ?? 0,
      clone_count: b.clone_count ?? 0,
      admin_tier_override: b.admin_tier_override ?? false,
      stripe_customer_id: b.stripe_customer_id ?? null,
      created_at: b.created_at ?? null,
      clerk_name: clerkName,
      clerk_email: cu.emailAddresses[0]?.emailAddress ?? null,
    };
  });

  return Response.json({ users, total: clerkResponse.totalCount });
}
