# Doppel — External Integrations

All external service integrations are tracked here. Each entry describes:
- **What it does** in the product
- **Status**: `stubbed` (UI built, no real API calls) | `partial` (some endpoints wired) | `complete`
- **Env vars** required
- **Setup steps**
- **Files** to update when activating

---

## Recall.ai — Meeting Bot
**Status:** `stubbed` — full UI + backend routes built; API calls fire but fail without key.
**What it does:** Sends a bot to join Zoom/Meet/Teams. Provides real-time transcription via webhook, receives chat messages.
**Env vars:**
```
RECALL_API_KEY=        # from app.recall.ai → API Keys
RECALL_API_BASE=https://us-east-1.recall.ai/api/v1
```
**Setup:**
1. Sign up at recall.ai, create a bot application
2. Set `RECALL_API_KEY` in `.env`
3. Set `APP_URL` to your public URL (ngrok for local dev: `ngrok http 3000`)
4. Recall.ai will POST transcripts to `{APP_URL}/api/meetings/webhook`

**Files:**
- `doppel/main.py` — `POST /meetings/join`, `POST /meetings/webhook`, `_respond_in_meeting()`
- `ui/app/api/meetings/` — all proxy routes
- `ui/app/api/meetings/webhook/route.ts` — added to public routes in `proxy.ts`

---

## ElevenLabs — Voice Cloning (TTS)
**Status:** `stubbed` — voice model setup UI built; no TTS calls yet.
**What it does:** Clones the user's voice from a 3-5 min audio sample. Used by the meeting bot to respond with audio instead of text chat.
**Env vars:**
```
ELEVENLABS_API_KEY=    # from elevenlabs.io → Profile → API Keys
```
**Setup:**
1. Sign up at elevenlabs.io
2. Set `ELEVENLABS_API_KEY` in `.env`
3. In Settings → Voice, upload a 3-5 min audio clip to generate a voice model
4. The voice model ID is stored in `clone_identity.elevenlabs_voice_id`

**Files:**
- `doppel/main.py` — `POST /voice/create-model`, `POST /voice/synthesize`
- `doppel/brain/db/schemas.sql` — add `elevenlabs_voice_id TEXT` column (migration pending)
- `ui/app/(dashboard)/dashboard/settings/page.tsx` — voice model upload section

**Activation:** In `_respond_in_meeting()`, replace chat message with TTS audio stream.

---

