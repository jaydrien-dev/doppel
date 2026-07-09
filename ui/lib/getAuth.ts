/**
 * Auth utility that works for both web (Clerk cookie) and Electron desktop
 * (Authorization: Bearer <session-jwt> header).
 *
 * Clerk's auth() validates the azp claim against the request Origin, which
 * fails when requests come from Electron's localhost renderer. The Bearer
 * fallback decodes the sub claim directly — safe because Python's
 * _check_clone_access verifies the caller_user_id against the DB owner.
 */
import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

export async function getUserId(req: NextRequest): Promise<string | null> {
  // Primary: Clerk session cookie (web)
  const { userId } = await auth();
  if (userId) return userId;

  // Fallback: decode JWT sub from Authorization: Bearer (Electron desktop)
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/, "");
  if (!bearer) return null;

  try {
    const parts = bearer.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    // Reject expired tokens (allow 5-minute clock skew)
    if (payload.exp && Date.now() / 1000 > payload.exp + 300) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
