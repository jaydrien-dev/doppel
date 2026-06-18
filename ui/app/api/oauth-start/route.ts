import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

// GET /api/oauth-start?service=gmail&clone_id=...&user_id=...
// Redirects the browser to FastAPI's OAuth initiation URL.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const service  = searchParams.get("service");
  const cloneId  = searchParams.get("clone_id");
  const uid      = searchParams.get("user_id") ?? userId;

  if (!service || !cloneId) {
    return NextResponse.json({ error: "service and clone_id required" }, { status: 400 });
  }

  const target = `${FASTAPI}/oauth/${service}/start?clone_id=${cloneId}&user_id=${uid}`;
  return NextResponse.redirect(target);
}
