import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  // Stream the CSV directly from FastAPI
  const res = await fetch(`${FASTAPI}/brain/activity-report/export?${searchParams.toString()}`, { cache: "no-store" });
  if (!res.ok) return Response.json({ error: "Export failed" }, { status: res.status });
  const csv = await res.text();
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? `attachment; filename=activity-report.csv`,
    },
  });
}
