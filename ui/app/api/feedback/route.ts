import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(req: NextRequest) {
  const body = await req.json();
  await backendFetch("/brain/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(null, { status: 204 });
}
