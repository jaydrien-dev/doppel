import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const res = await backendFetch("/credits/packs");
  return NextResponse.json(await res.json(), { status: res.status });
}
