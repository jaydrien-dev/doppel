import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const res = await backendFetch(`/clones/${cloneId}/tasks/${id}`, {
    headers: { "X-User-Id": userId },
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
  const res = await backendFetch(`/clones/${cloneId}/tasks/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
  return new NextResponse(null, { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // POST /api/tasks/[id]?action=resume
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cloneId = searchParams.get("clone_id");
  const action = searchParams.get("action");
  if (!cloneId) return NextResponse.json({ error: "clone_id required" }, { status: 400 });
  const endpoint = action === "resume"
    ? `/clones/${cloneId}/tasks/${id}/resume`
    : `/clones/${cloneId}/tasks/${id}`;
  const res = await backendFetch(endpoint, {
    method: "POST",
    headers: { "X-User-Id": userId },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
