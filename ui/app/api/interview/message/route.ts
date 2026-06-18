const DOMAIN_CONTEXT: Record<string, string> = {
  expertise: `You are extracting deep knowledge about what they work on and what makes them distinctive.
Open by asking what they do. Then probe: what's their specific area of depth, what problems do they solve that others can't, what do they know that isn't written anywhere, what's their most non-obvious insight.
Keep drilling — don't move on until you've hit something specific and surprising.`,

  decisions: `You are extracting how they actually think through hard choices.
Open by asking how they make hard decisions. Then probe: what frameworks do they rely on, how do they handle uncertainty, what do they do when data is missing, walk me through a real decision — what were the options, what did you choose and why.
Push for specific examples, not abstract principles.`,

  beliefs: `You are extracting their strongly-held, possibly contrarian views.
Open by asking what they believe that most people in their field get wrong. Then probe: why do they hold that view, what would change their mind, what did they used to believe but no longer do, what's a hill they'd die on.
These should be opinions they'd defend publicly, not safe takes.`,

  network: `You are extracting how they think about key relationships in their professional life.
Open by asking who they learn from most right now. Then probe: who do they call when genuinely stuck, who challenges them in ways that make them better, who would they want in the room for a critical decision and why.
Focus on what each relationship represents to them, not just names.`,
};

const OPENERS: Record<string, string> = {
  expertise: "What do you work on, and what's the part of it that you know better than almost anyone?",
  decisions: "Walk me through the last hard decision you made — what made it hard?",
  beliefs:   "What's something you believe about your field that most people would push back on?",
  network:   "Who do you learn the most from right now, and what specifically do you get from them?",
};

export async function POST(req: Request) {
  const { clone_name, domain, history = [] } = await req.json() as {
    clone_name: string;
    domain: string;
    history: { question: string; answer: string }[];
  };

  const domainCtx = DOMAIN_CONTEXT[domain] ?? DOMAIN_CONTEXT.expertise;

  const system = `You are interviewing ${clone_name} to extract knowledge for their AI clone.

${domainCtx}

Rules:
- Output ONLY the next question. Nothing else — no preamble, no "Great answer!", no commentary, no explanation.
- One sentence. Direct. Specific to what they just said.
- After 10 or more exchanges, prefix your question with [DONE] to signal the interview is complete.
- Never repeat a question you've already asked.`;

  // Build conversation naturally — assistant asks, user answers
  const messages: { role: "user" | "assistant"; content: string }[] = [];

  if (history.length === 0) {
    // First question — no prior answers yet
    messages.push({ role: "user", content: "Start the interview." });
  } else {
    for (const turn of history) {
      messages.push({ role: "assistant", content: turn.question });
      messages.push({ role: "user",      content: turn.answer });
    }
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    // Return hardcoded opener on API failure so the UI never goes blank
    return Response.json({
      question: OPENERS[domain] ?? OPENERS.expertise,
      done: false,
    });
  }

  const data = await res.json();
  const raw: string = (data.content?.[0]?.text ?? "").trim();

  const done = raw.startsWith("[DONE]") || history.length >= 12;
  const question = raw.replace(/^\[DONE\]\s*/i, "").trim()
    || (OPENERS[domain] ?? OPENERS.expertise);

  return Response.json({ question, done });
}
