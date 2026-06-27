import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const body = await req.json();
  const res = await backendFetch(`/clones/${cloneId}/automations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/automations/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  return new NextResponse(null, { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // POST /api/automations/[id]?action=run
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/automations/${id}/run`, {
    method: "POST",
    headers: { "X-User-Id": userId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
