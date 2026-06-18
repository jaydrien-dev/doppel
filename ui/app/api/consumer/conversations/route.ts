import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ conversations: [] }, { status: 200 });

  // FastAPI expects caller_user_id as query param (not header)
  const res = await backendFetch(
    `/consumer/conversations?caller_user_id=${encodeURIComponent(userId)}`
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
