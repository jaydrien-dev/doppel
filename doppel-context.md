# Doppel — Full Product Context

Use this document to understand Doppel deeply. The founder is looking for go-to-market advice, growth strategy, and first-user acquisition help.

---

## What Doppel Is

**Tagline:** Knowledge shouldn't have a lifespan.

Doppel is an AI platform that lets individuals and teams train a persistent AI "clone" of themselves — a queryable, citable version of their expertise, judgment, and reasoning. Not a chatbot. Not a knowledge base. A clone that answers in your voice, cites its sources, and gets smarter every time someone uses it.

**Core insight:** When a senior engineer, a founding PM, or a sales lead leaves a company, their knowledge leaves with them. Not just the stuff in docs — the judgment, the instincts, the *reasoning behind the reasoning*. Doppel captures that before it's gone.

---

## The Two Markets

### 1. Individuals
People who are the bottleneck for their own knowledge. They spend time answering the same questions, explaining the same decisions, or being pulled into contexts where their judgment is needed. Examples:

- **Consultants** — answer the same strategic questions from different clients. Clone answers with their frameworks while they focus on new work.
- **Engineers** — junior devs pull them into Slack for context they've explained 10 times. Clone surfaces answers from their actual decisions and code reviews.
- **Executives** — their judgment is the bottleneck. They can't be in every room. Clone makes their reasoning process queryable so decisions get made without a meeting.
- **Creators** — audience wants more of them than they can produce. Clone engages, answers, and teaches from everything they've written.

### 2. Teams / Companies
Companies that lose irreplaceable institutional knowledge when employees leave, rotate, or just get too busy to answer questions.

- A founding engineer leaves → their architectural decisions are gone
- A support lead retires → the edge-case instincts from 10,000 tickets are gone  
- A head of sales moves on → the pricing intuition that closed $4M last year is gone

---

## What the Product Actually Does

### Individual Clone
1. **Train** — Connect Gmail, Slack, GitHub, Notion. Upload PDFs, DOCX, XLSX, PPTX, CSVs. Every email, decision, and thread becomes memory.
2. **Identity** — Set communication style, values, areas of expertise. This shapes how the clone sounds.
3. **Brain Inspector** — Browse, pin, or exclude individual memory chunks. Verify what it knows, remove inaccuracies.
4. **Deploy** — Set access mode: Private, Allowlist, Org-scoped, or Public. Embed on any website. Share a `/c/[handle]` chat link.
5. **Email drafting** — Clone drafts replies in your voice. Approve, edit, or reject. Every interaction improves it.
6. **Meeting bot** — Joins Zoom, Meet, Teams meetings. Participates using your knowledge base.
7. **Tasks** — Clone can control keyboard/mouse to complete work tasks, drawing on its knowledge base.
8. **Developer API** — Generate API keys. Call your clone from any app, script, or AI agent.

### Company Brain (Team tier)
Built on top of individual clones:

1. **Role Brains** — Aggregate knowledge across all team member clones into role-based layers (e.g., "Support Lead" brain = all 5 support leads combined). Query the whole role as if it were one mind.
2. **Skills / Agent Prompts** — Extract structured knowledge from role brains into Markdown files: CLAUDE.md (for Claude Code agents), system prompts, or knowledge bases. Drop into any AI agent to ground it in actual company procedures.
3. **Team Knowledge** — New hires can query any team member's clone directly. Mark clones as onboarding resources.
4. **Knowledge Handoff** — When someone is leaving, trigger a full handoff capture. Generates a structured report: key decisions, key contacts, processes owned, successor notes. Clone preserved indefinitely.
5. **Org workspace** — Invite members, manage roles, cross-clone search across whole company.
6. **Goals & Feed** — OKRs injected as context into Company Brain queries. Intelligence feed showing signals across the team.
7. **Alerts** — Drift detection: fires when team behavior diverges from stated goals, knowledge gaps appear, or escalation rates spike.

---

## Technical Architecture

