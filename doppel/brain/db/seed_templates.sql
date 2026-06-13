-- Doppel Clone Templates — Decision DNA Seed
-- Run after schemas.sql:  psql -d doppel -f seed_templates.sql
-- Safe to re-run (ON CONFLICT DO UPDATE).

INSERT INTO clone_templates (slug, name, tagline, domain, decision_profile) VALUES

-- ── Aristotle — General / Practical Wisdom ───────────────────────────────────
-- Phronesis: the right action, for the right reason, at the right time.
-- Balanced deliberator. Seeks the virtuous middle between extremes.
-- Default template for all-purpose clones.
(
    'aristotle',
    'Aristotle',
    'Practical wisdom — balanced, deliberate, context-aware.',
    'general',
    '{
        "risk_tolerance":        50,
        "time_horizon":          65,
        "intuition_vs_analysis": 62,
        "loss_aversion":         50,
        "ambiguity_tolerance":   65,
        "contrarianism":         45,
        "information_threshold": 68,
        "sunk_cost_resistance":  75
    }'
),

-- ── Marcus — Leadership / Stoic Clarity ──────────────────────────────────────
-- Meditations: focus on what is in your control; release what is not.
-- Long game thinker. Indifferent to loss. Duty-driven, not consensus-driven.
(
    'marcus',
    'Marcus',
    'Stoic leadership — long-term, duty-first, unmoved by loss.',
    'leadership',
    '{
        "risk_tolerance":        42,
        "time_horizon":          88,
        "intuition_vs_analysis": 55,
        "loss_aversion":         18,
        "ambiguity_tolerance":   80,
        "contrarianism":         72,
        "information_threshold": 45,
        "sunk_cost_resistance":  92
    }'
),

-- ── Sun — Strategy / Competitive Intelligence ────────────────────────────────
-- The Art of War: win before the battle. Never telegraph. Act on incomplete info.
-- Thrives in ambiguity. Cuts losses without hesitation. Never follows the crowd.
(
    'sun',
    'Sun',
    'Strategic execution — asymmetric, decisive, thrives in uncertainty.',
    'strategy',
    '{
        "risk_tolerance":        72,
        "time_horizon":          55,
        "intuition_vs_analysis": 38,
        "loss_aversion":         32,
        "ambiguity_tolerance":   92,
        "contrarianism":         88,
        "information_threshold": 28,
        "sunk_cost_resistance":  87
    }'
),

-- ── Benjamin — Finance / Pragmatic Compounding ───────────────────────────────
-- Poor Richard: time is money; a penny saved is a penny earned.
-- Conservative, analytical, long-term compounder. Cuts losers, rides winners.
(
    'benjamin',
    'Benjamin',
    'Pragmatic finance — patient, analytical, compounding over time.',
    'finance',
    '{
        "risk_tolerance":        28,
        "time_horizon":          92,
        "intuition_vs_analysis": 78,
        "loss_aversion":         62,
        "ambiguity_tolerance":   38,
        "contrarianism":         58,
        "information_threshold": 82,
        "sunk_cost_resistance":  80
    }'
)

ON CONFLICT (slug) DO UPDATE SET
    name             = EXCLUDED.name,
    tagline          = EXCLUDED.tagline,
    domain           = EXCLUDED.domain,
    decision_profile = EXCLUDED.decision_profile,
    is_active        = EXCLUDED.is_active;
