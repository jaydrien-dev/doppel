"""
PII redactor — strips sensitive data from text before it's chunked and embedded.

Applied to every ingested document so credit cards, SSNs, API keys, and similar
identifiers never enter the vector store.

Replacements use sentinel tokens like [REDACTED:CC] so chunks remain readable
and the redaction is auditable.
"""
from __future__ import annotations

import re

_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Credit / debit card numbers (Visa, MC, Amex, Discover — with optional separators)
    (re.compile(r"\b(?:\d{4}[\s\-]){3}\d{4}\b|\b\d{15,16}\b(?=\s|$)"), "[REDACTED:CC]"),
    # US Social Security Numbers
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[REDACTED:SSN]"),
    # API keys / secret tokens (sk-, pk-, Bearer ...)
    (re.compile(
        r"\b(sk|pk|rk|dak|xoxb|xoxp|ghp|ghs|github_pat)[-_][A-Za-z0-9\-_]{16,}\b"
        r"|Bearer\s+[A-Za-z0-9\-._~+\/]+=*",
        re.IGNORECASE,
    ), "[REDACTED:APIKEY]"),
    # Passwords in key=value or key: value form
    (re.compile(
        r"(password|passwd|pwd|secret|token|api[-_]?key)\s*[:=]\s*\S+",
        re.IGNORECASE,
    ), "[REDACTED:PASSWORD]"),
    # US phone numbers
    (re.compile(
        r"\b(\+1[\s\-]?)?\(?\d{3}\)?[\s\-]\d{3}[\s\-]\d{4}\b"
    ), "[REDACTED:PHONE]"),
]


def redact_pii(text: str) -> str:
    """
    Apply all PII redaction patterns to `text` and return the sanitized version.
    Patterns are applied in order; earlier replacements do not interfere with later ones.
    """
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text
