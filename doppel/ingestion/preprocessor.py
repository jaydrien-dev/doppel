"""
Email preprocessor: turns raw Gmail/MIME content into clean text for ingestion.

Steps:
1. HTML → plain text (tag stripping, no external dep)
2. Remove quoted reply blocks ("> ...", "On ... wrote:" patterns)
3. Remove signature blocks ("--", "Sent from my iPhone", etc.)
4. Prepend subject for semantic context
5. Collapse excessive whitespace

Also provides `estimate_formality()` — used to populate episodic_memory.formality_score.
"""
from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def preprocess_email(raw_body: str, subject: str = "") -> str:
    """
    Clean a raw email body and return plain text ready for chunking.
    Subject is prepended so chunks carry topical context.
    """
    text = _html_to_text(raw_body)
    text = _remove_quoted_blocks(text)
    text = _remove_signatures(text)
    text = _collapse_whitespace(text)

    if subject:
        text = f"Subject: {subject}\n\n{text}"

    return text.strip()


def estimate_formality(text: str) -> float:
    """
    Approximate formality score (0=casual, 1=formal) using a simplified
    Heylighen & Dewaele F-score based on word class proxies.

    High-formality markers: nouns, adjectives, articles, prepositions
    Low-formality markers: pronouns, verbs, adverbs, interjections
    """
    words = re.findall(r"\b[a-zA-Z']+\b", text.lower())
    if len(words) < 5:
        return 0.5  # not enough signal

    # Proxies for formal word classes
    articles = {"the", "a", "an"}
    prepositions = {
        "of", "in", "to", "for", "with", "on", "at", "from", "by", "about",
        "as", "into", "through", "during", "before", "after", "above", "below",
        "between", "among", "within", "without", "along", "across", "behind",
        "beyond", "except", "per", "regarding", "toward", "upon", "via",
    }
    # Proxies for informal word classes
    pronouns = {
        "i", "me", "my", "myself", "we", "our", "us", "you", "your", "yourself",
        "he", "she", "they", "them", "his", "her", "their", "it", "its",
    }
    hedges = {"just", "really", "very", "quite", "pretty", "so", "like", "basically", "literally"}

    formal_count = sum(1 for w in words if w in articles or w in prepositions)
    informal_count = sum(1 for w in words if w in pronouns or w in hedges)

    total = len(words)
    f_ratio = formal_count / total
    i_ratio = informal_count / total

    # Normalize to 0–1 range with a sigmoid-like mapping
    raw_score = f_ratio - i_ratio + 0.5
    return max(0.0, min(1.0, raw_score))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Regex patterns compiled once
_HTML_TAG = re.compile(r"<[^>]+>")
_NBSP = re.compile(r"&nbsp;|&#160;")
_HTML_ENTITIES = re.compile(r"&[a-zA-Z]+;|&#\d+;")
_MULTI_BLANK = re.compile(r"\n{3,}")
_TRAILING_SPACES = re.compile(r"[ \t]+\n")

# Quoted reply markers
_QUOTE_LINE = re.compile(r"^>.*", re.MULTILINE)
_ON_DATE_WROTE = re.compile(
    r"^On\s.{10,120}wrote:.*",
    re.MULTILINE | re.DOTALL,
)
_FROM_SENT = re.compile(
    r"^(From|Sent|To|Cc|Subject):\s.*",
    re.MULTILINE | re.IGNORECASE,
)

# Signature markers
_SIG_DASH = re.compile(r"^\s*--\s*$", re.MULTILINE)
_SIG_PHRASES = re.compile(
    r"(sent from my (iphone|ipad|android|samsung)|"
    r"get outlook for (ios|android)|"
    r"confidentiality notice|"
    r"this email (and any attachments|contains))",
    re.IGNORECASE,
)


def _html_to_text(html: str) -> str:
    """Strip HTML tags and decode common entities."""
    text = _NBSP.sub(" ", html)
    text = _HTML_TAG.sub(" ", text)
    text = _HTML_ENTITIES.sub("", text)
    # Collapse runs of spaces within lines
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text


def _remove_quoted_blocks(text: str) -> str:
    """
    Remove quoted reply content — the part that belongs to someone else.
    Multi-strategy: line-by-line > | quotes, 'On X wrote:', raw header blocks.
    """
    # Remove lines starting with >
    text = _QUOTE_LINE.sub("", text)
    # Remove "On [date], [person] wrote:" and everything after (common reply separator)
    match = _ON_DATE_WROTE.search(text)
    if match:
        text = text[: match.start()]
    return text


def _remove_signatures(text: str) -> str:
    """Remove common email signature blocks."""
    # Truncate at "-- " separator (standard sig delimiter)
    match = _SIG_DASH.search(text)
    if match:
        text = text[: match.start()]
    # Truncate at known signature phrases
    match = _SIG_PHRASES.search(text)
    if match:
        text = text[: match.start()]
    return text


def _collapse_whitespace(text: str) -> str:
    text = _TRAILING_SPACES.sub("\n", text)
    text = _MULTI_BLANK.sub("\n\n", text)
    return text.strip()
