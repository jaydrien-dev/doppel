import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const res = await backendFetch(
    `/clones/${handle}?caller_user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );

  const data = await res.json();
  if (res.ok) {
    revalidatePath("/dashboard/clones");
    revalidatePath(`/c/${handle}`);
  }
  return Response.json(data, { status: res.status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const res = await backendFetch(`/clones/${handle}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { handle } = await params;
  const body = await req.json();

  const res = await backendFetch(`/clones/${handle}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (res.ok) revalidatePath(`/c/${handle}`);
  return Response.json(data, { status: res.status });
}
