import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await backendFetch("/consumer/brain", { headers: { "X-User-Id": userId } });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const res = await backendFetch("/consumer/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
