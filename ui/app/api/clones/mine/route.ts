import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";
import { getUserId } from "@/lib/getAuth";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ clones: [] }, { status: 200 });

  const res = await backendFetch("/clones/mine", {
    headers: { "X-User-Id": userId },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
