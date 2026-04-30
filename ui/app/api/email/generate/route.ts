import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.text();
  const res = await backendFetch("/email/generate-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
