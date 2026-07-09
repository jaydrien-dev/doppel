import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getUserId } from "@/lib/getAuth";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return NextResponse.json({
      id: user.id,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.emailAddresses[0]?.emailAddress ?? "",
      imageUrl: user.imageUrl ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
