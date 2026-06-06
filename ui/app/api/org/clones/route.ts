import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await backendFetch("/org/clones", {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
