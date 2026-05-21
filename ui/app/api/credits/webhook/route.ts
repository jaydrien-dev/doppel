import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(req: NextRequest) {
  const body = await req.arrayBuffer();
  const sig = req.headers.get("stripe-signature") ?? "";

  const res = await backendFetch("/credits/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    },
    body,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
