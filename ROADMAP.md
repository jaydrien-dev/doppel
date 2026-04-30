# Doppel — Product Roadmap

> **Vision:** Knowledge shouldn't have a lifespan.

---

## The Framing

Every company leaks knowledge constantly. Not the stuff that's written down — the stuff that never is.

The judgment call a senior engineer makes at 2am during an incident. The way your best support lead knows which customers to bend the rules for. The pricing instinct your head of sales built over eight years of deals. The institutional memory your founders carry about why things were built the way they were.

None of that is in any document. It lives in people. And when those people leave — it's gone.

This happens at every company, all the time. The average knowledge worker leaves 4–5 employers in a decade. Every departure takes irreplaceable knowledge with it. Companies try to compensate with documentation, onboarding, and "knowledge management" tools — but those capture artifacts, not judgment.

> **Knowledge shouldn't have a lifespan. It should compound.**

That's what Doppel is built to do.

### What Doppel Does

Doppel captures the valuable thoughts, decisions, and skills of your employees — especially the things that aren't on paper — and preserves them permanently as a living, queryable company brain.

```
A senior engineer leaves after 6 years.
Without Doppel:  Their architecture reasoning, debugging instincts, and
                 context on every major decision disappears on their last day.

With Doppel:     Their brain stays. New engineers query it.
                 "Why did we choose this approach in 2022?"
                 → Their answer, in their voice, citing their actual emails and docs.
                 The knowledge didn't leave. It compounded.
```

That's the individual brain. Then it compounds further:

```
Role brain:  All five engineers' knowledge aggregates.
             "How does our team handle a production incident?"
             → A structured, executable procedure drawn from every postmortem,
               every Slack thread, every runbook — distilled and kept current.

Skills API:  AI agents call it before acting.
             Company knowledge doesn't just help humans anymore —
             it makes AI automation actually reliable.
```

### The Compounding Effect

The longer a company uses Doppel, the more powerful it becomes:

```
Year 1:  Sarah's brain is captured. She answers questions asynchronously.
Year 2:  Sarah leaves. Her brain stays. New hires query it on day one.
Year 3:  Three more experts added. Their knowledge merges with Sarah's.
         The company brain is richer than any one person's knowledge.
Year 5:  AI agents use the skills file to automate decisions that used to
         require the senior people to weigh in. The company scales without
         losing institutional memory.
```

This is why we call it compounding. Every brain added, every question answered, every correction made — it makes the whole system smarter. The knowledge doesn't evaporate with turnover. It accumulates.

### The Product in One Sentence

> Doppel captures the unwritten knowledge and judgment of your best people, preserves it permanently, and makes it queryable by your team and your AI agents — so that knowledge compounds instead of disappearing.

### Why Now

```
Knowledge has always been lost at employee departure. That's not new.
What changed:

1. AI agents are now making real decisions at companies — and they need
   company-specific knowledge to do it correctly. The cost of lost knowledge
   just got much higher.

2. Every company is trying to automate with AI. The bottleneck isn't the model.
   Models are capable. The bottleneck is that no AI agent knows how THIS company
   works — what the procedures are, what the exceptions are, who to escalate to.
   That knowledge lives in people. Doppel structures it and makes it callable.

3. The tools to capture and structure this knowledge — LLMs good enough to
   extract judgment from emails and docs, vector memory to make it retrievable,
   semantic search to surface it in context — only exist now.
```

The window is open. Every company that deploys AI automation is about to discover they're blocked by domain knowledge. Doppel is the answer.

---

## What's Already Built

Brain core, dual-process reasoning, 4-layer memory (episodic, semantic, procedural, relational), identity layer, metacognition, streaming responses, confidence indicators, provenance/source citations.

Ingestion: Gmail OAuth, GitHub, Notion, text upload, style extractor.

Surfaces: Streaming chat, Slack bot (OAuth + events + Block Kit), email drafts, meeting bot, shareable clone links, embed widget.

Dashboard: Train, Brain inspector (node graph + timeline + topic coverage), Test (coach mode), Deploy (access control + allowlist + org-scoped), Activity (quality metrics + CSV export), Proposals, Impact metrics.

Enterprise: Org workspace (members, cross-clone search, invites), developer API (key generation, authenticated v1 endpoints), admin policies (topic blocks, escalation threshold, human review gate), access audit log, GDPR export/delete, rate limiting, PII redaction, prompt injection defense, SCIM, SSO stub, RBAC, audit webhooks.

---

## Table of Contents

