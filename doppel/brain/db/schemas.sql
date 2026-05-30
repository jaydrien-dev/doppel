-- Doppel Brain — Postgres Schema
-- Run once: psql -d doppel -f schemas.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- EPISODIC MEMORY
-- Raw experiences: emails sent, decisions made, things said.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS episodic_memory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id        UUID NOT NULL,
    content         TEXT NOT NULL,
    embedding       VECTOR(1536),
    source          TEXT NOT NULL,          -- gmail | slack | upload | chat | meeting
    authored_by_user BOOLEAN NOT NULL DEFAULT TRUE,
    context_type    TEXT,                   -- email_reply | message | document | decision
    entities        TEXT[],
    topics          TEXT[],
    formality_score FLOAT,
    created_at      TIMESTAMPTZ,            -- original creation time in source system
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_excluded     BOOLEAN NOT NULL DEFAULT FALSE,
    source_ref      TEXT                            -- original filename for uploads, thread_id for slack, etc.
);

ALTER TABLE episodic_memory ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE INDEX IF NOT EXISTS episodic_embedding_idx
    ON episodic_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX IF NOT EXISTS episodic_clone_idx
    ON episodic_memory (clone_id, is_excluded);


-- ---------------------------------------------------------------------------
-- SEMANTIC MEMORY
-- Structured facts the user knows / believes, with domain tags.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semantic_memory (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id    UUID NOT NULL,
    fact        TEXT NOT NULL,
    embedding   VECTOR(1536),
    domain      TEXT,           -- product | engineering | hiring | finance ...
    confidence  FLOAT NOT NULL DEFAULT 0.8,
    source_ids  UUID[],         -- back-references to episodic_memory rows
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS semantic_embedding_idx
    ON semantic_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
CREATE INDEX IF NOT EXISTS semantic_clone_idx ON semantic_memory (clone_id);


-- ---------------------------------------------------------------------------
-- PROCEDURAL MEMORY
-- Decision patterns, communication norms, and heuristics.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procedural_memory (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id         UUID NOT NULL,
    pattern_type     TEXT NOT NULL,     -- decision_heuristic | communication_norm | priority_rule
    description      TEXT NOT NULL,
    embedding        VECTOR(1536),
    examples         TEXT[],
    confidence       FLOAT NOT NULL DEFAULT 0.7,
    occurrence_count INT NOT NULL DEFAULT 1,
    last_reinforced  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS procedural_embedding_idx
    ON procedural_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
CREATE INDEX IF NOT EXISTS procedural_clone_idx ON procedural_memory (clone_id);


-- ---------------------------------------------------------------------------
-- RELATIONAL MEMORY
-- What the clone knows about specific people the user interacts with.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relational_memory (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id                UUID NOT NULL,
    contact_identifier      TEXT NOT NULL,      -- email address, Slack ID, etc.
    contact_name            TEXT,
    relationship_type       TEXT,               -- teammate | investor | client | friend
    interaction_history     JSONB,              -- narrative summary of past interactions
    communication_preferences JSONB,            -- how user talks to this person
    last_interaction        TIMESTAMPTZ,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clone_id, contact_identifier)
);

CREATE INDEX IF NOT EXISTS relational_clone_idx ON relational_memory (clone_id);
CREATE INDEX IF NOT EXISTS relational_contact_idx ON relational_memory (clone_id, contact_identifier);


-- ---------------------------------------------------------------------------
-- REASONING TRACES
-- Private thought records stored for the learning loop and auditing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reasoning_traces (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id                UUID NOT NULL,
    session_id              UUID NOT NULL,
    brain_input             JSONB NOT NULL,
    perceived_input         JSONB NOT NULL,
    memory_context_summary  JSONB,
    path                    TEXT NOT NULL,      -- fast | slow
    private_scratchpad      TEXT,               -- full slow-path reasoning
    framing                 TEXT,
    options_considered      TEXT[],
    selected_approach       TEXT,
    response                TEXT NOT NULL,
    confidence              FLOAT,
    style_score             FLOAT,
    needs_escalation        BOOLEAN NOT NULL DEFAULT FALSE,
    feedback_signal         TEXT,               -- approved | edited | rejected | null
    corrected_response      TEXT,
    correction_reason       TEXT,
    latency_ms              INT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS traces_clone_idx ON reasoning_traces (clone_id);
CREATE INDEX IF NOT EXISTS traces_session_idx ON reasoning_traces (clone_id, session_id);
CREATE INDEX IF NOT EXISTS traces_feedback_idx ON reasoning_traces (clone_id, feedback_signal)
    WHERE feedback_signal IS NOT NULL;


-- ---------------------------------------------------------------------------
-- CLONE IDENTITY
-- The persona core: style, values, priors, boundaries.
-- One row per clone — updated as the clone learns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clone_identity (
    clone_id            UUID PRIMARY KEY,
    display_name        TEXT NOT NULL,
    handle              TEXT UNIQUE,
    user_id             TEXT,
    access_mode         TEXT NOT NULL DEFAULT 'private',  -- private | allowlist | public
    style_fingerprint   JSONB NOT NULL,
    value_system        JSONB NOT NULL,
    priors              JSONB NOT NULL DEFAULT '[]',
    persona_boundaries  JSONB NOT NULL DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration for existing installs:
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS handle TEXT UNIQUE;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'private';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS api_keys JSONB NOT NULL DEFAULT '{}';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS allowed_emails TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS rate_limit_per_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS epistemic_profile JSONB NOT NULL DEFAULT '{}';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS admin_policies JSONB NOT NULL DEFAULT '{}';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS relational_profile JSONB NOT NULL DEFAULT '{}';
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;


-- ---------------------------------------------------------------------------
-- EMAIL DRAFTS
-- Draft replies generated by the clone brain for incoming emails.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_drafts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id        UUID NOT NULL,
    sender          TEXT NOT NULL,
    sender_email    TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    thread_id       TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    draft           TEXT NOT NULL,
    reasoning       TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | edited | rejected
    edited_version  TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_drafts_clone_idx
    ON email_drafts (clone_id, status, created_at DESC);


-- ---------------------------------------------------------------------------
-- OAUTH TOKENS
-- Access + refresh tokens per clone per provider.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id      UUID NOT NULL,
    provider      TEXT NOT NULL,        -- gmail | slack | notion
    access_token  TEXT NOT NULL,
    refresh_token TEXT,
    expires_at    TIMESTAMPTZ,
    scope         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clone_id, provider)
);

CREATE INDEX IF NOT EXISTS oauth_tokens_clone_idx ON oauth_tokens (clone_id, provider);


-- ---------------------------------------------------------------------------
-- INGESTION JOBS
-- Tracks progress of background ingestion runs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id        UUID NOT NULL,
    source          TEXT NOT NULL,      -- gmail | slack | upload
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
    total_items     INT NOT NULL DEFAULT 0,
    processed_items INT NOT NULL DEFAULT 0,
    failed_items    INT NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_clone_idx ON ingestion_jobs (clone_id, status);


-- ---------------------------------------------------------------------------
-- MEETING SESSIONS
-- Tracks Recall.ai bot sessions for the meeting participation bot.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_sessions (
    bot_id          TEXT PRIMARY KEY,
    clone_id        UUID NOT NULL,
    meeting_url     TEXT NOT NULL,
    meeting_platform TEXT NOT NULL DEFAULT 'zoom',  -- zoom | meet | teams
    status          TEXT NOT NULL DEFAULT 'joining', -- joining | in_call | ended | error
    transcript      JSONB NOT NULL DEFAULT '[]',     -- [{speaker, text, ts}]
    responses       JSONB NOT NULL DEFAULT '[]',     -- [{question, answer, ts}]
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS meeting_sessions_clone_idx ON meeting_sessions (clone_id, started_at DESC);


-- ---------------------------------------------------------------------------
-- DEVELOPER API KEYS
-- External tokens for programmatic clone API access.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS developer_api_keys (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id     UUID NOT NULL,
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw key
    key_preview  TEXT NOT NULL,          -- first 12 chars + ellipsis (display only)
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dev_keys_clone_idx ON developer_api_keys (clone_id);


-- ---------------------------------------------------------------------------
-- ORGS  &  ORG MEMBERSHIPS
-- B2B team workspace: one org, many clones/members.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orgs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE NOT NULL,
    owner_user_id TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_memberships (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    clone_id   UUID,           -- NULL if user hasn't created a clone yet
    role       TEXT NOT NULL DEFAULT 'member',  -- admin | member
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_org_idx ON org_memberships (org_id);
CREATE INDEX IF NOT EXISTS org_members_user_idx ON org_memberships (user_id);

CREATE TABLE IF NOT EXISTS org_invites (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    invited_email  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'member',
    invited_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, invited_email)
);

CREATE INDEX IF NOT EXISTS org_invites_org_idx ON org_invites (org_id);

CREATE TABLE IF NOT EXISTS org_credit_pools (
    org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    credits     INT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shareable join-link tokens for orgs (admin generates once; any signed-in user can use)
CREATE TABLE IF NOT EXISTS org_join_tokens (
    token      TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'member',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    use_count  INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS org_join_tokens_org_idx ON org_join_tokens (org_id);


-- ---------------------------------------------------------------------------
-- SLACK INSTALLATIONS
-- One row per (Slack workspace, Doppel clone) pair.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slack_installations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id     UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    team_id      TEXT NOT NULL,
    team_name    TEXT,
    bot_token    TEXT NOT NULL,
    bot_user_id  TEXT NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, clone_id)
);

CREATE INDEX IF NOT EXISTS slack_team_idx ON slack_installations (team_id);


-- ---------------------------------------------------------------------------
-- PROPOSALS
-- Clone-generated action proposals awaiting owner approval.
-- Covers: code reviews, calendar actions, onboarding feedback.
-- (Email replies use the separate email_drafts table.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id        UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    proposal_type   TEXT NOT NULL,   -- 'code_review' | 'calendar' | 'onboarding' | 'other'
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'edited' | 'rejected' | 'executed'
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    context         JSONB NOT NULL DEFAULT '{}',
    edited_content  TEXT,
    confidence      FLOAT,
    executed_at     TIMESTAMPTZ,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proposals_clone_idx ON proposals (clone_id, status, created_at DESC);


-- ---------------------------------------------------------------------------
-- ROLE BRAINS  (Phase 3 — Company Brain)
-- Aggregate individual clone knowledge by role/function.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_brains (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    role_name        TEXT NOT NULL,
    description      TEXT,
    member_clone_ids UUID[] NOT NULL DEFAULT '{}',
    knowledge_summary JSONB NOT NULL DEFAULT '{}',
    freshness_score  FLOAT NOT NULL DEFAULT 1.0,   -- 0=stale, 1=fresh
    last_extracted_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, role_name)
);

CREATE INDEX IF NOT EXISTS role_brains_org_idx ON role_brains (org_id);

-- Safety: add columns that may be missing on tables created from older schema versions
ALTER TABLE role_brains ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE role_brains ADD COLUMN IF NOT EXISTS last_extracted_at TIMESTAMPTZ;
ALTER TABLE role_brains ADD COLUMN IF NOT EXISTS knowledge_summary JSONB NOT NULL DEFAULT '{}';
ALTER TABLE role_brains ADD COLUMN IF NOT EXISTS freshness_score FLOAT NOT NULL DEFAULT 1.0;


-- ---------------------------------------------------------------------------
-- ORG SKILLS  (Phase 4 — Skills API)
-- Structured executable procedures extracted from the company brain.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_skills (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    role_brain_id    UUID REFERENCES role_brains(id) ON DELETE SET NULL,
    skill_name       TEXT NOT NULL,
    trigger_context  TEXT[] NOT NULL DEFAULT '{}',   -- keywords that invoke this skill
    inputs_required  TEXT[] NOT NULL DEFAULT '{}',
    procedure        JSONB NOT NULL DEFAULT '{}',     -- steps, decision_rules, exceptions
    confidence       FLOAT NOT NULL DEFAULT 0.0,
    source_count     INT NOT NULL DEFAULT 0,
    last_verified_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_skills_org_idx ON org_skills (org_id);
CREATE INDEX IF NOT EXISTS org_skills_role_idx ON org_skills (role_brain_id);

ALTER TABLE org_skills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ---------------------------------------------------------------------------
-- AGENT QUERIES  (Phase 4 — Skills API audit log)
-- Every call made by an AI agent to the company brain.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_queries (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    skill_id    UUID REFERENCES org_skills(id) ON DELETE SET NULL,
    api_key_id  UUID,
    situation   TEXT NOT NULL,
    context     JSONB NOT NULL DEFAULT '{}',
    response    JSONB NOT NULL DEFAULT '{}',
    confidence  FLOAT,
    escalated   BOOLEAN NOT NULL DEFAULT FALSE,
    latency_ms  INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_queries_org_idx ON agent_queries (org_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- BLOCK 5: ENTERPRISE FEATURES
-- ---------------------------------------------------------------------------

-- 5.1 / 5.2  Data retention + legal hold columns on clone_identity
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS retention_days_episodic INT DEFAULT 730;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS retention_days_traces INT DEFAULT 365;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS is_preserved BOOLEAN DEFAULT FALSE;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS preserved_at TIMESTAMPTZ;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS legal_hold_until DATE;

-- 5.5  SCIM provisioning columns on orgs
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS default_clone_access_mode TEXT DEFAULT 'org_scoped';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS scim_token_hash TEXT;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS scim_enabled BOOLEAN DEFAULT FALSE;

-- 5.6  SSO / SAML configuration
CREATE TABLE IF NOT EXISTS sso_configs (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,          -- 'okta'|'azure_ad'|'google_workspace'|'saml_generic'
    metadata_url   TEXT,
    entity_id      TEXT,
    certificate    TEXT,
    enabled        BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id)
);

-- 5.7  Role-based access per clone
CREATE TABLE IF NOT EXISTS clone_permissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id    UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'viewer',   -- 'viewer'|'contributor'|'admin'
    granted_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clone_id, user_id)
);

CREATE INDEX IF NOT EXISTS clone_perms_clone_idx ON clone_permissions (clone_id);

-- 5.8  Audit webhook registrations
CREATE TABLE IF NOT EXISTS audit_webhooks (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    secret     TEXT NOT NULL,
    enabled    BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- ACCESS AUDIT LOG  (Block 1.6 — security hardening)
-- Every access event: queries, denials, injection attempts, settings changes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id        UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,   -- 'query'|'access_denied'|'settings_change'|'injection_attempt'
    actor_user_id   TEXT,
    actor_ip        TEXT,
    request_surface TEXT,            -- 'chat'|'slack'|'api'|'email'|'meeting'
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_clone_idx ON access_audit_log (clone_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- FEATURE A — Email triage: close the loop
-- ---------------------------------------------------------------------------
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS trace_id UUID;


-- ---------------------------------------------------------------------------
-- FEATURE B — Onboarding Buddy
-- ---------------------------------------------------------------------------
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS is_onboarding_resource BOOLEAN DEFAULT FALSE;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS expertise_tags TEXT[] DEFAULT '{}';


-- ---------------------------------------------------------------------------
-- FEATURE C — Knowledge Handoff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS handoff_reports (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id         UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'generating', -- generating | complete | failed
    triggered_by     TEXT,
    domain_summary   TEXT,
    key_decisions    JSONB DEFAULT '[]',   -- [{title, date, rationale, outcome}]
    key_contacts     JSONB DEFAULT '[]',   -- [{name, relationship, context}]
    processes_owned  JSONB DEFAULT '[]',   -- [{name, description, steps}]
    successor_notes  TEXT,
    memory_stats     JSONB DEFAULT '{}',
    generated_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clone_id)
);
CREATE INDEX IF NOT EXISTS handoff_reports_clone_idx ON handoff_reports (clone_id);


-- ---------------------------------------------------------------------------
-- MARKETPLACE — Clone listings
-- ---------------------------------------------------------------------------

-- Listing fields on clone_identity
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS listing_title       TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS is_listed           BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS price_per_query     NUMERIC(8,4) NOT NULL DEFAULT 0.00;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS category            TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS listing_description TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS listing_banner_url  TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS avatar_url          TEXT;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS total_queries       BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS total_earnings_usd  NUMERIC(12,4) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS marketplace_listed_idx
    ON clone_identity (is_listed, category, total_queries DESC)
    WHERE is_listed = TRUE;

-- Clone ratings
CREATE TABLE IF NOT EXISTS clone_ratings (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id     UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    rater_user_id TEXT NOT NULL,
    rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clone_id, rater_user_id)
);
CREATE INDEX IF NOT EXISTS ratings_clone_idx ON clone_ratings (clone_id);

-- Query credits: per-user balance
CREATE TABLE IF NOT EXISTS query_credits (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           TEXT NOT NULL UNIQUE,
    credits_remaining BIGINT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-query spend ledger
CREATE TABLE IF NOT EXISTS query_transactions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       TEXT NOT NULL,
    clone_id      UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    credits_used  INT NOT NULL DEFAULT 1,
    response_mode TEXT NOT NULL DEFAULT 'fast',  -- fast | pro | extended
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS qtx_user_idx  ON query_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qtx_clone_idx ON query_transactions (clone_id, created_at DESC);

-- Migration for existing installs:
ALTER TABLE query_transactions ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'fast';

-- Weekly plan credits: per-user, resets every Monday (unused credits do not roll over)
CREATE TABLE IF NOT EXISTS plan_credits (
    user_id    TEXT PRIMARY KEY,
    credits    INT NOT NULL DEFAULT 0,
    week_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('week', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stripe checkout sessions for credit top-ups
CREATE TABLE IF NOT EXISTS stripe_credit_sessions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          TEXT NOT NULL,
    stripe_session_id TEXT NOT NULL UNIQUE,
    credits          INT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending', -- pending | complete | expired
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- Verified clone badge (admin-granted trust signal)
-- -------------------------------------------------------------------------
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS verification_note TEXT;

-- -------------------------------------------------------------------------
-- Persistent consumer memory (clone remembers individual users across sessions)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumer_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id            UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    consumer_user_id    TEXT NOT NULL,
    summary             TEXT,
    context_notes       JSONB DEFAULT '[]',
    first_session_at    TIMESTAMPTZ DEFAULT NOW(),
    last_session_at     TIMESTAMPTZ DEFAULT NOW(),
    total_sessions      INT DEFAULT 1,
    total_messages      INT DEFAULT 0,
    UNIQUE(clone_id, consumer_user_id)
);
CREATE INDEX IF NOT EXISTS consumer_profiles_clone_idx ON consumer_profiles (clone_id, consumer_user_id);

-- -------------------------------------------------------------------------
-- Knowledge bundles (creator-packaged deep briefings, one-time purchase)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_bundles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id        UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    price_usd       NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    is_published    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bundles_clone_idx ON knowledge_bundles (clone_id);

CREATE TABLE IF NOT EXISTS bundle_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id           UUID NOT NULL REFERENCES knowledge_bundles(id) ON DELETE CASCADE,
    topic               TEXT NOT NULL,
    briefing_content    TEXT,
    position            INT DEFAULT 0,
    status              TEXT DEFAULT 'pending',  -- pending | generating | ready | failed
    generated_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS bundle_items_bundle_idx ON bundle_items (bundle_id, position);

CREATE TABLE IF NOT EXISTS bundle_purchases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id           UUID NOT NULL REFERENCES knowledge_bundles(id),
    user_id             TEXT NOT NULL,
    stripe_session_id   TEXT,
    amount_paid         NUMERIC(8,2),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bundle_id, user_id)
);
CREATE INDEX IF NOT EXISTS bundle_purchases_user_idx ON bundle_purchases (user_id);

-- Bundle multi-clone model: clones that are part of a bundle
CREATE TABLE IF NOT EXISTS bundle_clone_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id   UUID NOT NULL REFERENCES knowledge_bundles(id) ON DELETE CASCADE,
    clone_id    UUID NOT NULL REFERENCES clone_identity(clone_id),
    position    INT DEFAULT 0,
    UNIQUE(bundle_id, clone_id)
);
CREATE INDEX IF NOT EXISTS bundle_clone_members_bundle_idx ON bundle_clone_members (bundle_id);

-- Queries bundled into the purchase
ALTER TABLE knowledge_bundles ADD COLUMN IF NOT EXISTS queries_included INT DEFAULT 0;

-- Track remaining bundle queries per purchase
ALTER TABLE bundle_purchases ADD COLUMN IF NOT EXISTS queries_remaining INT DEFAULT 0;

-- -------------------------------------------------------------------------
-- Consumer bundles (user-curated, cross-clone, optionally resellable)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumer_bundles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    is_public       BOOLEAN DEFAULT FALSE,
    price_usd       NUMERIC(8,2) DEFAULT 0.00,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consumer_bundles_user_idx ON consumer_bundles (user_id);
CREATE INDEX IF NOT EXISTS consumer_bundles_public_idx ON consumer_bundles (is_public, created_at DESC) WHERE is_public = TRUE;

CREATE TABLE IF NOT EXISTS consumer_bundle_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id       UUID NOT NULL REFERENCES consumer_bundles(id) ON DELETE CASCADE,
    clone_id        UUID NOT NULL REFERENCES clone_identity(clone_id),
    topic           TEXT NOT NULL,
    content         TEXT,
    position        INT DEFAULT 0,
    status          TEXT DEFAULT 'pending',  -- pending | generating | ready | failed
    credits_used    INT DEFAULT 0,
    generated_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS consumer_bundle_items_bundle_idx ON consumer_bundle_items (bundle_id, position);

CREATE TABLE IF NOT EXISTS consumer_bundle_purchases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id           UUID NOT NULL REFERENCES consumer_bundles(id),
    user_id             TEXT NOT NULL,
    stripe_session_id   TEXT,
    amount_paid         NUMERIC(8,2),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bundle_id, user_id)
);
CREATE INDEX IF NOT EXISTS consumer_bundle_purchases_user_idx ON consumer_bundle_purchases (user_id);

