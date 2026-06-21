import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ proposals: [] }, { status: 200 });

  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const res = await backendFetch(`/proposals?${qs}`, {
    headers: { "X-User-Id": userId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
