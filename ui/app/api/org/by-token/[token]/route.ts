import { NextRequest, NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await fetch(`${FASTAPI}/org/by-token/${encodeURIComponent(token)}`, { cache: "no-store" });
  return NextResponse.json(await res.json(), { status: res.status });
}
