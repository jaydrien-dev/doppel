# Doppel — Project Context

Use this document to understand what Doppel is, what has been built, how the codebase works, and what direction we're heading. Treat it as ground truth for all decisions.

---

## What Doppel is

Doppel lets people build a persistent AI clone of themselves — a "digital consciousness" trained on their real knowledge, writing, and thinking. The clone can then be deployed to answer questions, handle emails, participate in meetings, and be sold as a knowledge product on a marketplace.

**Tagline:** Knowledge shouldn't have a lifespan.

**Legal entity:** Doppel AI, Inc.

**Core product framing:**
- The clone IS the product. Not the email agent. Not the meeting bot.
- The "wow moment" is: talk to a chatbot that thinks and sounds exactly like you.
- Email drafting and meeting participation are secondary deployment surfaces on top of the same brain.
- The business model is a knowledge marketplace: consumers pay per query, creators keep 80%.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python), async SQLAlchemy, PostgreSQL |
| AI brain | Anthropic Claude API (claude-sonnet-4-6 for reasoning, configurable) |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Auth | Clerk (userId injected as `X-User-Id` header from Next.js → FastAPI) |
| Payments | Stripe (checkout sessions, webhooks) |
| Deployment | Vercel (frontend), Railway/similar (FastAPI) |
| Memory | Custom 4-layer cognitive architecture (see Brain section) |

---

## Brain architecture

The brain is the core technical differentiator. It is a 4-layer cognitive pipeline:

```
BrainInput → IdentityLayer → MemoryLayer → ReasoningLayer → BrainOutput
```

**IdentityLayer** — loads the clone's persona: style fingerprint, core values, communication patterns. Used to shape every response.

**MemoryLayer** — retrieves relevant memories from 3 stores:
- `episodic` — autobiographical events and experiences
- `semantic` — facts, knowledge, concepts
- `procedural` — skills, processes, how-to knowledge

**ReasoningLayer** — routes to fast path (System 1, instinctive, low-latency) or slow path (System 2, deliberate, higher-quality). Decision is based on query complexity and confidence scores.

**Fast path** (`doppel/brain/reasoning/fast_path.py`) — single LLM call with retrieved memories injected into system prompt. Returns in ~1s.

**Slow path** (`doppel/brain/reasoning/slow_path.py`) — multi-step reasoning: retrieves more memory, reflects, critiques own answer, produces final response. 3–5s.

**Consumer context injection** — both paths check `BrainInput.metadata["consumer_context"]` and prepend it to the system prompt if present:
```python
if consumer_ctx:
    system_prompt += f"\n\n## About the person you're talking to\n{consumer_ctx}"
```

**Orchestrator** — `doppel/brain/orchestrator.py`, `DoppelBrain.process(BrainInput) → BrainOutput`

**Reasoning traces** — every request is logged to `reasoning_traces` table (indexed by `session_id`). Used for summary generation and consumer profile updates.

---

## Database schema (key tables)

```sql
clone_identity          -- the clone: owner, persona, listing config, earnings
  + is_verified         -- admin-granted trust signal
  + verified_at, verification_note

reasoning_traces        -- full log of every brain request/response, by session_id
query_credits           -- consumer credit balances (per user_id)
query_transactions      -- per-query credit deduction ledger

consumer_profiles       -- persistent per-(clone, consumer) memory
  clone_id, consumer_user_id, summary, total_sessions, total_messages

knowledge_bundles       -- packaged products (3–10 deep briefings)
bundle_items            -- individual briefing topics within a bundle
bundle_purchases        -- Stripe-confirmed purchases (UNIQUE bundle+user)

stripe_credit_sessions  -- pending/complete Stripe checkout sessions for credits
```

---

## API surface (FastAPI, `doppel/main.py`)

### Core brain
| Endpoint | Description |
|---|---|
| `POST /brain/chat` | Main chat endpoint, full credit/consumer memory logic |
| `POST /brain/chat/stream` | SSE streaming variant |
| `POST /brain/summary` | Generate structured markdown session summary (2 credits for paid clones) |
| `POST /brain/feedback` | Submit feedback signal, triggers retraining if threshold reached |
| `POST /brain/ingest` | Ingest a single content chunk into memory |

### Marketplace
| Endpoint | Description |
|---|---|
| `GET /marketplace` | Paginated clone listing, filterable by category/sort/search |
| `GET /marketplace/{handle}` | Clone detail with memory stats, ratings |
| `GET /marketplace/bundles` | Published knowledge bundles |
| `GET /marketplace/bundles/{id}` | Bundle detail with item list (topics only, no content) |

