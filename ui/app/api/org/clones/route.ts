import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";
import { getUserId } from "@/lib/getAuth";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ clones: [] }, { status: 200 });

  const res = await backendFetch("/org/clones", {
    headers: { "X-User-Id": userId },
  });
  if (!res.ok) return NextResponse.json({ clones: [] }, { status: 200 });
  const data = await res.json();
  return NextResponse.json(data, { status: 200 });
}
