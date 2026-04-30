import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const res = await backendFetch(
    `/clones/me/export?user_id=${encodeURIComponent(userId)}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return Response.json(err, { status: res.status });
  }

  const blob = await res.blob();
  const filename = res.headers.get("Content-Disposition")?.match(/filename=(.+)/)?.[1]
    ?? "doppel_export.json";

  return new Response(blob, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}