### Consumer features
| Endpoint | Description |
|---|---|
| `GET /clones/{handle}/my-profile` | Consumer views what clone knows about them |
| `DELETE /clones/{handle}/my-profile` | Consumer erases their profile (GDPR) |
| `GET /bundles/{id}/access` | Check if caller has purchased a bundle |
| `GET /bundles/{id}/read` | Read all briefing content (purchase required) |
| `POST /bundles/{id}/checkout` | Stripe checkout for bundle purchase |

### Synthesis (multi-clone)
| Endpoint | Description |
|---|---|
| `POST /synthesis/query` | Query 2–5 clones in parallel, returns perspectives + synthesized answer. 1 credit/clone. |
| `POST /synthesis/deliberate` | Two clones debate a topic for 2–5 rounds. 1 credit/turn. |

### Creator (bundle management)
| Endpoint | Description |
|---|---|
| `POST /clones/{handle}/bundles` | Create a new bundle |
| `GET /clones/{handle}/bundles` | List creator's bundles (owner only) |
| `PATCH /bundles/{id}` | Update title/description/price/published state |
| `POST /bundles/{id}/items` | Add a topic |
| `DELETE /bundles/{id}/items/{itemId}` | Remove a topic |
| `GET /bundles/{id}/items` | List items with status (owner only) |
| `POST /bundles/{id}/generate` | Background-generate briefing content for pending items |

### Admin
| Endpoint | Description |
|---|---|
| `POST /admin/clones/{handle}/verify` | Grant verified badge |
| `DELETE /admin/clones/{handle}/verify` | Revoke verified badge |
| `POST /admin/credits/grant` | Manually add credits to any user |

### Credits & billing
| Endpoint | Description |
|---|---|
| `GET /credits/balance` | Consumer credit balance |
| `POST /credits/checkout` | Stripe checkout for credit packs |
| `POST /credits/webhook` | Stripe webhook — handles both credit purchases and bundle purchases |

---

## Frontend structure (Next.js, `ui/`)

### Consumer-facing pages
| Route | Description |
|---|---|
| `/` | Landing page |
| `/marketplace` | Browse all listed clones |
| `/marketplace/[handle]` | Clone detail: stats, sample questions, ratings, buy credits |
| `/c/[handle]` | Public chat interface with the clone |
| `/synthesis` | Multi-clone synthesis tool (query all + deliberation mode) |
| `/marketplace/bundles/[bundleId]` | Bundle reader: buy + read briefings |

### Dashboard (creator)
| Route | Description |
|---|---|
| `/dashboard` | Overview |
| `/dashboard/train` | Upload content, ingest sources (Gmail, Notion, Slack, etc.) |
| `/dashboard/identity` | Persona config: voice, values, communication style |
| `/dashboard/brain` | Memory browser, reasoning trace log |
| `/dashboard/listing` | Marketplace listing config: price, category, description |
| `/dashboard/bundles` | Create and manage knowledge bundles |
| `/dashboard/earnings` | Revenue breakdown |
| `/dashboard/credits` | Consumer credit balance + purchase |
| `/dashboard/email` | Email drafting surface |
| `/dashboard/deploy` | Deploy config: embeddable widget, API access |
| `/dashboard/admin` | Admin panel: verify clones, grant credits |

### Key components
| Component | Location |
|---|---|
| `ChatInterface` | `ui/components/chat/ChatInterface.tsx` — full chat UI with export summary button (shows after 4+ messages), `SummaryModal` |
| `useChat` | `ui/lib/hooks/useChat.ts` — SSE stream handler, exposes `sessionId` |
| `PublicChatClient` | `ui/app/c/[handle]/PublicChatClient.tsx` — wraps ChatInterface, shows "remembered from N sessions" banner for returning consumers |
| `Sidebar` | `ui/components/layout/Sidebar.tsx` — dashboard nav, includes Synthesis + Bundles links |

---

## Feature inventory (built and live)

### 1. Core clone brain
4-layer cognitive pipeline with fast/slow path routing, per-clone memory, style fingerprint, identity layer.

### 2. Marketplace
Consumer-facing browse + detail pages. Pay-per-query credit system. Stripe checkout for credit packs. 80/20 revenue split (creator keeps 80%).

### 3. Verified clone badge
Admin grants `is_verified` to clones with real training data. Shown as a teal checkmark badge on marketplace cards and detail pages.

### 4. Session summary export
After 4+ messages, an "Export summary" button appears in chat. Calls `POST /brain/summary`, generates structured markdown (Key Insights / Recommendations / Action Items). Copy + download as .md. Costs 2 credits for paid clones.

