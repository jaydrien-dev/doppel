import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org_id, invited_email, role = "member" } = await req.json();
  if (!invited_email?.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const email = invited_email.trim().toLowerCase();
  const client = await clerkClient();

  // Look up whether this email belongs to an existing Doppel account
  const clerkList = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  const found = clerkList.data[0] ?? null;

  if (found) {
    // User already has an account — add them directly to the org
    const addRes = await fetch(`${FASTAPI}/org/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_user_id: userId,
        target_user_id: found.id,
        role,
      }),
    });
    const addData = await addRes.json();
    if (!addRes.ok) {
      return NextResponse.json(addData, { status: addRes.status });
    }

    const name =
      [found.firstName, found.lastName].filter(Boolean).join(" ") ||
      found.username ||
      email;

    if (addData.status === "already_member") {
      return NextResponse.json({ status: "already_member", message: `${name} is already in the org.` });
    }
    return NextResponse.json({ status: "added", message: `${name} has been added to the org.` });
  }

  // No account found — record a pending invite and tell admin to share the join link
  const invRes = await fetch(`${FASTAPI}/org/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id, invited_email: email, role }),
  });
  const invData = await invRes.json();
  if (!invRes.ok) {
    return NextResponse.json(invData, { status: invRes.status });
  }

  return NextResponse.json({
    status: "pending",
    message: `No account found for ${email}. Invite recorded — they'll be added automatically when they sign up and use the join link.`,
  });
}
