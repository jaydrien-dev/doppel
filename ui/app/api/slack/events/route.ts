import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

// Public route — Slack posts here directly, no Clerk auth
export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await backendFetch("/slack/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": req.headers.get("X-Slack-Request-Timestamp") ?? "",
      "X-Slack-Signature": req.headers.get("X-Slack-Signature") ?? "",
    },
    body,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
