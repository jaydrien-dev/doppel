import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${FASTAPI}/org/training-overview`, {
    headers: { "X-User-Id": userId },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
