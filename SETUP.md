# Doppel Brain — Setup & Running Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | [python.org](https://python.org) or `winget install Python.Python.3.12` |
| uv | latest | `pip install uv` or `winget install astral-sh.uv` |
| Docker Desktop | latest | [docker.com/desktop](https://www.docker.com/products/docker-desktop/) |
| Git | any | already installed |

**API keys you need:**
- **Anthropic API key** → [console.anthropic.com](https://console.anthropic.com)
- **OpenAI API key** → [platform.openai.com](https://platform.openai.com) (used only for embeddings — ~$0.0001 per 1k tokens)

---

## Step 1 — Clone & Install

```bash
cd c:/Users/jaydr/OneDrive/Documents/DOPPEL

# Install all Python dependencies into .venv
uv sync
```

You should see `.venv/` created with all packages installed.

---

## Step 2 — Configure Environment

Edit `.env` at the project root (already created):

```
ANTHROPIC_API_KEY=sk-ant-...       ← your real key
OPENAI_API_KEY=sk-...              ← your real key
DATABASE_URL=postgresql+asyncpg://doppel:doppel@localhost:5432/doppel
REDIS_URL=redis://localhost:6379/0
APP_ENV=development
SECRET_KEY=anything-for-dev
```

The `DATABASE_URL` and `REDIS_URL` already match the Docker defaults — don't change them unless you're using external services.

---

## Step 3 — Start Infrastructure

```bash
# Start Postgres (with pgvector built-in) + Redis
docker-compose up -d

# Verify both are healthy
docker-compose ps
```

Expected output:
```
NAME               STATUS
doppel_postgres    running (healthy)
doppel_redis       running (healthy)
```

If Postgres takes a moment, wait ~10 seconds and check again.

---

## Step 4 — Initialize the Database

```bash
uv run python scripts/setup_db.py
```

Expected output:
```
Connecting to: localhost:5432/doppel
Schema applied successfully.

Tables created:
  ✓ clone_identity
  ✓ episodic_memory
  ✓ procedural_memory
  ✓ reasoning_traces
  ✓ relational_memory
  ✓ semantic_memory
```

> Run this only once. Safe to re-run — all statements use `IF NOT EXISTS`.

---

## Step 5 — Seed a Test Clone

```bash
uv run python scripts/seed_clone.py
```

This creates a clone with a fixed ID (`00000000-0000-0000-0000-000000000001`) and a hardcoded identity so you can test immediately without ingesting real data.

Expected output:
```
Clone seeded successfully.
  clone_id   : 00000000-0000-0000-0000-000000000001
  name       : Alex

Use this in your requests:
{
  "clone_id": "00000000-0000-0000-0000-000000000001",
  "session_id": "...",
  "message": "What's your take on hiring generalists vs. specialists?",
  "context_type": "chat"
}
```

---

## Step 6 — Run the Server

```bash
uv run uvicorn doppel.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Application startup complete.
```

The `--reload` flag auto-restarts on code changes. Drop it in production.

---

## Step 7 — Verify It Works

### Option A: Automated smoke test
```bash
# In a second terminal (server must be running)
uv run python scripts/test_brain.py
```

You'll see two responses — one fast path (simple question), one slow path (decision) — plus their confidence scores, latency, and which reasoning path was taken.

### Option B: curl

```bash
# Simple question → fast path
curl -X POST http://localhost:8000/brain/chat \
  -H "Content-Type: application/json" \
  -d '{
    "clone_id": "00000000-0000-0000-0000-000000000001",
    "session_id": "11111111-1111-1111-1111-111111111111",
    "message": "What is your approach to hiring?",
    "context_type": "chat"
  }'

# Decision → slow path (notice path_taken: "slow" in response)
curl -X POST http://localhost:8000/brain/chat \
  -H "Content-Type: application/json" \
  -d '{
    "clone_id": "00000000-0000-0000-0000-000000000001",
    "session_id": "11111111-1111-1111-1111-111111111111",
    "message": "Should we raise a seed round now or wait?",
    "context_type": "decision"
  }'
```

### Option C: Swagger UI
Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.
All endpoints are documented and callable from the UI.

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `POST` | `/brain/chat` | Main brain endpoint — send a message |
| `POST` | `/brain/feedback` | Submit correction/approval on a response |
| `POST` | `/brain/ingest` | Add content to episodic memory |

### `/brain/chat` request body

```json
{
  "clone_id": "uuid",
  "session_id": "uuid",
  "message": "string",
  "context_type": "chat | email_draft | meeting | decision",
  "sender_id": "optional — email or Slack ID of who's asking",
  "sender_name": "optional — display name of sender",
  "metadata": {}
}
```

### `/brain/chat` response

```json
{
  "response": "the clone's reply",
  "confidence": 0.82,
  "needs_escalation": false,
  "escalation_reason": null,
  "sources": [],
  "reasoning_trace_id": "uuid",
  "path_taken": "fast | slow",
  "latency_ms": 743
}
```

**`path_taken: "slow"`** means the brain ran its full private reasoning scratchpad first — used for decisions and high-stakes queries.

### `/brain/feedback` request body

```json
{
  "trace_id": "uuid from reasoning_trace_id",
  "clone_id": "uuid",
  "signal_type": "approve | edit | reject | rating",
  "corrected_response": "the better version (if edit)",
  "correction_reason": "why it was wrong (optional)"
}
```

---

## Understanding the Reasoning Paths

```
Fast path  → simple questions, social, low-stakes
           → 1 LLM call, ~400–800ms
           → RAG + style injection → response

Slow path  → decisions, high-stakes, novel situations
           → 2 LLM calls, ~1.5–4s
           → private scratchpad (Frame → Options → Evaluate) → response
```

The router decides automatically based on:
- **intent == "decision"** → always slow
- **stakes == "high"** → slow
- **is_novel == true** → slow
- **requires_decision == true** → slow

---

## Adding Real Memory (Ingestion)

The brain is most useful once it has real data. Use the `/brain/ingest` endpoint:

```bash
curl -X POST http://localhost:8000/brain/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "clone_id": "00000000-0000-0000-0000-000000000001",
    "content": "Replied to investor: We are not raising right now. Focused on product-market fit. Will reach out in Q3.",
    "source": "gmail",
    "authored_by_user": true,
    "context_type": "email_reply",
    "topics": ["fundraising", "investor relations"],
    "is_pinned": false
  }'
```

Each chunk gets embedded and stored in episodic memory immediately. The brain will start using it in the next chat call.

---

## Stripe Billing (Optional)

Stripe powers the Free / Pro / Creator subscription tiers.

### 1 — Create products in Stripe Dashboard

Go to [dashboard.stripe.com/products](https://dashboard.stripe.com/products) and create two products:

| Product | Price 1 | Price 2 |
|---------|---------|---------|
| **Doppel Pro** | $29/mo (recurring monthly) | $290/yr (recurring yearly) |
| **Doppel Creator** | $79/mo (recurring monthly) | $790/yr (recurring yearly) |

Copy the four **Price IDs** (format: `price_...`).

### 2 — Add to `.env` (backend)

```
STRIPE_SECRET_KEY=sk_test_...          ← from Stripe Dashboard → Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_...        ← from step 3 below
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_CREATOR_MONTHLY_PRICE_ID=price_...
STRIPE_CREATOR_YEARLY_PRICE_ID=price_...
APP_URL=http://localhost:3000
```

### 3 — Add to `ui/.env.local` (frontend)

```
NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_CREATOR_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_CREATOR_YEARLY_PRICE_ID=price_...
```

### 4 — Forward webhooks locally

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then in a separate terminal:

```bash
stripe listen --forward-to localhost:8000/billing/webhook
```

Copy the `whsec_...` secret it prints and paste it as `STRIPE_WEBHOOK_SECRET` in `.env`.

### 5 — Test the flow

1. Go to `/dashboard/billing` → click **Upgrade to Pro**
2. Use test card `4242 4242 4242 4242`, any future expiry, any CVC
3. After payment, the webhook fires and your DB updates `subscription_tier = 'pro'`
4. Return to billing page → plan shows as active

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ValidationError: ANTHROPIC_API_KEY missing` | Make sure `.env` is at the project root (not in `doppel/`), and keys are filled in |
| `Connection refused` on port 5432 | `docker-compose up -d postgres` — wait 10s for it to be healthy |
| `Connection refused` on port 6379 | `docker-compose up -d redis` |
| `relation "episodic_memory" does not exist` | Run `uv run python scripts/setup_db.py` |
| `Clone X has no identity record` | Run `uv run python scripts/seed_clone.py` |
| Slow path taking >10s | Normal on first call (model loading). Subsequent calls are faster. |
| Import errors | Run `uv sync` to ensure all deps are installed |

---

## Stopping

```bash
# Stop the server: CTRL+C in the terminal running uvicorn

# Stop Docker services
docker-compose down

# Stop and delete all data (destructive)
docker-compose down -v
```

---

## Project Structure Quick Reference

```
DOPPEL/
  .env                          ← your API keys (never commit)
  docker-compose.yml            ← Postgres + Redis
  pyproject.toml                ← dependencies (managed by uv)
  scripts/
    setup_db.py                 ← initialize schema (run once)
    seed_clone.py               ← create test clone (run once)
    test_brain.py               ← smoke test (run anytime)
  doppel/
    config.py                   ← all settings, loaded from .env
    main.py                     ← FastAPI app, all routes
    brain/
      orchestrator.py           ← DoppelBrain — the main entry point
      models/types.py           ← all Pydantic data types
      perception/
        classifier.py           ← intent, stakes, novelty (haiku)
      memory/
        episodic.py             ← pgvector experience store
        semantic.py             ← knowledge facts
        procedural.py           ← decision patterns
        relational.py           ← per-person memory
        working.py              ← Redis session context
        system.py               ← unified memory retrieval
      reasoning/
        router.py               ← fast vs slow path decision
        fast_path.py            ← System 1: RAG → response
        slow_path.py            ← System 2: scratchpad → response
        engine.py               ← wires fast/slow together
      identity/
        style.py                ← writing style fingerprint
        values.py               ← values, priors, boundaries
        layer.py                ← unified identity interface
      metacognition/
        layer.py                ← confidence + escalation
      generation/
        self_check.py           ← boundary + quality checks
        response.py             ← final response assembly
      learning/
        feedback.py             ← corrections → training data
      db/
        connection.py           ← SQLAlchemy async engine
        vector.py               ← pgvector embed + search helpers
        schemas.sql             ← table definitions
```
