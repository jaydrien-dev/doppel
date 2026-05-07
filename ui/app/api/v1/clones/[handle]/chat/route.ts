/**
 * Proxy for the public developer API — forwards Authorization: Bearer dak_...
 * Used by the API Test tab in the dashboard.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const authHeader = request.headers.get("Authorization") ?? "";
  const body = await request.text();

  const fastapiUrl = process.env.FASTAPI_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${fastapiUrl}/v1/clones/${encodeURIComponent(handle)}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body,
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return Response.json(data, { status: res.status });
    } catch {
      // FastAPI returned non-JSON (500 HTML page, etc) — surface the raw text
      return Response.json(
        { detail: `Backend error ${res.status}: ${text.slice(0, 500)}` },
        { status: res.status }
      );
    }
  } catch (e) {
    return Response.json({ detail: `Backend unreachable: ${e}` }, { status: 503 });
  }
}
