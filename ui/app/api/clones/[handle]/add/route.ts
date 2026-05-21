import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const res = await fetch(
    `${FASTAPI}/clones/${encodeURIComponent(handle)}/add?caller_user_id=${encodeURIComponent(userId)}`,
    { method: "POST" }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const res = await fetch(
    `${FASTAPI}/clones/${encodeURIComponent(handle)}/add?caller_user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
