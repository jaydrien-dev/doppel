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
    # Email addresses — redact address but keep domain for context (e.g. → [REDACTED:EMAIL]@gmail.com)
    (re.compile(
        r"\b[A-Za-z0-9._%+\-]+@([A-Za-z0-9\-]+\.[A-Za-z]{2,})\b"
    ), r"[REDACTED:EMAIL]@\1"),
    # URLs containing auth tokens / credentials in query string or path
    (re.compile(
        r"https?://[^\s]*(?:token|key|secret|auth|access_token|refresh_token|api_key)[^\s]*",
        re.IGNORECASE,
    ), "[REDACTED:AUTH_URL]"),
    # Street addresses (US pattern: number + street name + St/Ave/Rd/etc.)
    (re.compile(
        r"\b\d{1,5}\s+[A-Z][a-zA-Z\s]{3,30}\s+(?:St|Ave|Rd|Blvd|Dr|Ln|Ct|Way|Pl|Terr?|Circle|Cir|Pkwy)\b\.?",
        re.IGNORECASE,
    ), "[REDACTED:ADDRESS]"),
]


def redact_pii(text: str) -> str:
    """
    Apply all PII redaction patterns to `text` and return the sanitized version.
    Patterns are applied in order; earlier replacements do not interfere with later ones.
    """
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text
