/**
 * Server-side fetch wrappers for FastAPI calls.
 *
 * backendFetch — JSON calls: catches ECONNREFUSED → 503, wraps non-JSON bodies.
 * backendStream — SSE/stream calls: catches ECONNREFUSED → 503, passes body through raw.
 */

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function backendFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${FASTAPI}${path}`;

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : String(err);
    const isConnRefused =
      (err as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed");

    if (isConnRefused) {
      return Response.json(
        { error: "Backend unavailable — start FastAPI on port 8000" },
        { status: 503 }
      );
    }
    throw err;
  }

  // If the response isn't JSON (e.g. FastAPI crashed before its error handler),
  // wrap the raw text so callers can always safely call res.json().
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    return Response.json(
      { error: text || res.statusText },
      { status: res.status }
    );
  }

  return res;
}

/**
 * Stream wrapper — like backendFetch but never wraps the body.
 * Used for SSE endpoints (text/event-stream). Callers pipe res.body directly.
 */
export async function backendStream(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${FASTAPI}${path}`;

  try {
    return await fetch(url, init);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isConnRefused =
      (err as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed");

    if (isConnRefused) {
      // Return a fake SSE stream with a single error event
      const body = `data: ${JSON.stringify({ event: "error", message: "Backend unavailable — start FastAPI on port 8000" })}\n\n`;
      return new Response(body, {
        status: 503,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    throw err;
  }
}
