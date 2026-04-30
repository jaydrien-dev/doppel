import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backendFetch";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cloneId = req.nextUrl.searchParams.get("clone_id");
  if (!cloneId) return Response.json({ error: "clone_id required" }, { status: 400 });

  // Fetch all traces (large limit for export)
  const res = await backendFetch(`/brain/activity?clone_id=${cloneId}&limit=5000&offset=0`);
  if (!res.ok) return Response.json({ error: "Failed to fetch traces" }, { status: 500 });

  const data = await res.json();
  const traces: {
    id: string;
    session_id: string;
    path: string;
    confidence: number | null;
    feedback_signal: string | null;
    input_message: string;
    response: string;
    latency_ms: number | null;
    needs_escalation: boolean;
    created_at: string;
  }[] = data.traces ?? [];

  const headers = ["id", "created_at", "session_id", "path", "confidence", "latency_ms", "needs_escalation", "feedback_signal", "input_message", "response"];

  function escape(v: string | number | boolean | null | undefined): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const rows = traces.map((t) =>
    headers.map((h) => escape(t[h as keyof typeof t])).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="doppel-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
