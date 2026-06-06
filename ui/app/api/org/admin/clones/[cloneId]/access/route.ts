import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cloneId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cloneId } = await params;
  const { access_mode } = await req.json();
  const res = await fetch(`${FASTAPI}/org/clones/${encodeURIComponent(cloneId)}/access`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_user_id: userId, access_mode }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
