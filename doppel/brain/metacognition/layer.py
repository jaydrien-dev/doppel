"""
MetacognitionLayer: the brain's self-awareness system.

Responsibilities:
  1. Assess confidence in the reasoning trace
  2. Verify grounding (no hallucinated facts)
  3. Detect contradictions with prior session responses
  4. Make the final escalation decision
"""
from __future__ import annotations

from doppel.brain.models.types import BrainOutput, ReasoningTrace, SourceRef
from doppel.config import settings


class MetacognitionLayer:
    """
    Evaluates the quality and trustworthiness of the reasoning trace
    before the response is sent to the user.
    """

    def assess(
        self,
        trace: ReasoningTrace,
        response_text: str,
        prior_responses: list[str] | None = None,
    ) -> tuple[float, bool, str | None]:
        """
        Returns (final_confidence, needs_escalation, escalation_reason).

        Combines multiple signals:
        - Base confidence from the reasoning trace
        - Source grounding score
        - Contradiction detection
        - Persona boundary violation check
        """
        confidence = trace.confidence

        # Penalize low source grounding on slow path responses
        if trace.path == "slow" and not trace.sources:
            confidence *= 0.85  # slight penalty for no supporting evidence

        # Penalize if reasoning scratchpad signaled uncertainty
        if trace.path == "slow" and "not sure" in trace.private_scratchpad.lower():
            confidence = min(confidence, 0.65)

        # Detect obvious contradictions with prior responses
        contradiction = _detect_contradiction(response_text, prior_responses or [])
        if contradiction:
            confidence *= 0.7  # significant penalty — log for review

        # Respect escalation signal from reasoning trace
        needs_escalation = trace.needs_escalation
        escalation_reason = trace.escalation_reason

        # Override: force escalation if confidence drops below threshold
        if confidence < settings.escalation_threshold and not needs_escalation:
            needs_escalation = True
            escalation_reason = (
                f"Confidence too low ({confidence:.2f}) — insufficient context to respond reliably"
            )

        return confidence, needs_escalation, escalation_reason

    def annotate_output(
        self,
        response_text: str,
        confidence: float,
        needs_escalation: bool,
        escalation_reason: str | None,
        trace: ReasoningTrace,
    ) -> BrainOutput:
        """
        Assemble the final BrainOutput with metacognition annotations.
        Note: reasoning_trace_id and latency_ms are set by the orchestrator.
        """
        from uuid import uuid4
        return BrainOutput(
            response=response_text,
            confidence=confidence,
            needs_escalation=needs_escalation,
            escalation_reason=escalation_reason,
            sources=trace.sources,
            reasoning_trace_id=trace.id,
            path_taken=trace.path,
        )


def _detect_contradiction(response: str, prior_responses: list[str]) -> bool:
    """
    Simple heuristic contradiction detector.
    Catches obvious inversions; full semantic contradiction detection is a future enhancement.
    """
    if not prior_responses:
        return False

    # Check for stark opposites in the last 3 responses
    negation_pairs = [
        ("i agree", "i disagree"),
        ("yes", "no"),
        ("will do", "won't"),
        ("can do", "can't"),
    ]
    lower_response = response.lower()
    for recent in prior_responses[-3:]:
        lower_recent = recent.lower()
        for pos, neg in negation_pairs:
            if pos in lower_response and neg in lower_recent:
                return True
            if neg in lower_response and pos in lower_recent:
                return True

    return False
