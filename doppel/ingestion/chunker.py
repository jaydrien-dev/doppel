"""
Chunker: splits text into embedding-safe pieces.

Rules:
- Try paragraph boundaries first (double newline)
- Fall back to sentence boundaries (. ! ?)
- Hard-cap at max_chars (never exceed)
- Drop chunks shorter than MIN_CHUNK_CHARS (noise)
- Preserve semantic continuity — no mid-sentence cuts
"""
from __future__ import annotations

import re

MIN_CHUNK_CHARS = 60


def chunk_text(text: str, max_chars: int = 1800) -> list[str]:
    """
    Split `text` into chunks, each ≤ max_chars.
    Returns only non-trivial chunks (>= MIN_CHUNK_CHARS).
    """
    text = text.strip()
    if not text:
        return []

    # Fast path: fits in one chunk
    if len(text) <= max_chars:
        return [text] if len(text) >= MIN_CHUNK_CHARS else []

    # Split on paragraph boundaries first
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # Paragraph itself oversized → split into sentences
        if len(para) > max_chars:
            # Flush what we have
            if current:
                merged = "\n\n".join(current).strip()
                if len(merged) >= MIN_CHUNK_CHARS:
                    chunks.append(merged)
                current = []
                current_len = 0
            # Split paragraph into sentences
            for sentence_chunk in _split_sentences(para, max_chars):
                if len(sentence_chunk) >= MIN_CHUNK_CHARS:
                    chunks.append(sentence_chunk)
        elif current_len + len(para) + 2 > max_chars:
            # Adding this paragraph would exceed budget → flush
            if current:
                merged = "\n\n".join(current).strip()
                if len(merged) >= MIN_CHUNK_CHARS:
                    chunks.append(merged)
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += len(para) + 2  # +2 for \n\n

    # Flush remaining
    if current:
        merged = "\n\n".join(current).strip()
        if len(merged) >= MIN_CHUNK_CHARS:
            chunks.append(merged)

    return chunks


def _split_sentences(text: str, max_chars: int) -> list[str]:
    """Split text on sentence boundaries, keeping each piece ≤ max_chars."""
    # Tokenize on sentence-ending punctuation followed by whitespace
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        # Single sentence over limit → hard truncate with word boundary
        if len(sent) > max_chars:
            if current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            chunks.extend(_hard_split(sent, max_chars))
        elif current_len + len(sent) + 1 > max_chars:
            if current:
                chunks.append(" ".join(current))
            current = [sent]
            current_len = len(sent)
        else:
            current.append(sent)
            current_len += len(sent) + 1

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if c.strip()]


def _hard_split(text: str, max_chars: int) -> list[str]:
    """Last resort: split on word boundaries when a single sentence is too long."""
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for word in words:
        if current_len + len(word) + 1 > max_chars and current:
            chunks.append(" ".join(current))
            current = [word]
            current_len = len(word)
        else:
            current.append(word)
            current_len += len(word) + 1

    if current:
        chunks.append(" ".join(current))
    return chunks
