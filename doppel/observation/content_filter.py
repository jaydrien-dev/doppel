"""
Content filter for passive observation.

Checks items against exclusion rules BEFORE they enter the ingestion pipeline.
This prevents excluded content from ever touching the embedding API (cost savings).

Exclusion rules are stored per-source in observation_sources.exclusion_rules as JSONB:
  {
    "channels": ["random", "watercooler"],    -- Slack channel names to skip
    "contacts": ["personal@gmail.com"],       -- email/Slack contacts to skip
    "topics": ["personal", "health"],         -- topic keywords to skip
    "keywords": ["confidential", "NDA"]       -- exact keyword blocklist
  }
"""
from __future__ import annotations

from doppel.ingestion.connectors.base import RawItem


def should_observe(item: RawItem, rules: dict) -> bool:
    """
    Return True if this item passes all exclusion filters.
    Return False if it should be skipped.
    """
    if not rules:
        return True

    content_lower = item.content.lower()
    metadata = item.metadata or {}

    # Channel exclusion (Slack)
    excluded_channels = rules.get("channels", [])
    if excluded_channels:
        channel = metadata.get("channel_name", "")
        if channel and channel.lower() in [c.lower() for c in excluded_channels]:
            return False

    # Contact exclusion (email, Slack)
    excluded_contacts = rules.get("contacts", [])
    if excluded_contacts:
        sender = metadata.get("from", "") or metadata.get("sender", "") or metadata.get("to", "")
        sender_lower = sender.lower()
        for contact in excluded_contacts:
            if contact.lower() in sender_lower:
                return False

    # Topic exclusion
    excluded_topics = rules.get("topics", [])
    if excluded_topics:
        subject = (metadata.get("subject", "") or "").lower()
        for topic in excluded_topics:
            if topic.lower() in content_lower or topic.lower() in subject:
                return False

    # Keyword blocklist
    excluded_keywords = rules.get("keywords", [])
    if excluded_keywords:
        for keyword in excluded_keywords:
            if keyword.lower() in content_lower:
                return False

    return True
