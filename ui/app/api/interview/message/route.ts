const DOMAIN_CONTEXT: Record<string, string> = {
  expertise: `Focus: what they work on, their deep skills, what problems they solve best, and what makes their approach distinctive.
Start by asking what they do. Then drill into: specific areas of depth, how they learned it, what they know that others miss, their most non-obvious insight in their field.`,

  decisions: `Focus: how they think through hard choices, the mental models they rely on, how they handle uncertainty and incomplete information.
Start by asking how they make hard decisions. Then drill into: frameworks they use, how they weight trade-offs, what they do when the data is unclear, a decision they got right and why.`,

  beliefs: `Focus: strongly-held opinions, contrarian views, principles they'd defend in a room of skeptics.
Start by asking what they believe that most people in their field disagree with. Then drill into: why they hold that view, what evidence changed their mind, what they used to believe but no longer do.`,

  network: `Focus: the key people in their professional life, what each person represents, how they think about relationships.
Start by asking who they learn from most. Then drill into: who they call when stuck, who challenges them, how they maintain trust, who they'd want in the room for a critical decision.`,
};

function buildSystem(cloneName: string, domain: string): string {
  const ctx = DOMAIN_CONTEXT[domain] ?? DOMAIN_CONTEXT.expertise;
  return `You are extracting knowledge from ${cloneName} through a focused interview.

Domain: ${ctx}

Rules:
- Ask exactly ONE question per response.
- Follow up on what they just said — probe specifics, examples, the "why".
- Questions should be short and direct (one sentence).
- Never summarize, explain, or comment on their answer — just ask the next question.
- After 10 or more exchanges, you may signal the interview is complete by ending your question with the token [DONE].
- Respond ONLY with a JSON object in this exact format:
  {"question": "Your question here", "done": false}
  or when ending:
  {"question": "One last thing — what should your clone always remember about how you work?", "done": true}`;
}

export async function POST(req: Request) {
  const { clone_name, domain, history = [] } = await req.json() as {
    clone_name: string;
    domain: string;
    history: { question: string; answer: string }[];
  };

  // Convert history to Anthropic message format
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of history) {
    messages.push({ role: "assistant", content: JSON.stringify({ question: turn.question, done: false }) });
    messages.push({ role: "user", content: turn.answer });
  }
  // Seed the first turn if no history
  if (messages.length === 0) {
    messages.push({ role: "user", content: "Ready. Ask me your first question." });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: buildSystem(clone_name, domain),
      messages,
    }),
  });

  if (!res.ok) {
    return Response.json({ error: "AI unavailable" }, { status: 500 });
  }

  const data = await res.json();
  const raw: string = data.content?.[0]?.text ?? "";

  // Parse the JSON response, fallback gracefully
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { question: string; done: boolean };
      // Force done after 12 exchanges
      if (history.length >= 12) parsed.done = true;
      return Response.json(parsed);
    }
  } catch {
    // ignore parse error
  }

  // Fallback: treat raw text as question
  return Response.json({ question: raw.trim(), done: history.length >= 12 });
}
