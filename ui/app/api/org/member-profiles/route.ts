import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user_ids }: { user_ids: string[] } = await req.json();
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return NextResponse.json({ profiles: {} });
  }

  const client = await clerkClient();
  const profiles: Record<string, { name: string; email: string; image_url: string | null }> = {};

  await Promise.all(
    user_ids.map(async (uid) => {
      try {
        const u = await client.users.getUser(uid);
        profiles[uid] = {
          name:
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
            u.username ||
            uid.slice(0, 12),
          email: u.emailAddresses[0]?.emailAddress ?? "",
          image_url: u.imageUrl ?? null,
        };
      } catch {
        profiles[uid] = { name: uid.slice(0, 12), email: "", image_url: null };
      }
    })
  );

  return NextResponse.json({ profiles });
}
