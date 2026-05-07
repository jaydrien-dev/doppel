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
    is_excluded     BOOLEAN NOT NULL DEFAULT FALSE
);

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
