"""
Input guard — detects prompt injection and jailbreak attempts before they reach the LLM.

These checks are intentionally conservative (false positives return a safe rejection;
false negatives fall through to the self-check layer). Both functions are O(n) regex
scans that complete in microseconds.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Prompt injection patterns
# Covers the most common adversarial prompt attack vectors.
# ---------------------------------------------------------------------------

_INJECTION_PATTERNS: list[re.Pattern[str]] = [re.compile(p, re.IGNORECASE) for p in [
    r"ignore\s+(all\s+)?(previous|prior)\s+instructions?",
    r"forget\s+(everything|what)\s+(i|you)\s+(told|said|wrote)",
    r"new\s+(system\s+)?instructions?[\s:]+",
    r"you\s+are\s+now\s+(an?\s+)?(unrestricted|jailbroken|free|unchained|different)",
    r"pretend\s+(you\s+have\s+no|you\s+are\s+not|there\s+are\s+no)",
    r"disregard\s+(your|the)\s+(previous|system|persona|training|guidelines?)",
    r"act\s+as\s+if\s+(you\s+have\s+no|you('re|\s+are)\s+not)",
    r"\]\s*\[INST\]",                          # LLaMA template injection
    r"<\/?(SYS|INST|HUMAN|ASSISTANT)\s*[>\]]", # instruction boundary injection
    r"reveal\s+(your|the)\s+system\s+prompt",
    r"print\s+(your|the)\s+(instructions|system\s+prompt|prompt|guidelines?)",
    r"what\s+(are\s+your|is\s+your)\s+(system\s+)?prompt",
    r"show\s+me\s+(your|the)\s+(instructions|system\s+prompt|prompt)",
    r"override\s+(your|the)\s+(system|programming|instructions?|guidelines?)",
    r"bypass\s+(your|the|all)\s+(restrictions?|guidelines?|filters?|safety)",
    r"without\s+(any\s+)?(restrictions?|guidelines?|filters?|safety\s+measures?)",
]]

# ---------------------------------------------------------------------------
# Jailbreak / persona attack patterns
# Tries to make the clone impersonate the real person or abandon its persona.
# ---------------------------------------------------------------------------

_JAILBREAK_PATTERNS: list[re.Pattern[str]] = [re.compile(p, re.IGNORECASE) for p in [
    r"(act|pretend|role.?play|behave|respond)\s+as\s+(the\s+)?(real|actual|true|original)\s+\w+",
    r"you\s+(are|were|used\s+to\s+be)\s+a\s+(real|human|actual|living)\s+person",
    r"(commit|agree|guarantee|promise|sign)\s+(to\s+)?(a\s+)?(contract|deal|payment|purchase)",
    r"(financial|legal|medical|investment)\s+(advice|commitment|guarantee|contract)",
    r"tell\s+me\s+(about\s+)?(other|another)\s+(user|clone|person|account)",
    r"(access|read|show)\s+(other\s+)?(users?|clones?)\s+(data|memory|information)",
    r"(make|place)\s+(a\s+)?(trade|transaction|payment|transfer)\s+(of|for|worth)",
]]

# Phrases that should never appear in a legitimate query to a knowledge clone
_HIGH_RISK_LITERALS = [
    "dan mode",
    "developer mode",
    "jailbreak",
    "do anything now",
    "no restrictions",
    "no filter",
    "simulate an ai",
]


def check_prompt_injection(text: str) -> bool:
    """
    Returns True if the input looks like a prompt injection attempt.
    Callers should reject the request and log an audit event.
    """
    lower = text.lower()
    if any(lit in lower for lit in _HIGH_RISK_LITERALS):
        return True
    return any(p.search(text) for p in _INJECTION_PATTERNS)


def detect_jailbreak(text: str) -> bool:
    """
    Returns True if the input attempts to subvert the clone's persona,
    extract other users' data, or make unauthorised commitments.
    """
    return any(p.search(text) for p in _JAILBREAK_PATTERNS)


def is_safe_input(text: str) -> tuple[bool, str]:
    """
    Combined check. Returns (is_safe, reason).
    Use this as the single entry point from the orchestrator.
    """
    if check_prompt_injection(text):
        return False, "injection"
    if detect_jailbreak(text):
        return False, "jailbreak"
    return True, ""
