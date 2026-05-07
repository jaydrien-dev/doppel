import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { clone_id } = await req.json();
  const res = await backendFetch(`/ingestion/gmail/watch?clone_id=${clone_id}`, {
    method: "POST",
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