### Product Roadmap
1. [Phase 0 — Foundation ✅](#1-phase-0--foundation-complete)
2. [Phase 1 — Knowledge Retention Platform](#2-phase-1--knowledge-retention-platform)
3. [Phase 2 — Distribution & Trust](#3-phase-2--distribution--trust)
4. [Phase 3 — Company Brain](#4-phase-3--company-brain)
5. [Phase 4 — Skills API & Agent Integration](#5-phase-4--skills-api--agent-integration)
6. [Phase 5 — Knowledge Marketplace](#6-phase-5--knowledge-marketplace)

### Strategic Reference
7. [Target Verticals](#7-target-verticals)
8. [Pricing Model](#8-pricing-model)
9. [Competitive Moat](#9-competitive-moat)

### Technical Reference
10. [Core Architecture](#10-core-architecture)
11. [Technical Deep Dives](#11-technical-deep-dives)
12. [API & Integration Surface](#12-api--integration-surface)
13. [Security & Privacy Architecture](#13-security--privacy-architecture)
14. [Infrastructure & DevOps](#14-infrastructure--devops)
15. [Metrics & Observability](#15-metrics--observability)
16. [YC Pitch Technical Narrative](#16-yc-pitch-technical-narrative)

---

## 1. Phase 0 — Foundation ✅ Complete

**Built:**
- Brain core: dual-process reasoning engine (fast/slow path), multi-layer memory (episodic, semantic, procedural, relational), identity layer, metacognition
- Ingestion pipeline: Gmail OAuth, GitHub, Notion, email preprocessor, chunker, batch embedder, style extractor, PII redactor
- FastAPI backend: brain chat (streaming + non-streaming), feedback, ingestion, proposals, impact metrics
- Postgres schema: all memory tables + reasoning traces + job tracking + audit log + proposals
- Clone chatbot: streaming chat, shareable link, embed widget, public/allowlist/private/org-scoped modes
- Owner dashboard: Train (all connectors), Brain (node graph + timeline + test-a-belief), Test (owner + coach mode), Deploy, Activity (quality metrics + CSV export), Email drafts, Meetings, Settings, Proposals, Impact
- Org workspace: team clone browser, cross-clone semantic search, org knowledge graph
- Developer API: key generation, v1 authenticated endpoints, full docs
- Advanced Identity: 4-layer identity editor (Style, Epistemic, Values, Relational)
- Security: rate limiting, access control (private/allowlist/org-scoped/public), prompt injection defense, jailbreak detection, access audit log
- Enterprise: GDPR export/delete, SCIM provisioning, SSO config stub, RBAC per clone, audit webhook streaming

**Proven:** A brain trained on emails and docs reasons through questions in the person's style and voice, with confidence indicators and source citations.

---

## 2. Phase 1 — Knowledge Retention Platform

**Goal:** Land 3–5 B2B design partners. Each deploys Doppel for 5–50 employees. Target: $20k MRR from companies.

### 2.1 The Core Product

The clone IS the product. The reason to buy:

```
B2C framing (weak):  "Share your AI clone with anyone"
B2B framing (strong): "When Sarah leaves, her 8 years of product judgment don't go with her"
```

**The deployment that matters most:**
- `company.doppel.ai/[name]` — internal clone, org-scoped access
- NOT public — private by default, org-only
- Queryable by any teammate, not just the owner

### 2.2 Confidence Indicators & Provenance — P0 Trust Features

Every response must include:

```
"Based on Sarah's emails from March–June 2022 and her Q3 planning doc —
 I'm about 80% confident in this. Verify with Sarah directly for anything
 that touches the payment vendor contract."

Sources used:
  ↳ "email to CTO, 2022-03-14" (91% match)
  ↳ "Q3 planning doc, 2022-08-01" (87% match)
  ↳ "Slack thread #payments, 2021-11-09" (74% match)
```

**Confidence thresholds:**
```
≥0.80 → respond normally, cite sources (green)
0.60–0.79 → respond with hedge, cite sources (amber)
<0.60 → escalate: "ask [Name] directly" (red)
```

### 2.3 Onboarding Reframe — "Knowledge Capture" Flow

New B2B flow:
```
HR admin sets up org workspace
  → Invites employees
  → Each employee: connect Gmail/Slack → answer 20 core knowledge questions → clone "certified"
  → Exit interview mode: departing employee does 2hr deep-dive, clone preserved (read-only)
```

### 2.4 Monetization — B2B First

| Tier | Price | For |
|------|-------|-----|
| **Starter** | $99/mo | Up to 5 clones, 1 workspace |
| **Team** | $49/seat/mo (min 5) | 5–50 clones, org search, Slack bot |
| **Enterprise** | $39/seat/mo (min 50) | SSO, compliance, SCIM, dedicated support |
| **Individual** | $29/mo | 1 clone, personal use |

---

## 3. Phase 2 — Distribution & Trust

**Goal:** $100k MRR. Solve distribution (Slack-native) and trust (confidence + provenance everywhere).

### 3.1 Slack-Native — The Killer Distribution Channel

```
@doppel ask @sarah-clone: why did we choose Postgres over DynamoDB in 2021?

→ Sarah's clone responds in the channel with:
   - The actual reasoning in her voice
   - Sources: email to CTO (Oct 2021), Slack #infra-decisions (Nov 2021)
   - Confidence: 88% · Ask Sarah directly for new architecture decisions
```

**Why Slack is THE distribution channel:**
- Every query is visible to the whole channel → passive product discovery
- Each `@clone` mention is a referral to everyone who sees it
- No new tool adoption — Doppel lives where work happens

### 3.2 Multi-Source Ingestion

| Source | Signal | Status |
|--------|--------|--------|
| Gmail | Communication style, relationships | ✅ Built |
| GitHub commits & PRs | Technical reasoning, code review judgment | ✅ Built |
| Notion | Documentation, decisions, plans | ✅ Built |
| Slack (full history) | Day-to-day judgment, async decisions | Bot built, full history ingestion next |
| Zoom transcripts | Meeting reasoning (opt-in) | Via Recall.ai |
| Google Drive | Long-form thinking | Phase 3 |
| JIRA / Linear tickets | Project decisions, tradeoffs | Phase 3 |
| Confluence | Team documentation | Phase 3 |

### 3.3 Meeting Bot — Knowledge in the Room

```
"@Sarah-clone, what was our position on the Acme contract terms?"
→ Clone answers in meeting chat with confidence + source date
→ Never speaks autonomously — responds when called
```

### 3.4 Email Drafting — Institutional Voice

```
Junior consultant drafts in style of senior partner.
New hire gets "house style" from veteran clones.
Customer success rep drafts in voice of account exec.
```

---

## 4. Phase 3 — Company Brain

**Goal:** $500k MRR. The product evolves from individual person clones into a company-level knowledge layer.

### 4.1 Role Brains

Beyond cloning individuals — capture how **roles** work.

```
Person brain:  "How would Sarah answer this?"
Role brain:    "How does our support team handle Category C refunds?"
               "How does our engineering team do incident response?"
               "What is the standard approach to pricing exceptions?"
```

Role brains are built from:
- Aggregating the episodic memory of everyone in a role
- Ingesting role-specific procedures, runbooks, and policy docs
- Structured seed Q&A per role ("what are the top 10 decisions a support lead makes?")

**Technical implementation:**
```sql
CREATE TABLE role_brains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    role_name TEXT NOT NULL,           -- "support_lead", "incident_commander"
    member_clone_ids UUID[],           -- clones that contribute to this role brain
    knowledge_summary JSONB,           -- structured role knowledge
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 Process Knowledge Extraction

The brain learns company procedures explicitly, not just implicitly.

For each role brain, extract:
```
{
  "decision_procedures": [
    {
      "trigger": "customer requests refund",
      "steps": ["check order date", "check product category", "check VIP status"],
      "rules": [
        "< 30 days: auto-approve",
        "30–90 days: escalate to support lead",
        "> 90 days: deny unless defective"
      ],
      "exceptions": ["VIP accounts get +30 days", "Category C always flags for fraud review"],
      "confidence": 0.91,
      "sources": ["support policy v3", "slack #support-decisions (200 messages)"]
    }
  ],
  "escalation_paths": {...},
  "common_mistakes": {...}
}
```

This is extracted via a structured LLM pass over aggregated episodic memory + policy docs.

### 4.3 Knowledge Currency — Keeping It Fresh

Company procedures change. The company brain must reflect that.

```
Freshness signals:
  ├── Source timestamp: how old is the underlying content?
  ├── Correction rate: are users editing clone answers about this topic?
  ├── Explicit "outdated" flags: teammates can mark knowledge as stale
  └── Scheduled re-extraction: weekly pass over new Slack threads, policy updates

When a procedure changes:
  → Ingest the new doc / thread
  → Re-extract affected decision procedures
  → Version the change (old procedure accessible for historical queries)
  → Notify relevant role brain owners
```

### 4.4 Enterprise Auth & Compliance (Phase 3 continuation)

Already built in Phase 0:
- SSO / SAML (stub → active)
- SCIM provisioning
- RBAC per clone
- Data residency (EU / US isolation)
- Legal hold + clone preservation
- SOC 2 Type II (process, not product)
- On-prem deploy option

---

## 5. Phase 4 — Skills API & Agent Integration

**Goal:** Become the knowledge layer that AI agents call. This is the $10B opportunity.

### 5.1 The Skills File

The company brain is exposed as a structured, executable skills file — a catalog of everything the company knows how to do.

```json
{
  "skills": [
    {
      "id": "handle_refund",
      "name": "Handle customer refund request",
      "trigger_context": ["refund", "return", "money back", "charge dispute"],
      "inputs_required": ["order_id", "customer_tier", "product_category", "days_since_purchase"],
      "procedure": {
        "steps": [...],
        "decision_rules": [...],
        "exception_handlers": [...]
      },
      "confidence": 0.91,
      "sources": 47,
      "last_verified": "2026-03-15",
      "owner": "support_lead_clone"
    },
    {
      "id": "respond_to_p0_incident",
      "name": "P0 incident response",
      ...
    }
  ]
}
```

### 5.2 Agent Query API

AI agents get a clean API to query the company brain before acting:

```http
# Get the full skills catalog
GET /v1/org/{org_id}/skills
→ List of all structured procedures with confidence + freshness

# Get a specific skill
GET /v1/org/{org_id}/skills/{skill_id}
→ Full decision procedure with rules, exceptions, sources

# Query the brain with a situation
POST /v1/org/{org_id}/query
{
  "situation": "Customer has a $2,400 order from 45 days ago and wants a refund. They are a VIP.",
  "context": {...}
}
→ {
    "recommendation": "Approve — VIP exception extends window to 90 days",
    "confidence": 0.94,
    "procedure_applied": "handle_refund",
    "sources": [...],
    "escalate_if": "Order contains Category C items"
  }

# Validate an action before executing it
POST /v1/org/{org_id}/validate
{
  "proposed_action": "approve_refund",
  "context": {...}
}
→ { "safe_to_proceed": true, "confidence": 0.92, "notes": [...] }
```

### 5.3 Agent Framework Integrations

The skills API is a tool that plugs into any agent framework:

```python
# LangChain / LangGraph
tools = DoppelToolkit(org_id="...", api_key="...")
agent = create_react_agent(llm, tools.get_tools())

# Anthropic tool use
tools = [doppel.get_tool("query_company_brain")]
response = anthropic.messages.create(model="...", tools=tools, ...)

# OpenAI function calling
functions = doppel.get_openai_functions(org_id="...")
```

**What Doppel provides as an agent tool:**
- `query_company_procedure(situation, context)` → decision + confidence + sources
- `get_company_policy(topic)` → structured policy with exceptions
- `validate_action(proposed_action, context)` → safety check before execution
- `get_escalation_path(situation)` → who to involve and why

### 5.4 The Virtuous Loop

```
Company uses Doppel for human knowledge queries
  → Same knowledge gets structured into skills file
  → AI agents use skills file to automate routine work
  → Agents' decisions create new episodic data
  → Brain learns from outcomes + corrections
  → Skills become more accurate and complete
  → Company can automate more
  → Doppel becomes more irreplaceable
```

### 5.5 Why This Is the Right Timing

```
2023: Models got good enough to reason
2024: Agents got good enough to take actions
2025: Companies started actually deploying agents at scale
2026: The bottleneck is domain knowledge — agents fail because they don't know
      how THIS company works

Doppel solves the 2026 problem.
```

### 5.6 Pricing for Agent Usage

Agent API calls are metered differently from human queries:

| Tier | Human Queries | Agent Queries | Skills Exports |
|------|-------------|--------------|----------------|
| **Team** | Included | 5k/mo | — |
| **Enterprise** | Included | 50k/mo | JSON/OpenAPI |
| **Platform** | Included | Unlimited | All formats + webhooks |

**Platform tier** (new): for companies running AI automation at scale. $15k–$50k/mo.

---

## 6. Phase 5 — Knowledge Marketplace

**Goal:** Domain expert knowledge as licensable assets for AI agent teams.

```
Knowledge Marketplace:
  ├── Not personal chatbots — licensed professional procedures
  ├── Categories: Regulatory compliance, Financial decisions, Engineering patterns
  ├── Access models:
  │     ├── Per-query: $2–5/query (agent or human)
  │     ├── Monthly license: $99–499/mo per skill set
  │     └── Org integration: unlimited for team + agents
  └── Creator revenue share: 70%

Examples:
  - "Refund handling procedures from 50,000 resolved support tickets"
  - "Incident response runbooks from 200 P0 postmortems"
  - "M&A due diligence checklist from 20 years of dealflow"
  - "FDA submission review judgment from 15 years of regulatory work"
```

---

## 7. Target Verticals

### Tier 1 — Highest Pain, Fastest Conversion

**Professional Services (consulting, law, finance)**
- Expertise IS the product — when a partner leaves, billable hours walk out the door
- Existing knowledge management captures documents, not judgment or procedure
- Price sensitivity: low ($500/hr billing rate, $49/seat is rounding error)
- The skills file makes junior staff 3x more effective → immediate, measurable ROI

**SaaS Engineering Teams**
- Technical tribal knowledge is impossibly expensive to lose
- "Why was this built this way?" → most expensive question in engineering
- Slack-native distribution: engineers already live there
- Skills API: engineering agents can query incident runbooks, architecture decisions, code review judgment before acting

### Tier 2 — High Pain, Compliance Complexity

**Regulated Industries (healthcare, defense, finance)**
- Documentation requirements already exist — Doppel makes them executable
- Knowledge loss is a compliance risk, not just a productivity one
- The skills file creates an auditable record of how decisions were made
- Requires: on-prem deploy, SOC 2, data residency, legal hold

### Tier 3 — Longer Cycle, Highest ACV

**Enterprise (Fortune 500)**
- Procurement: 6–12 month sales cycle, but $500k–$2M ACV at scale
- Key driver: AI agent budget. Companies spending $5M/yr on AI automation need the knowledge layer.
- Doppel becomes a line item in the AI infrastructure budget, not the HR budget

---

## 8. Pricing Model

### B2B (Primary)

| Tier | Price | Seats | Key Features |
|------|-------|-------|-------------|
| **Starter** | $99/mo flat | Up to 5 | 5 clones, 1 workspace, Slack bot |
| **Team** | $49/seat/mo | 5–50 | Org search, cross-clone queries, audit log, API access, 5k agent queries/mo |
| **Enterprise** | $39/seat/mo | 50+ | SSO, SCIM, on-prem, SLA, dedicated CSM, 50k agent queries/mo |
| **Platform** | $15k–$50k/mo | Unlimited | Unlimited agent queries, skills API, OpenAPI export, agent integrations |

### Individual (Secondary — Inbound / PLG)

| Tier | Price | Features |
|------|-------|---------|
| **Free** | $0 | 1 clone, 100 queries/mo |
| **Pro** | $29/mo | Unlimited queries, custom handle, API access |
| **Creator** | $79/mo | Embed widget, advanced analytics |

### Unit Economics

```
50-seat Team deal:     $49 × 50 = $2,450/mo = $29,400 ACV
200-seat Enterprise:   $39 × 200 = $7,800/mo = $93,600 ACV
Platform deal:         $25,000/mo = $300,000 ACV (1 Platform deal > 10 Enterprise)
Target: 50 Team + 10 Enterprise + 2 Platform = $3.5M ARR
```

---

## 9. Competitive Moat

### 9.1 Why Doppel Wins

| Competitor | Category | Why Doppel Wins |
|-----------|----------|-----------------|
| Guru / Confluence / Notion | Knowledge management | They store documents. Doppel stores *judgment and procedure*. |
| Glean / Coveo | Enterprise search | They find documents. Doppel answers as a person AND exposes skills to agents. |
| Personal.ai | Personal memory | No org features, no B2B, no agent API |
| ChatGPT Enterprise | Generic AI | Generic knowledge, not company-specific procedure |
| Lindy.ai / Zapier AI | Workflow automation | They automate tasks. Doppel gives agents the knowledge to do tasks correctly. |
| LangChain / LlamaIndex | Agent frameworks | They build the agent. Doppel is the knowledge layer the agent calls. |
| Vertex AI / Bedrock | Foundation models | They provide the model. Doppel provides the company-specific context the model needs. |

**The key distinction:** Every AI agent platform needs domain knowledge to work. None of them provide it. Doppel does.

### 9.2 What Is Hard to Copy

1. **Knowledge depth** — requires months of ingestion, correction, and verification per company
2. **Data moat** — every query and correction makes the brain more accurate; the longer a company uses Doppel, the more irreplaceable it becomes
3. **Trust** — employees share their most sensitive reasoning; trust is earned over months and years
4. **Org network effects** — once 10 individual brains aggregate into a company brain, the knowledge compounds non-linearly
5. **Skills accuracy** — a skills file is only as good as the underlying knowledge; accuracy comes from volume of real company data + human corrections
6. **Exit interview lock-in** — once a company uses Doppel for offboarding, the preserved knowledge is too valuable to lose

### 9.3 The Flywheel

```
Individual clones → team queries → good answers → more clones added
  → org knowledge graph grows → company brain emerges
  → skills file extracted → AI agents start using it
  → agent decisions create new episodic data → brain improves
  → company automates more → can't stop using Doppel
  → new employees onboard via brain → brain grows further
  → Doppel is the operating system for the company's AI
```

---

## 10. Core Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              DOPPEL PLATFORM                               │
│                                                                            │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │    INGESTION     │    │  COMPANY BRAIN   │    │   CONSUMPTION        │  │
│  │    PIPELINE      │───▶│  (Knowledge      │───▶│   SURFACES           │  │
│  └──────────────────┘    │   Repository)    │    └──────────────────────┘  │
│                          └──────────────────┘                              │
│  Per-person sources:         Individual brains     Human surfaces:         │
│  • Gmail / Slack             Role brains           → Slack @clone          │
│  • GitHub / Notion           Company brain         → Web chat              │
│  • Uploaded files            Skills file           → Email drafts          │
│  • Seed Q&A                                        → Meeting bot           │
│  • Exit interview            Process knowledge                             │
│  • Corrections               Decision procedures   Agent surfaces:         │
│                              Escalation paths      → Skills API            │
│                                                    → Agent tool calls      │
│                                                    → Validate-before-act   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Knowledge Hierarchy

```
Level 1: Individual brain
  → How Sarah thinks, decides, and writes
  → Source: her emails, Slack, docs, seed Q&A

Level 2: Role brain
  → How the support team handles refunds
  → Source: all support leads' individual brains + policy docs + ticket history

Level 3: Company brain
  → How this company operates across all functions
  → Source: all role brains + cross-functional decisions + company-wide docs

Level 4: Skills file
  → Executable procedures extracted from the company brain
  → Format: structured JSON, OpenAPI tool spec, LangChain tool
  → Consumer: AI agents
```

### Four-Layer Memory (per individual brain)

```
Layer 1: EPISODIC MEMORY
  └─ pgvector — raw experiences: emails, decisions, Slack, docs
     Chunked, embedded, retrievable by semantic similarity

Layer 2: SEMANTIC + PROCEDURAL MEMORY
  └─ Structured knowledge: domain facts, decision heuristics, communication norms

Layer 3: IDENTITY CORE
  └─ StyleFingerprint + ValueSystem + EpistemicProfile + PersonaBoundaries
     Injected into every LLM call

Layer 4: RELATIONAL CONTEXT
  └─ Per-contact communication adjustments
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **LLM** | Claude API (sonnet-4-6 reasoning, haiku-4-5 classification) | Best instruction following + reasoning fidelity |
| **Vector DB** | pgvector (Postgres) → Pinecone at scale | No extra infra early; purpose-built at scale |
| **Backend** | FastAPI (Python) | ML ecosystem, async, typed |
| **Frontend** | Next.js (App Router) | SSR, streaming, RSC |
| **Realtime** | Server-Sent Events → WebSockets | Streaming clone responses |
| **Auth** | Clerk | User auth + OAuth connector management |
| **Session/Cache** | Redis | Working memory, job tracking, rate limits |
| **Embeddings** | OpenAI text-embedding-3-small | 1536-dim, cheap, fast |
| **Infra** | AWS ECS Fargate → EKS | Scales with usage |
| **Observability** | Langfuse + Datadog | LLM tracing, cost per clone, quality score |

---

## 11. Technical Deep Dives

### 11.1 Making It Sound Like Them

```
Now: Prompt engineering
  → Style fingerprint + few-shot examples injected into every call
  → ~60% style fidelity

Phase 2: LoRA fine-tuning
  → Per-user LoRA adapter trained on (prompt, response) pairs
  → ~80% style fidelity on blind human eval
  → A10G GPU, <30 min per user, ~50MB per adapter

Phase 3: DPO from corrections
  → Every edit → (rejected, preferred) pair
  → Periodic DPO batches tighten style continuously
```

### 11.2 Skills File Extraction

The skills file is extracted from aggregated procedural memory via a structured LLM pass:

```python
async def extract_skills(org_id: UUID, role_name: str) -> SkillsFile:
    # Pull all procedural memories for this role
    procedures = await get_role_procedural_memory(org_id, role_name)
    policy_docs = await get_policy_documents(org_id, role_name)
    decision_history = await get_decision_history(org_id, role_name)
    
    # Structured extraction
    raw = await llm.extract(
        prompt=SKILLS_EXTRACTION_PROMPT,
        content=render_for_extraction(procedures, policy_docs, decision_history),
        output_schema=SkillsFile.schema()
    )
    
    # Validate + confidence score each skill
    skills = [validate_skill(s, procedures) for s in raw.skills]
    return SkillsFile(org_id=org_id, role=role_name, skills=skills)
```

### 11.3 Confidence Calibration & Source Citation

Every response (human or agent) includes:

```python
BrainOutput:
  response: str              # the answer
  confidence: float          # 0.0–1.0
  sources: List[MemorySource]  # ranked by similarity
  needs_escalation: bool     # true if confidence < threshold

MemorySource:
  content: str               # exact chunk used
  source: str                # gmail | slack | notion | github | upload
  similarity: float          # cosine similarity score
  created_at: str            # original date
```

**Confidence thresholds:**
```
≥0.80 → respond normally (green)
0.60–0.79 → respond with hedge (amber)
<0.60 → escalate to human (red)
```

### 11.4 Preventing Hallucination

```
Every response passes through:
1. Groundedness check — factual claims must trace to source
2. Persona boundary enforcement — no financial/legal commitments
3. Confidence gate — below threshold → escalate
4. Contradiction check — against prior session responses
5. Prompt injection defense — reject jailbreak/injection attempts
6. Self-check — system prompt leakage detection
```

---

## 12. API & Integration Surface

### 12.1 Core Endpoints (Built ✅)

```http
POST   /brain/chat                       # query clone (non-streaming)
POST   /brain/chat/stream                # query clone (SSE streaming)
GET    /brain/impact                     # hours saved, queries answered, etc.

GET    /clones/me                        # owner's clone
POST   /clones                           # create clone
PATCH  /clones/{handle}                  # update settings
GET    /clones/{handle}                  # public info

GET    /brain/activity                   # reasoning traces
GET    /brain/memories                   # searchable memory inspector
GET    /brain/graph                      # node graph data
GET    /brain/topics                     # topic coverage + knowledge gaps

POST   /ingestion/gmail/sync             # ingest Gmail
POST   /ingestion/github/sync            # ingest GitHub
POST   /ingestion/notion/sync            # ingest Notion
POST   /ingestion/text                   # paste text
POST   /ingestion/extract-style          # recompute style fingerprint

GET    /identity                         # all 4 identity layers
PATCH  /identity                         # update a layer

POST   /org                              # create org workspace
GET    /org/members                      # list members + clones
POST   /org/invite                       # invite by email
POST   /org/search                       # cross-clone semantic search

GET    /developer/keys                   # list API keys
POST   /developer/keys                   # generate key

GET    /proposals                        # workflow proposals
POST   /proposals/generate-code-review   # AI-generated code review proposals
PATCH  /proposals/{id}                   # approve/dismiss

GET    /admin/audit-log                  # access audit log (owner only)
```

### 12.2 Slack Integration (Built ✅)

```http
GET  /slack/oauth-url                    # install flow
GET  /slack/callback                     # OAuth callback
POST /slack/events                       # handle app_mention, message.im
```

### 12.3 Agent API (Phase 4 — Planned)

```http
GET  /v1/org/{id}/skills                 # full skills catalog
GET  /v1/org/{id}/skills/{skill_id}      # specific skill with procedure
POST /v1/org/{id}/query                  # query company brain with situation
POST /v1/org/{id}/validate               # validate proposed action
GET  /v1/org/{id}/skills.openapi.json    # OpenAPI tool spec for agent frameworks
```

---

## 13. Security & Privacy Architecture

### 13.1 Data Isolation

```
Per-user encryption: DEK per clone → encrypted with AWS KMS KEK
At-rest: AES-256 (RDS, S3) · In-transit: TLS 1.3
Cross-tenant isolation: row-level security on every table, JWT claims enforce ownership
Org-level isolation: cross-clone search only within org workspace
```

### 13.2 User Controls

```
Individual:
  ├── Download all data (GDPR Art. 20) ✅
  ├── Delete all data — cascades to vectors (GDPR Art. 17) ✅
  ├── See everything in their brain ✅
  ├── Exclude: date ranges, specific people, topics
  ├── Pause ingestion
  └── Revoke OAuth per source

Enterprise admin:
  ├── Set knowledge scope per clone ✅
  ├── Configure who can query which clones ✅
  ├── Export full audit log ✅
  ├── Legal hold: freeze clone state ✅
  └── Data retention policy ✅
```

### 13.3 Agent Safety

The agent API adds additional safety layers:
```
├── All agent queries logged to audit trail
├── Confidence floor enforcement — agents can't act on low-confidence knowledge
├── Validation endpoint — agent must validate action before executing
├── Rate limits per org on agent API calls
└── Human escalation triggers automatically forwarded to org admin
```

---

## 14. Infrastructure & DevOps

### 14.1 By Phase

**Phase 0–2 (now):**
```
Docker Compose (local dev)
AWS ECS Fargate (API + workers)
RDS Postgres + pgvector · ElastiCache Redis · S3
```

**Phase 3+ (scale):**
```
EKS (Kubernetes)
Pinecone (vector at scale) · Aurora Postgres
SQS + SNS (fan-out ingestion) · EC2 G5 (GPU for LoRA)
Multi-region (US + EU for data residency)
```

### 14.2 Cost Model

| Component | 10 clones | 100 clones | 1,000 clones |
|-----------|-----------|------------|--------------|
| Claude API | ~$200/mo | ~$2k/mo | ~$18k/mo |
| GPU (training) | ~$100/mo | ~$800/mo | ~$6k/mo |
| Infrastructure | ~$300/mo | ~$1.5k/mo | ~$8k/mo |
| **Total COGS** | **~$600/mo** | **~$4.5k/mo** | **~$34k/mo** |
| **Revenue (Team)** | **~$2.5k/mo** | **~$25k/mo** | **~$245k/mo** |
| **Gross Margin** | **76%** | **82%** | **86%** |

---

## 15. Metrics & Observability

### 15.1 North Star Metrics

```
Knowledge Quality:
  Style fidelity → target 75%+ (blind human eval)
  Correction rate → target <15%
  Groundedness → % responses with cited sources → target 90%+

Skills Accuracy:
  Agent query success rate → % where agent took the right action
  Skills confidence score → average confidence across skills file
  Freshness score → % of skills updated in last 30 days

Activation:
  % of org members who query a clone in first 7 days → target 60%+
  % of AI agent deployments that call Doppel in first 30 days → target 80%+

Retention (M3):
  % of orgs with weekly active clone queries → target 70%+
  % of orgs with weekly active agent API calls → target 50%+ (Phase 4)

Expansion:
  Seats added months 3–6 vs initial → target 40%
  Net revenue retention → target >120%
```

### 15.2 Technical Observability

```
LLM Observability (Langfuse):
  - Trace every inference: prompt, response, latency, cost, path taken
  - Tag by surface: slack | chat | email_draft | meeting | agent_api
  - Alert: p99 latency > 3s, error rate > 0.5%

Knowledge Quality:
  - Auto-eval on 5% of queries daily
  - Per-clone quality dashboard for org admins

Agent API:
  - Per-skill query volume + success rate
  - Escalation rate (agent couldn't answer → human required)
  - Confidence distribution across agent queries
```

---

## 16. YC Pitch Narrative

### The Problem

> Knowledge shouldn't have a lifespan — but at every company, it does.

The judgment, procedures, and institutional memory your best employees carry — the things that aren't in any document — disappear when they leave. Every departure. Every time.

Companies try to solve this with wikis, onboarding docs, and "knowledge management" tools. Those capture artifacts. They don't capture how your senior support lead thinks about a refund exception, or how your best engineer decides when to escalate an incident, or why your head of sales knows which pricing exceptions to make.

That knowledge lives in people. When they leave, it's gone.

This has always been painful. But now there's a second problem layered on top: every company deploying AI agents is discovering the same wall. The models are capable. The bottleneck is that no AI agent knows how *this* company works. What the actual policy is. What the exceptions are. What the right person to escalate to is. That knowledge lives in people — and it was never structured in a way agents can use.

### The Solution

> Doppel ensures your knowledge and skills don't have a lifespan.

We capture the unwritten knowledge of your employees — from their emails, Slack, GitHub, docs, and direct Q&A — and preserve it permanently as a living, queryable brain. It compounds over time. Every departure adds to it instead of subtracting from it.

```
Sarah, your senior support lead, leaves after 5 years.

Without Doppel:
  Her judgment about refund exceptions, VIP handling, and Category C
  escalation lives in her head. It walks out the door with her.

With Doppel:
  Her brain stays. New teammates query it.
  "How do we handle a 45-day refund request for a VIP?"
  → Her answer, in her voice, citing her actual Slack threads and emails.
  → Confidence: 91%. Sources cited.

  And for your AI agent doing the same job:
  POST /v1/org/{id}/query → structured procedure, exception rules, escalation path.
  The agent acts correctly. At scale. Without Sarah.
```

### Two Products. One Compounding System.

**For your team:** Individual brains that answer like the person — with their judgment, their voice, their sources. The person leaves; the knowledge doesn't.

**For your AI agents:** A structured skills API that gives agents the company-specific procedures they need to act correctly. Not generic knowledge — *your* procedures, extracted from *your* people's actual work.

The same underlying system powers both. Every human query makes the brain better. Every skill verified by a human makes the agent more reliable.

### Why Now

```
Knowledge loss has always hurt. What changed:

1. AI agents are now making decisions at companies — and they fail without
   company-specific knowledge. The cost of lost institutional knowledge just
   got much higher.

2. LLMs are now good enough to extract judgment from emails, Slack, and docs —
   and structure it into something queryable and executable. That wasn't
   possible two years ago.

3. Every company spending money on AI automation is about to hit the same wall.
   Doppel is the answer to that wall.
```

### Traction Goals (YC Application)

```
By application:
  ├── 3 B2B design partners with weekly active usage
  ├── 2 case studies: "answered a question the departing employee took with them"
  ├── 1 pilot where an AI agent uses Doppel skills API to complete real work
  ├── Quality eval: 75%+ blind human accuracy
  └── $5k–$10k MRR, growing 20%+ MoM

By interview:
  ├── $20k+ MRR (at least 5 Team deals)
  ├── 1 enterprise pilot LOI ($50k+ ACV)
  ├── 1 live agent integration (agent using Doppel skills to do real company work)
  └── Net revenue retention >100%
```

### The Ask

$500k SAFE to:
- 3-person team through Phase 3 (company brain) + Phase 4 (skills API beta)
- Slack-native distribution + enterprise auth build-out
- 6-month runway to $50k MRR + first agent API design partner

---

*Last updated: 2026-04-29 | Version: 6.0 | Core framing: knowledge shouldn't have a lifespan — it should compound. Individual clones are the wedge. Company brain + skills API is the endgame.*
