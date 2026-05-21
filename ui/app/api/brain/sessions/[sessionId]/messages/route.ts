import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  const { sessionId } = await params;

  const res = await backendFetch(`/brain/sessions/${sessionId}/messages`, {
    method: "GET",
    headers: {
      ...(userId ? { "X-User-Id": userId } : {}),
    },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
