"""
Entity and topic extraction utilities.
Lightweight — runs in parallel with the classifier.
"""
from __future__ import annotations

import re


def extract_entities_heuristic(text: str) -> list[str]:
    """
    Fast regex-based entity extraction as a fallback/supplement.
    The classifier does a better job via LLM, but this is free and fast.
    """
    # Email addresses
    emails = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
    # Capitalized proper nouns (simple heuristic)
    proper_nouns = re.findall(r'\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b', text)
    # URLs
    urls = re.findall(r'https?://\S+', text)

    entities = list(set(emails + proper_nouns + urls))
    return entities[:20]  # cap at 20


def estimate_urgency(text: str) -> float:
    """
    Keyword-based urgency estimation as a fast supplement to the LLM classifier.
    """
    high_urgency = ["urgent", "asap", "immediately", "emergency", "critical", "deadline today", "right now"]
    medium_urgency = ["soon", "this week", "by friday", "EOD", "end of day", "follow up"]

    lower = text.lower()
    if any(kw in lower for kw in high_urgency):
        return 0.9
    if any(kw in lower for kw in medium_urgency):
        return 0.5
    return 0.2
