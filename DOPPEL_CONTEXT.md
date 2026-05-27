# Doppel — Project Context

Use this document to understand what Doppel is, what has been built, how the codebase works, and what direction we're heading. Treat it as ground truth for all decisions.

---

## What Doppel is

Doppel is a **knowledge commerce platform**. Creators build a persistent AI clone of themselves — trained on their real knowledge, writing, and thinking — and sell access to it. Consumers buy that access to get answers sourced from genuine human expertise, not generic AI.

**Tagline:** Knowledge shouldn't have a lifespan.

**Legal entity:** Doppel AI, Inc.

**Core product framing:**
- The clone IS the product. Not the email agent. Not the meeting bot.
- The "wow moment" is: talk to a chatbot that thinks and sounds exactly like a real expert.
- The marketplace is the distribution layer. Creators list, consumers discover and buy.
- Doppel's moat against commodity AI: verified real-world expertise, persistent cross-session memory, multi-expert synthesis, and packaged knowledge products — none of which ChatGPT can replicate.

**What makes this a marketplace, not just a chatbot:**
- **Verified clones** — admin-granted signal that the clone was trained on the creator's actual data. Trust signal for consumers.
- **Knowledge bundles** — creators package 3–10 deep briefings into a one-time-purchase product. Converts expertise into a durable, resaleable asset.
- **Persistent consumer memory** — the clone builds a profile of each consumer across sessions. Relationships compound over time.
- **Multi-clone synthesis** — consumers can query 2–5 clones simultaneously and get a synthesized answer. Uniquely possible only on a multi-creator platform.
- **Session summaries** — structured, exportable takeaways from every conversation. Knowledge persists beyond the chat window.

**Business model:**
- Per-query credits: consumer buys credit packs. 1 credit = 1 message to a paid clone. 80% to creator, 20% platform.
- Knowledge bundles: one-time purchase via Stripe. Same 80/20 split.
- Free clones: no credits charged. Creator earns nothing but builds audience and can upsell.
- Session summary: 2 credits (paid clones). Platform only.

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
| Desktop | Electron (`desktop/`) — wraps deployed web UI in a native shell with system tray + global hotkey + overlay mode |
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

**`owner_mode` flag** — `BrainInput.owner_mode: bool` (default `True`). When `True`, the creator testing their own clone is not charged and earnings are not attributed (training mode). When `False`, full credit deduction and earnings logic applies (consumer preview or real consumer).

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
| `/home` | Consumer hub: conversation list sidebar + chat panel. Main authenticated consumer surface. Supports `?clone=handle` to auto-open a clone. |
| `/marketplace` | Browse all listed clones |
| `/marketplace/[handle]` | Clone detail: stats, sample questions, ratings, buy credits, bundle cards |
| `/c/[handle]` | Public (unauthenticated) chat interface |
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
| `/dashboard/test` | Creator-only: test clone in training mode or consumer preview mode |
| `/dashboard/email` | Email drafting surface |
| `/dashboard/deploy` | Deploy config: embeddable widget, API access |
| `/dashboard/admin` | Admin panel: verify clones, grant credits, user table with credit balances |

### Key components
| Component | Location |
|---|---|
| `ChatInterface` | `ui/components/chat/ChatInterface.tsx` — full chat UI with export summary button (shows after 4+ messages), `SummaryModal`, overlay toggle (Electron only) |
| `useChat` | `ui/lib/hooks/useChat.ts` — SSE stream handler, exposes `sessionId`, sends `owner_mode` flag |
| `PublicChatClient` | `ui/app/c/[handle]/PublicChatClient.tsx` — wraps ChatInterface, shows "remembered from N sessions" banner for returning consumers |
| `Sidebar` | `ui/components/layout/Sidebar.tsx` — dashboard nav, includes Synthesis + Bundles links |

---

## Desktop app (`desktop/`)

Electron shell around the deployed web UI. Not a rebuilt frontend — loads the live URL in a native window.

**Additional value over browser:**
- System tray icon — app always accessible, `click` to show/hide
- Global hotkey `Ctrl+Shift+Space` — toggle overlay from anywhere
- Overlay mode — `400×680px`, `alwaysOnTop`, frameless, bottom-right of screen. Floats over other apps. Opacity `0.97` focused / `0.88` unfocused.
- Normal mode — `1280×820px`, resizable, no browser chrome

**Overlay toggle:** global hotkey, system tray menu, or button inside `ChatInterface` (only rendered when `window.electronAPI?.isElectron === true`).

**Build:** `cd desktop && npm install && npm run build` → produces `release/doppel Setup 1.0.0.exe` (Win) and `release/doppel-1.0.0.dmg` (Mac).

---

## Feature inventory (built and live)

### 1. Core clone brain
4-layer cognitive pipeline with fast/slow path routing, per-clone memory, style fingerprint, identity layer.

### 2. Marketplace
Consumer-facing browse + detail pages. Pay-per-query credit system. Stripe checkout for credit packs. 80/20 revenue split.

### 3. Verified clone badge
Admin grants `is_verified` to clones with real training data. Shown as an emerald checkmark badge on marketplace cards and detail pages. Revocable. Admin panel in dashboard.

