import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await fetch(`${FASTAPI}/org?user_id=${encodeURIComponent(userId)}`, { cache: "no-store" });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const res = await fetch(`${FASTAPI}/org`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, user_id: userId }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await fetch(`${FASTAPI}/org?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
  return NextResponse.json(await res.json(), { status: res.status });
}