- **Backend:** Python / FastAPI, hosted on Railway
- **Frontend:** Next.js (App Router), hosted on Vercel
- **Database:** PostgreSQL (managed)
- **Auth:** Clerk (user management + JWT)
- **AI:** Anthropic Claude (claude-sonnet-4-6) for reasoning + generation; OpenAI embeddings for memory retrieval
- **Memory system:** 4 layers — episodic (events/experiences), semantic (facts), procedural (how-to), identity (personality/values)
- **Brain:** Dual-process reasoning — fast (direct retrieval) + slow (full chain-of-thought reasoning with self-check). Confidence scoring + source citations on every response.
- **Connectors built:** Gmail (OAuth + ingestion), Slack (OAuth + bot + event handler), GitHub (planned), Notion (planned)
- **Deployment:** Vercel (frontend at `doppel-pi.vercel.app`) + Railway (backend FastAPI)

---

## Pricing

| Plan | Price | Target |
|------|-------|--------|
| **Free** | $0 | Individual — 1 clone, 50 queries/month, all connectors, public link |
| **Personal** | $15/mo | Individual — 250 queries, email drafts, meeting bot, handoff report, API access |
| **Enterprise Pro** | $59/seat/mo | Team — Company Brain, role brains, team knowledge, skills API, SSO/SCIM, audit log |
| **Enterprise Max** | $179/seat/mo | Full org intelligence — org feed, drift detection, AI spec generator, SOC 2 |

Annual billing available (10× monthly price = 2 months free).

---

## What's Built (Production-Ready)

- Full individual clone pipeline (train → brain → deploy → chat)
- 4-layer memory architecture with vector search
- Dual-process brain with confidence scoring + source provenance
- Gmail ingestion (OAuth, token refresh, message sync)
- Slack bot (OAuth, event handler, Block Kit responses)
- File upload (PDF, DOCX, XLSX, PPTX, CSV, TXT, MD)
- Clone chat page (`/c/[handle]`) — branded, access-controlled
- Access control: private / allowlist / org-scoped / public
- Email triage dashboard (drafts, approve/reject)
- Meeting bot integration
- Company Brain: role brains + knowledge extraction + skills generation
- Developer API (v1 REST endpoint, API key management)
- Org workspace (invite, members, cross-clone search)
- 4-step onboarding wizard
- Landing page (full marketing site with pricing)
- Admin: rate limiting, PII redaction, prompt injection defense

---

## Stage / Status

- **Private beta** — live product, working end-to-end
- **Founder:** Solo founder (Jaydrien), building toward YC application
- **Users:** Zero paying users currently — looking for first users
- **URL:** `doppel-pi.vercel.app`

---

## Key Differentiators

1. **Cites its sources** — every response shows which emails, docs, Slack threads it drew from. Not a black box.
2. **Confidence scoring** — explicit confidence level on every answer. Knows when it doesn't know.
3. **Compounding** — individual clones → role brains → company brain. Value grows with org size.
4. **Knowledge handoff** — the only product specifically designed for preserving knowledge *before* someone leaves. This is the hook for enterprise.
5. **Agent-ready** — generates CLAUDE.md and system prompts directly from role brain knowledge. The only way to ground AI agents in your company's actual procedures.

---

## Narrative / Positioning

The product is positioned around a single emotional truth: **knowledge shouldn't die when people leave.**

- For individuals: "You are the bottleneck. You don't have to be."
- For teams: "When they leave, it doesn't have to go with them."
- Tagline: "Knowledge shouldn't have a lifespan."

The demo scenario that resonates most: *"The founding engineer left in November. By January, new hires were asking her Doppel clone architecture questions — and getting cited answers from her actual design docs."*

---

## Context for GTM Advice

- Solo founder, technical, no GTM background
- Product is live, functional, and polished
- Free tier exists (no credit card needed) — low friction to sign up
- B2C individual tier → natural upgrade path to B2B team tier
- The knowledge handoff feature is the highest-value, most differentiated hook for enterprise
- No paying users yet — need first 10-100 users to validate retention and find ICP
- YC application is a near-term goal — needs growth signal

---

*Generated from codebase + product context. May 2026.*