### 4. Session summary export
After 4+ messages, "Export summary" button appears in chat. Calls `POST /brain/summary`, generates structured markdown (Key Insights / Recommendations / Action Items). Copy + download as .md. 2 credits for paid clones.

### 5. Persistent consumer memory
After each chat session, a background task updates `consumer_profiles` with a 2–3 sentence LLM summary of what the clone should remember about this person. Injected into system prompt on subsequent sessions. Returning consumers see a banner: "{Clone} remembers you from N previous conversations."

### 6. Multi-clone synthesis
Consumer selects 2–5 clones, asks one question. Responses in parallel. Returns per-clone perspectives + synthesized answer. Deliberate mode: 2 clones debate a topic for N rounds. Credits per query/turn.

### 7. Knowledge bundles
Creators package 3–10 deep briefings as a one-time-purchase product. Topics → generated briefing content → published → Stripe checkout. Bundle reader page with accordion post-purchase. Creator earnings at 80%.

### 8. Consumer home (`/home`)
Authenticated consumer hub. Left sidebar: conversation list (all clones chatted with), search, credit balance, "My Brain" shortcut, profile footer. Right panel: active chat or empty state with featured clones from marketplace. Supports `?clone=handle` deep-link for direct-open from elsewhere in the app.

### 9. Desktop app
Electron wrapper. System tray, global hotkey, overlay mode. Windows (NSIS installer) and Mac (DMG). `desktop/` directory at repo root.

### 10. Creator test page (training vs consumer preview)
`/dashboard/test` is creator-only. Explicit toggle: **Training mode** (owner_mode=true, no credits deducted, earnings not attributed) vs **Consumer preview** (owner_mode=false, full credit logic applies — tests real consumer experience).

---

## Design system

**Theme:** Dark only. No light mode. No system preference detection.

**Background:** `#080808` — near-black, never pure black.

**Color palette:** Monochrome. No color accents in product UI except:
- `emerald-400` — positive/connected status, verified badge (kept at low opacity, e.g. `/60`)
- `red-400` — destructive actions / warnings (low opacity)
- `violet-400` — enterprise badges (low opacity)

**Glass system** (defined in `globals.css`):
```
.glass     → surface (rgba 255/255/255 / 0.04) + border 0.08
.glass-md  → surface-md (0.07) + border 0.08
.glass-hi  → surface-hi (0.11) + border-hi 0.14
```
All glass uses `backdrop-filter: blur(20px)`.

**Typography:** Plus Jakarta Sans (`var(--font-sans)`) — applied globally. Max weight 600. No bold above 600.

**Text opacity scale:** `/85` primary, `/60` secondary, `/40` tertiary, `/25` placeholder/hint.

**Voice:** Direct, precise, no fluff. Short sentences. Never cheerful or salesy. Treat the user as an intelligent adult.

---

## Auth pattern

Clerk handles auth in Next.js. Every API proxy route extracts `userId` from `auth()` and injects it as `X-User-Id` header to FastAPI. FastAPI reads it from `request.headers.get("X-User-Id")`. No JWT verification on the FastAPI side — it trusts the header from the internal Next.js layer.

Admin is identified by `NEXT_PUBLIC_ADMIN_USER_ID` env var (frontend) and `_require_admin()` helper (backend).

---

## Credit deduction logic

Credits deduct when: `price_per_query > 0` AND NOT `(caller_is_owner AND owner_mode=True)`.

This means:
- Owner testing in training mode → no charge, no earnings attributed
- Owner testing in consumer preview mode → charged like a real consumer, earnings not attributed (prevents self-earning)
- Any other authenticated consumer → charged, earnings attributed to creator
- Unauthenticated public chat → only works on public/free clones; no credits

---

## GTM direction

**Phase 1 (weeks 1–4):** Seed 10–15 high-quality clones before driving consumer traffic. Direct outreach to consultants, indie founders, newsletter writers with existing audiences. Offer first 20 creators 90/10 split for 6 months. White-glove onboarding — ingest their content for them.

**Phase 2 (weeks 3–6):** Each creator tells their audience. Tweet kit + email blast template. Embeddable widget so creators can put chat on their own site.

**Phase 3 (weeks 5–8):** Synthesis as the consumer hook — publish "I asked 4 VCs the same question" content. ProductHunt launch once 10+ quality clones are live.

**Retention hooks:**
- Persistent memory: "X now remembers you. Your next conversation picks up where you left off."
- Session summary as shareable — one-click tweet/share of key insights
- Bundle sales give creators recurring income → stronger evangelist incentive

**What not to do:** No paid ads until conversion is understood. No PH launch before 10+ real clones.

---

## Known gaps

- **Clone subscriptions** — recurring revenue model (discussed, not built)
- **Synthesis streaming** — synthesis endpoint is non-streaming; deliberation in particular would benefit from SSE
- **Bundle discovery** — no dedicated browse page for bundles; currently only accessible from a clone's detail page
- **Consumer onboarding** — no guided first-use experience; consumers arrive on marketplace with no context
- **Mobile** — not optimised; chat works but marketplace layout needs responsive work
- **Creator analytics** — earnings dashboard is basic; no per-clone query breakdown, no consumer retention data
- **Embeddable widget** — deploy page exists but widget script is not built
