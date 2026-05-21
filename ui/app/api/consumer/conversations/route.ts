import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${FASTAPI}/consumer/conversations?caller_user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
