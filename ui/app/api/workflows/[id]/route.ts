import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const cloneId = new URL(req.url).searchParams.get("clone_id") ?? body.clone_id;
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const cloneId = new URL(req.url).searchParams.get("clone_id");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/workflows/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  return new NextResponse(null, { status: res.status });
}
