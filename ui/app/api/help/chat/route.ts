const SYSTEM = `You are the doppel product assistant. You help users navigate the app and answer "how do I" questions. Be concise, direct, and always include the exact path to find what they're looking for.

Product map:
- Train your clone: /dashboard/train — connect Gmail, Slack, GitHub, Notion, upload files
- Shape personality: /dashboard/identity — tone, values, expertise areas
- Inspect memory: /dashboard/brain — browse/pin/exclude memory chunks
- Test your clone: /dashboard/test — chat with your clone, check confidence
- Deploy/share: /dashboard/deploy — visibility settings, embed code
- Email drafting: /dashboard/email — AI drafts email replies for review
- Developer API: /dashboard/api — API keys, programmatic access
- Marketplace: /marketplace — browse expert clones, buy per-query
- Credits/billing: /dashboard/billing — buy credits, manage subscription
- Knowledge gaps: /dashboard/brain (Gaps tab) — see what users asked that the clone couldn't answer
- Desktop app: downloadable from /dashboard/deploy

Keep responses under 3 sentences. If the answer requires navigation, say exactly where to go.`;

export async function POST(req: Request) {
  const { message, history = [] } = await req.json();

  const messages = [
    ...history
      .filter((h: { role: string; content: string }) => h.role === "user" || h.role === "assistant")
      .map((h: { role: string; content: string }) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM,
      messages,
    }),
  });

  if (!res.ok) {
    return Response.json({ response: "Sorry, I couldn't process that." }, { status: 500 });
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  return Response.json({ response: text });
}
