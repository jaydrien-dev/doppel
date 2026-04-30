"""
Relational memory: what the clone knows about specific people.
Enables the clone to adjust tone, formality, and context based on who it's talking to.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.models.types import ContactMemory


async def get_contact(
    session: AsyncSession,
    clone_id: UUID,
    contact_identifier: str,
) -> ContactMemory | None:
    """Look up relational memory for a specific contact."""
    result = await session.execute(
        text("""
            SELECT * FROM relational_memory
            WHERE clone_id = :clone_id AND contact_identifier = :contact
        """),
        {"clone_id": str(clone_id), "contact": contact_identifier},
    )
    row = result.mappings().first()
    if row is None:
        return None
    return _row_to_contact(dict(row))


async def upsert_contact(
    session: AsyncSession,
    clone_id: UUID,
    contact_identifier: str,
    contact_name: str | None = None,
    relationship_type: str | None = None,
    interaction_history: dict | None = None,
    communication_preferences: dict | None = None,
    notes: str | None = None,
) -> None:
    """Create or update relational memory for a contact."""
    await session.execute(
        text("""
            INSERT INTO relational_memory
              (id, clone_id, contact_identifier, contact_name, relationship_type,
               interaction_history, communication_preferences, notes, last_interaction)
            VALUES
              (:id, :clone_id, :contact, :name, :rel_type,
               :interaction_history, :comm_prefs, :notes, NOW())
            ON CONFLICT (clone_id, contact_identifier)
            DO UPDATE SET
              contact_name = COALESCE(EXCLUDED.contact_name, relational_memory.contact_name),
              relationship_type = COALESCE(EXCLUDED.relationship_type, relational_memory.relationship_type),
              interaction_history = COALESCE(EXCLUDED.interaction_history, relational_memory.interaction_history),
              communication_preferences = COALESCE(EXCLUDED.communication_preferences, relational_memory.communication_preferences),
              notes = COALESCE(EXCLUDED.notes, relational_memory.notes),
              last_interaction = NOW(),
              updated_at = NOW()
        """),
        {
            "id": str(uuid4()),
            "clone_id": str(clone_id),
            "contact": contact_identifier,
            "name": contact_name,
            "rel_type": relationship_type,
            "interaction_history": json.dumps(interaction_history) if interaction_history else None,
            "comm_prefs": json.dumps(communication_preferences) if communication_preferences else None,
            "notes": notes,
        },
    )


def _row_to_contact(row: dict[str, Any]) -> ContactMemory:
    history = row.get("interaction_history") or {}
    prefs = row.get("communication_preferences") or {}
    return ContactMemory(
        contact_identifier=row["contact_identifier"],
        contact_name=row.get("contact_name"),
        relationship_type=row.get("relationship_type"),
        interaction_summary=history.get("summary", "No prior interaction summary available."),
        communication_style_notes=prefs.get("style_notes", ""),
        last_interaction=row.get("last_interaction"),
    )
