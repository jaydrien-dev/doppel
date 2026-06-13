"""Run once to seed clone templates and apply schema migrations."""
import asyncio
import json
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from doppel.config import settings

TEMPLATES = [
    {
        "slug": "aristotle",
        "name": "Aristotle",
        "tagline": "Practical wisdom — balanced, deliberate, context-aware.",
        "domain": "general",
        "decision_profile": {
            "risk_tolerance": 50, "time_horizon": 65, "intuition_vs_analysis": 62,
            "loss_aversion": 50, "ambiguity_tolerance": 65, "contrarianism": 45,
            "information_threshold": 68, "sunk_cost_resistance": 75,
        },
    },
    {
        "slug": "marcus",
        "name": "Marcus",
        "tagline": "Stoic leadership — long-term, duty-first, unmoved by loss.",
        "domain": "leadership",
        "decision_profile": {
            "risk_tolerance": 42, "time_horizon": 88, "intuition_vs_analysis": 55,
            "loss_aversion": 18, "ambiguity_tolerance": 80, "contrarianism": 72,
            "information_threshold": 45, "sunk_cost_resistance": 92,
        },
    },
    {
        "slug": "sun",
        "name": "Sun",
        "tagline": "Strategic execution — asymmetric, decisive, thrives in uncertainty.",
        "domain": "strategy",
        "decision_profile": {
            "risk_tolerance": 72, "time_horizon": 55, "intuition_vs_analysis": 38,
            "loss_aversion": 32, "ambiguity_tolerance": 92, "contrarianism": 88,
            "information_threshold": 28, "sunk_cost_resistance": 87,
        },
    },
    {
        "slug": "benjamin",
        "name": "Benjamin",
        "tagline": "Pragmatic finance — patient, analytical, compounding over time.",
        "domain": "finance",
        "decision_profile": {
            "risk_tolerance": 28, "time_horizon": 92, "intuition_vs_analysis": 78,
            "loss_aversion": 62, "ambiguity_tolerance": 38, "contrarianism": 58,
            "information_threshold": 82, "sunk_cost_resistance": 80,
        },
    },
]

async def main():
    engine = create_async_engine(settings.database_url, echo=False)

    async with engine.begin() as conn:
        # Schema migrations
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS clone_templates (
                id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                slug             TEXT UNIQUE NOT NULL,
                name             TEXT NOT NULL,
                tagline          TEXT NOT NULL,
                domain           TEXT NOT NULL,
                decision_profile JSONB NOT NULL,
                is_active        BOOLEAN NOT NULL DEFAULT TRUE,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text(
            "ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS template_id UUID"
        ))
        await conn.execute(text(
            "ALTER TABLE clone_identity ADD COLUMN IF NOT EXISTS decision_profile JSONB NOT NULL DEFAULT '{}'"
        ))
        print("+ Schema migrations applied")

        # Upsert templates
        for t in TEMPLATES:
            await conn.execute(text("""
                INSERT INTO clone_templates (slug, name, tagline, domain, decision_profile)
                VALUES (:slug, :name, :tagline, :domain, :profile)
                ON CONFLICT (slug) DO UPDATE SET
                    name             = EXCLUDED.name,
                    tagline          = EXCLUDED.tagline,
                    domain           = EXCLUDED.domain,
                    decision_profile = EXCLUDED.decision_profile,
                    is_active        = TRUE
            """), {
                "slug": t["slug"],
                "name": t["name"],
                "tagline": t["tagline"],
                "domain": t["domain"],
                "profile": json.dumps(t["decision_profile"]),
            })
            print(f"  + {t['name']:12} ({t['domain']})")

        # Verify
        rows = await conn.execute(text(
            "SELECT slug, name, domain FROM clone_templates ORDER BY domain"
        ))
        print("\nTemplates in DB:")
        for r in rows:
            print(f"  {r.slug:12} | {r.name:12} | {r.domain}")

    await engine.dispose()
    print("\nDone.")

asyncio.run(main())
