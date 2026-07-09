"""
ResponseGenerator: wraps the final response with quality checks and style enforcement.
Sits between the reasoning engine output and the BrainOutput returned to callers.
"""
from __future__ import annotations

from doppel.brain.generation.self_check import run_self_check
from doppel.brain.identity.layer import IdentityLayer
from doppel.brain.metacognition.escalation import format_escalation_message


async def finalize(
    response_text: str,
    identity: IdentityLayer,
    needs_escalation: bool,
    escalation_reason: str | None,
    owner_mode: bool = False,
) -> str:
    """
    Run self-check, handle escalation, and return the final response string.
    If there are fixable issues, they're logged but don't block the response.

    When owner_mode is True, escalation never replaces the response — the owner
    always sees what the clone would say.  The confidence pill in the UI is
    sufficient to flag uncertainty.  Escalation replacement only applies to
    consumer-facing interactions where the clone genuinely can't answer.
    """
    if needs_escalation and not owner_mode:
        return format_escalation_message(identity.clone_name, escalation_reason)

    passed, issues = run_self_check(response_text, identity)

    if issues:
        # Log issues for observability (in prod this goes to Langfuse/Datadog)
        # For now, print for development visibility
        print(f"[self_check] issues: {issues}")

    # If a hard boundary was violated, return a safe fallback
    if not passed:
        return (
            f"I'd rather not answer this one directly — "
            f"it's something {identity.clone_name} should address personally."
        )

    return response_text