## Slack — Bot + OAuth
**Status:** `stubbed` — connect UI built in Train page; no OAuth flow or event handling.
**What it does:** Installs a Slack bot into a workspace. Users can `@clone ask [Name]: ...` in any channel and the clone responds.
**Env vars:**
```
SLACK_CLIENT_ID=       # from api.slack.com → App → OAuth & Permissions
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=  # used to verify webhook payloads
SLACK_BOT_TOKEN=       # set after OAuth install (stored per-workspace in DB)
```
**Setup:**
1. Create a Slack app at api.slack.com
2. Enable "Event Subscriptions", set Request URL to `{APP_URL}/api/slack/events`
3. Subscribe to `app_mention` and `message.im` events
4. Add OAuth scopes: `chat:write`, `channels:history`, `users:read`
5. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` in `.env`
6. OAuth redirect URL: `{APP_URL}/api/slack/callback`

**Files:**
- `doppel/main.py` — `GET /slack/oauth-url`, `GET /slack/callback`, `POST /slack/events`
- `doppel/brain/db/schemas.sql` — `slack_installations` table (migration pending)
- `ui/app/(dashboard)/dashboard/train/page.tsx` — Slack connect section
- `ui/app/api/slack/` — proxy routes (pending)

---

## Gmail Push Notifications — Email Drafting Agent
**Status:** `stubbed` — draft review UI built; email ingestion is pull-only (manual sync), not push.
**What it does:** Google Pub/Sub pushes a notification to our server whenever a new email arrives. We generate a draft reply using the clone brain, surfaced in the Email dashboard.
**Env vars:**
```
GOOGLE_CLIENT_ID=      # already used for Gmail OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_PUBSUB_TOPIC=   # e.g. projects/{project}/topics/doppel-gmail
```
**Setup:**
1. Enable Gmail API + Cloud Pub/Sub in Google Cloud Console
2. Create a Pub/Sub topic and subscription with push endpoint: `{APP_URL}/api/email/webhook`
3. Call Gmail API `watch()` after OAuth to subscribe to inbox changes
4. Webhook receives `historyId` → fetch new messages → generate draft

**Files:**
- `doppel/main.py` — `POST /email/webhook` (historyId → fetch → generate draft)
- `doppel/brain/db/schemas.sql` — `email_drafts` table ✓ (already created)
- `ui/app/(dashboard)/dashboard/email/page.tsx` — draft review inbox ✓
- `ui/app/api/email/webhook/route.ts` — added to public routes (pending)

---

## Notion — Knowledge Ingestion
**Status:** `stubbed` — connect UI shown in Train; no OAuth or content fetch.
**What it does:** Reads the user's Notion workspace pages and databases, chunks them into episodic memory.
**Env vars:**
```
NOTION_CLIENT_ID=      # from notion.so/my-integrations
NOTION_CLIENT_SECRET=
```
**Setup:**
1. Create a Notion integration at notion.so/my-integrations
2. Set OAuth redirect URL: `{APP_URL}/api/notion/callback`
3. After OAuth, use `notion-client` to list pages and databases
4. Chunk and embed content into episodic_memory

**Files:**
- `doppel/ingestion/connectors/notion.py` — (pending)
- `doppel/main.py` — `GET /ingestion/notion/auth-url`, `GET /ingestion/notion/callback`, `POST /ingestion/notion/sync`
- `ui/app/(dashboard)/dashboard/train/page.tsx` — Notion section (stub ✓)

---

## YouTube / Podcast — Video Ingestion
**Status:** `stubbed` — UI shown in Train; no transcript fetch.
**What it does:** Fetches transcripts from YouTube videos or podcast RSS feeds, chunks them into memory.
**Env vars:**
```
YOUTUBE_API_KEY=       # from Google Cloud Console → APIs → YouTube Data API v3
```
**Setup:**
1. Enable YouTube Data API v3 in Google Cloud Console
2. For YouTube: use `youtube-transcript-api` (Python) to fetch transcripts
3. For podcasts: parse RSS feed → download audio → STT via Deepgram

**Files:**
- `doppel/ingestion/connectors/youtube.py` — (pending)
- `doppel/main.py` — `POST /ingestion/youtube` (URL → transcript → chunk → embed)
- `ui/app/(dashboard)/dashboard/train/page.tsx` — YouTube/Podcast URL input (stub ✓)

---

## GitHub — Code + PR Ingestion
**Status:** `stubbed` — UI shown in Train; no API calls.
**What it does:** Reads commit messages, PR descriptions, code review comments to capture technical reasoning style.
**Env vars:**
```
GITHUB_CLIENT_ID=      # from github.com → Settings → Developer settings → OAuth Apps
GITHUB_CLIENT_SECRET=
```
**Setup:**
1. Create GitHub OAuth App, set callback to `{APP_URL}/api/github/callback`
2. After OAuth, fetch: authored commits, PR descriptions, review comments
3. Chunk and embed into episodic memory with `source = 'github'`

**Files:**
- `doppel/ingestion/connectors/github.py` — (pending)
- `doppel/main.py` — `GET /ingestion/github/auth-url`, `GET /ingestion/github/callback`, `POST /ingestion/github/sync`
- `ui/app/(dashboard)/dashboard/train/page.tsx` — GitHub section (stub ✓)

---

## Twitter/X — Hot Takes + Opinions
**Status:** `stubbed` — UI shown in Train; no API calls.
**What it does:** Fetches the user's tweets to capture short-form opinions, hot takes, and public positions.
**Env vars:**
```
TWITTER_BEARER_TOKEN=  # from developer.twitter.com
TWITTER_API_KEY=
TWITTER_API_SECRET=
```
**Setup:**
1. Apply for Twitter Developer access at developer.twitter.com
2. Create project + app, generate Bearer Token
3. Fetch user's tweets via `GET /2/users/{id}/tweets`

**Files:**
- `doppel/ingestion/connectors/twitter.py` — (pending)
- `doppel/main.py` — `POST /ingestion/twitter/sync`
- `ui/app/(dashboard)/dashboard/train/page.tsx` — Twitter section (stub ✓)

---

## Stripe — Billing
**Status:** `partial` — checkout, portal, and webhook handling built; price IDs need configuring.
**What it does:** Manages subscriptions for Free / Pro / Creator / Team tiers.
**Env vars:**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_CREATOR_MONTHLY_PRICE_ID=price_...
STRIPE_CREATOR_YEARLY_PRICE_ID=price_...
```
**Setup:**
1. Create products and prices in Stripe dashboard
2. Set webhook endpoint to `{APP_URL}/api/billing/webhook`
3. Subscribe to events: `customer.subscription.created/updated/deleted`, `checkout.session.completed`

**Files:**
- `ui/app/api/billing/` — checkout, portal, status, webhook routes ✓
- `ui/app/(dashboard)/dashboard/billing/page.tsx` ✓

---

## Deepgram / AssemblyAI — STT
**Status:** `not needed` — Recall.ai handles STT for meeting bot via its built-in transcription providers.
**Note:** If building a standalone STT pipeline (e.g. for WhatsApp voice notes), add here.

---

## WhatsApp Business — Voice/Text Ingestion (Phase 3)
**Status:** `not started`
**Env vars:**
```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

---

## Clerk — Auth
**Status:** `complete` — fully integrated.
**What it does:** User signup, signin, session management.
**Env vars:**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

---

## Summary Table

| Integration | Status | Blocks |
|------------|--------|--------|
| Clerk | ✅ complete | — |
| Stripe | 🟡 partial | Price IDs needed |
| Gmail OAuth | ✅ complete | — |
| Gmail Push (email agent) | 🔲 stubbed | Pub/Sub setup |
| Recall.ai | 🔲 stubbed | `RECALL_API_KEY` |
| ElevenLabs | 🔲 stubbed | `ELEVENLABS_API_KEY` |
| Slack | 🔲 stubbed | OAuth app creation |
| Notion | 🔲 stubbed | OAuth app creation |
| YouTube | 🔲 stubbed | `YOUTUBE_API_KEY` |
| GitHub | 🔲 stubbed | OAuth app creation |
| Twitter/X | 🔲 stubbed | Developer access |
| WhatsApp | 🔴 not started | Phase 3 |

## Non-integration Pages Added

These pages have no external integration dependency — all logic is internal to the Doppel stack.

| Page | Route | Status |
|------|-------|--------|
| Developer API Keys | `/dashboard/api` | ✅ complete |
| Team Workspace (Org) | `/dashboard/org` | ✅ complete |
