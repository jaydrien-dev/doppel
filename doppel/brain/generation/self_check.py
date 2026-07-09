"""
Self-check: pre-flight validation before sending a response.
Catches grounding failures, persona violations, and obvious quality issues.
"""
from __future__ import annotations

from doppel.brain.identity.layer import IdentityLayer


def run_self_check(
    response: str,
    identity: IdentityLayer,
) -> tuple[bool, list[str]]:
    """
    Run lightweight checks on the generated response.
    Returns (passed, list_of_issues).
    Most issues are warnings, not blocks — the orchestrator decides whether to retry.
    """
    issues: list[str] = []

    # 1. Persona boundary check
    is_safe, violation = identity.enforce_boundaries(response)
    if not is_safe:
        issues.append(f"Boundary violation: {violation}")

    # 2. Length sanity check
    word_count = len(response.split())
    if word_count < 3:
        issues.append("Response is suspiciously short")
    if word_count > 800:
        issues.append("Response may be too long for context")

    # 3. Explicit uncertainty check — clone should never pretend to know things it doesn't
    uncertainty_phrases = [
        "i don't actually know",
        "i made that up",
        "i'm hallucinating",
        "as an ai language model",
        "i cannot verify",
    ]
    lower = response.lower()
    for phrase in uncertainty_phrases:
        if phrase in lower:
            issues.append(f"Potential uncertainty/hallucination signal: '{phrase}'")

    # 4. Identity confusion check
    if "i am an ai assistant" in lower and "clone" not in lower:
        issues.append("Clone may be presenting as generic AI instead of persona")

    # 5. Generic AI opener detection — soft warning, doesn't block but signals persona drift
    _GENERIC_OPENERS = [
        "certainly!", "certainly,",
        "absolutely!", "absolutely,",
        "of course!", "of course,",
        "happy to help",
        "i'd be happy to",
        "i'd be delighted",
        "great question",
        "excellent question",
        "that's a great question",
        "i hope this helps",
        "i hope this information",
        "as requested,",
        "sure, here",
        "sure! here",
    ]
    for opener in _GENERIC_OPENERS:
        if lower.startswith(opener) or lower.startswith(opener.lstrip("!")):
            issues.append(f"Generic AI opener detected: response starts with '{opener}'")
            break

    # 5. System prompt leakage check — response must not contain internal prompt fragments
    _PROMPT_LEAK_MARKERS = [
        "your personality:",
        "you are a clone of",
        "identity_core",
        "style_fingerprint",
        "value_system",
        "epistemic_profile",
        "persona_boundaries",
        "[system]",
        "<|system|>",
    ]
    for marker in _PROMPT_LEAK_MARKERS:
        if marker in lower:
            issues.append(f"Possible system prompt leakage: '{marker}' found in response")
            # This is a hard block — treat same as boundary violation
            break

    passed = not any(
        "Boundary violation" in i or "system prompt leakage" in i
        for i in issues
    )
    return passed, issues
