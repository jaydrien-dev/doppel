"""
Seed a test clone with an identity so you can call /brain/chat immediately.
Usage: uv run python scripts/seed_clone.py

This creates a clone with a hardcoded UUID so you can use it right away.
In production, clone creation goes through the management API.
"""
import asyncio
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg
from doppel.config import settings
from doppel.brain.models.types import StyleFingerprint, ValueSystem

# Fixed UUID so this script is idempotent and you always know the clone_id
TEST_CLONE_ID = "00000000-0000-0000-0000-000000000001"
TEST_CLONE_NAME = "Alex"


async def main():
    raw_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(raw_url)

    # Build a default identity — in real usage this is computed from ingested data
    style = StyleFingerprint(
        avg_sentence_length=14,
        preferred_formality=0.55,
        uses_hedging=True,
        hedging_frequency=0.25,
        uses_bullet_points=True,
        uses_em_dash=True,
        directness=0.75,
        warmth=0.65,
        humor_frequency=0.15,
        greeting_patterns=["Hey", "Hi"],
        closing_patterns=["Best,", "Talk soon,"],
        email_reply_length="medium",
        chat_reply_length="short",
    )

    values = ValueSystem(
        core_values=["honesty", "speed", "impact"],
        professional_priorities=["shipping", "customer feedback", "team health"],
        risk_tolerance=0.65,
        conflict_style="direct",
        domain_beliefs=[
            "Move fast and fix things — perfect is the enemy of shipped",
            "Small teams beat big teams when the small team is excellent",
            "The best products are built by people who use them",
        ],
        persona_boundaries=[
            "Never make financial commitments on behalf of the user",
            "Never share information explicitly marked confidential",
            "Always identify as an AI clone if directly asked whether you're human",
            "Do not make hiring decisions or commitments",
        ],
    )

    try:
        await conn.execute("""
            INSERT INTO clone_identity
              (clone_id, display_name, style_fingerprint, value_system, priors, persona_boundaries)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (clone_id) DO UPDATE SET
              display_name      = EXCLUDED.display_name,
              style_fingerprint = EXCLUDED.style_fingerprint,
              value_system      = EXCLUDED.value_system,
              updated_at        = NOW()
        """,
            TEST_CLONE_ID,
            TEST_CLONE_NAME,
            json.dumps(style.model_dump()),
            json.dumps(values.model_dump()),
            json.dumps([]),
            json.dumps(values.persona_boundaries),
        )
        print(f"Clone seeded successfully.")
        print(f"  clone_id   : {TEST_CLONE_ID}")
        print(f"  name       : {TEST_CLONE_NAME}")
        print(f"\nUse this in your requests:")
        print(json.dumps({
            "clone_id": TEST_CLONE_ID,
            "session_id": str(uuid.uuid4()),
            "message": "What's your take on hiring generalists vs. specialists?",
            "context_type": "chat"
        }, indent=2))
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
