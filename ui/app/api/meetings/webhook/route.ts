/**
 * Recall.ai webhook — receives real-time transcription events.
 * No auth — Recall.ai calls this. Request origin is verified by Recall.ai's signature (future).
 */
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await backendFetch("/meetings/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return Response.json({ ok: true }, { status: res.ok ? 200 : 500 });
}
