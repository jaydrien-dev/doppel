import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  const cloneHandle = searchParams.get("clone_handle");

  if (!cloneId && !cloneHandle) {
    return NextResponse.json({ error: "clone_id or clone_handle required" }, { status: 400 });
  }

  const qs = new URLSearchParams();
  if (cloneId) qs.set("clone_id", cloneId);
  if (cloneHandle) qs.set("clone_handle", cloneHandle);

  const res = await backendFetch(`/consumer/session?${qs.toString()}`, {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