-- ---------------------------------------------------------------------------
-- CONSUMER CLONES
-- Tracks which clones a consumer has explicitly added to their home messages.
-- Populated via share links (/add/[handle]) and the explore page.
-- Independent of chat history — clones appear in sidebar even before first msg.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumer_clones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id            UUID NOT NULL REFERENCES clone_identity(clone_id) ON DELETE CASCADE,
    consumer_user_id    TEXT NOT NULL,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(clone_id, consumer_user_id)
);
CREATE INDEX IF NOT EXISTS consumer_clones_user_idx ON consumer_clones (consumer_user_id, added_at DESC);

-- ---------------------------------------------------------------------------
-- CONSUMER BRAIN
-- Personal knowledge store for consumers — retrieved to give clones context.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumer_memory (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consumer_user_id    TEXT NOT NULL,
    content             TEXT NOT NULL,
    embedding           VECTOR(1536),
    category            TEXT NOT NULL DEFAULT 'background',  -- background | goal | preference | experience | expertise
    source              TEXT NOT NULL DEFAULT 'manual',      -- manual | inferred
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consumer_memory_user_idx ON consumer_memory (consumer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consumer_memory_embedding_idx ON consumer_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Migration for existing installs:
ALTER TABLE consumer_memory ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'background';


-- ---------------------------------------------------------------------------
-- PAYOUT REQUESTS
-- Creator cash-out requests; processed by ops team.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             TEXT NOT NULL,
    clone_id            UUID REFERENCES clone_identity(clone_id) ON DELETE SET NULL,
    credits_requested   INT NOT NULL,
    usd_amount          NUMERIC(8,2) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | paid | rejected
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payout_requests_user_idx ON payout_requests (user_id, created_at DESC);
