import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";
import { getUserId } from "@/lib/getAuth";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ automations: [] }, { status: 200 });
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/automations`, {
    headers: { "X-User-Id": userId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const cloneId = body.clone_id;
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