### 5. Persistent consumer memory
After each chat session, a background task updates `consumer_profiles` with a 2–3 sentence LLM summary of what the clone should remember about this person. Injected into the system prompt on subsequent sessions. Returning consumers see a "X remembers you from N previous conversations" banner.

### 6. Multi-clone synthesis
Consumer selects 2–5 clones, asks one question. Responses generated in parallel. Returns per-clone perspectives + synthesized answer. Separate "Deliberate" mode: 2 clones debate a topic for N rounds. Credits charged per query/turn.

### 7. Knowledge bundles
Creators package 3–10 deep briefings into a one-time-purchase product. Creator adds topics, triggers generation (brain produces briefing content per topic), sets price, publishes. Consumers buy via Stripe. Creator earnings credited at 80%. Bundle reader page shows accordion of full briefings post-purchase.

---

## Design system

**Theme:** Light for consumer/marketplace surfaces. Dark (near-black `#080808`) for the creator dashboard and chat UI.

**Consumer surfaces (marketplace, synthesis, bundles):**
- Background: `#F8F9FA`
- Cards: `bg-white` with `border border-neutral-200`
- Text: `text-neutral-800` (primary), `text-neutral-500` (secondary), `text-neutral-400` (hint)
- Accent: `#1A73E8` (Google Blue) — used for primary CTAs, active states, category colors
- No gradients. Flat category colors only (single solid hex per category).
- Contrasting badges: colored background + white text (never tinted bg + same-color text)

**Creator dashboard:**
- Background: `#080808`
- Glass layers: `.glass` / `.glass-md` / `.glass-hi` (defined in `globals.css`)
- Typography: Manrope, max weight 600
- Text opacity scale: `/85` primary, `/60` secondary, `/40` tertiary, `/25` placeholder
- No emoji in product UI

**Typography:**
- Font: Plus Jakarta Sans (`var(--font-sans)`) — applied globally, used everywhere

**Voice:** Direct, precise, no fluff. Short sentences. Never cheerful or salesy. Treat the user as an intelligent adult.

---

## Business model

| Source | Mechanic | Split |
|---|---|---|
| Per-query credits | Consumer buys credit packs (100/$5, 500/$20, 1000/$35). 1 credit = 1 query on a paid clone. | 80% creator / 20% platform |
| Knowledge bundles | One-time payment for packaged briefings. | 80% creator / 20% platform |
| Free clones | No credits deducted. Creator earns nothing but builds audience. | — |
| Session summary | 2 credits for paid clones. | Platform only |

---

## GTM direction

**Phase 1 (weeks 1–4):** Seed 10–15 high-quality clones before driving consumer traffic. Direct outreach to consultants, indie founders, newsletter writers with existing audiences. Offer first 20 creators 90/10 split for 6 months. White-glove onboarding — ingest their content for them.

**Phase 2 (weeks 3–6):** Each creator tells their audience. Tweet kit + email blast template. Embeddable widget so creators can put chat on their own site.

**Phase 3 (weeks 5–8):** Synthesis as the consumer hook — publish "I asked 4 VCs the same question" content. ProductHunt launch once 10+ quality clones are live.

**Retention hooks:**
- Persistent memory email: "X now remembers you. Your next conversation picks up where you left off."
- Session summary as shareable — one-click tweet/share of key insights
- Bundle sales give creators recurring income → stronger evangelist incentive

**What not to do:** No paid ads until conversion is understood. No PH launch before 10+ real clones. No new features for 8 weeks — distribution only.

---

## Auth pattern

Clerk handles auth in Next.js. Every API proxy route extracts `userId` from `auth()` and injects it as `X-User-Id` header to FastAPI. FastAPI reads it from `request.headers.get("X-User-Id")`. No JWT verification on the FastAPI side — it trusts the header from the internal Next.js layer.

Admin is identified by `NEXT_PUBLIC_ADMIN_USER_ID` env var (frontend) and `_require_admin()` helper (backend).

---

## What doesn't exist yet (known gaps)

- **Clone subscriptions** — recurring revenue model (discussed, not built)
- **Synthesis streaming** — synthesis endpoint is non-streaming; deliberation in particular would benefit from SSE
- **Bundle discovery** — no dedicated browse page for bundles; currently only accessible from a clone's detail page
- **Consumer onboarding flow** — no guided first-use experience; consumers arrive on marketplace with no context
- **Mobile** — not optimised; chat interface works but marketplace layout needs responsive work
- **Creator analytics** — earnings dashboard is basic; no per-clone query breakdown, no consumer retention data
