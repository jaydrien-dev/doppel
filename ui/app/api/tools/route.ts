import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

// GET /api/tools?clone_id=...  — list MCP servers for a clone
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cloneId = searchParams.get("clone_id");
  if (!cloneId) return Response.json({ error: "clone_id required" }, { status: 400 });

  const res = await backendFetch(`/clones/${cloneId}/tools`, {
    headers: { "X-User-Id": userId },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

// POST /api/tools  — add a new MCP server
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { clone_id, ...serverBody } = body;
  if (!clone_id) return Response.json({ error: "clone_id required" }, { status: 400 });

  const res = await backendFetch(`/clones/${clone_id}/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify(serverBody),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
