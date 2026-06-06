import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

type Ctx = { params: Promise<{ cloneId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cloneId } = await params;
  const res = await backendFetch(`/org/clones/${cloneId}/members`, {
    headers: { "X-User-Id": userId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cloneId } = await params;
  const { target_user_id } = await req.json();
  const res = await backendFetch(`/org/clones/${cloneId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_user_id: userId, target_user_id }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
