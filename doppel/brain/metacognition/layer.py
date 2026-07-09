"""
MetacognitionLayer: the brain's self-awareness + approval routing system.

Responsibilities:
  1. Score representational confidence (does the clone know the owner well enough?)
  2. Score consequentiality (what's the blast radius if wrong?)
  3. Route to the correct approval path via the 2×2 matrix
  4. Detect contradictions with prior session responses
"""
from __future__ import annotations

from doppel.brain.models.types import (
    ApprovalDecision,
    ApprovalPath,
    PerceivedInput,
    ReasoningTrace,
)
from doppel.config import settings

# Thresholds for the 2×2 routing matrix
# Escalation should only trigger when the clone genuinely can't answer —
# not on routine questions with moderate confidence.
_REPR_THRESHOLD  = 0.35   # below this → clone truly doesn't know
_CONSQ_THRESHOLD = 0.65   # above → high-stakes action requiring review


class MetacognitionLayer:
    """
    Evaluates the quality and trustworthiness of the reasoning trace
    then routes to the correct approval path.
    """

    def assess(
        self,
        trace: ReasoningTrace,
        response_text: str,
        prior_responses: list[str] | None = None,
        perceived: PerceivedInput | None = None,
    ) -> ApprovalDecision:
        """
        Dual confidence scoring → approval routing.

        Returns an ApprovalDecision with:
          - repr_confidence: how faithfully the clone represents the owner
          - consequentiality: blast radius if the action is wrong
          - approval_path: one of AUTO_EXECUTE / CONSUMER_CONFIRM / CREATOR_REVIEW / DUAL_APPROVAL
          - needs_escalation: True when creator must review (CREATOR_REVIEW | DUAL_APPROVAL)
        """
        # ── 1. Representational confidence ───────────────────────────────
        repr_confidence = _score_representational(trace, response_text, prior_responses or [])

        # ── 2. Consequentiality ──────────────────────────────────────────
        consequentiality = _score_consequentiality(perceived, response_text)

        # ── 3. Route via 2×2 matrix ──────────────────────────────────────
        high_repr  = repr_confidence >= _REPR_THRESHOLD
        high_consq = consequentiality >= _CONSQ_THRESHOLD

        if high_repr and not high_consq:
            approval_path = ApprovalPath.AUTO_EXECUTE
        elif high_repr and high_consq:
            approval_path = ApprovalPath.CONSUMER_CONFIRM
        elif not high_repr and not high_consq:
            approval_path = ApprovalPath.CREATOR_REVIEW
        else:
            approval_path = ApprovalPath.DUAL_APPROVAL

        # ── 4. Override from trace (explicit escalation signal wins) ─────
        if trace.needs_escalation and approval_path == ApprovalPath.AUTO_EXECUTE:
            approval_path = ApprovalPath.CREATOR_REVIEW

        needs_escalation = approval_path in (
            ApprovalPath.CREATOR_REVIEW,
            ApprovalPath.DUAL_APPROVAL,
        )

        escalation_reason: str | None = trace.escalation_reason
        if needs_escalation and not escalation_reason:
            if approval_path == ApprovalPath.CREATOR_REVIEW:
                escalation_reason = (
                    f"Low representational confidence ({repr_confidence:.2f}) — "
                    "creator review needed before acting"
                )
            else:
                escalation_reason = (
                    f"High-stakes action (consequentiality {consequentiality:.2f}) "
                    f"with low confidence ({repr_confidence:.2f}) — dual approval required"
                )

        return ApprovalDecision(
            repr_confidence=repr_confidence,
            consequentiality=consequentiality,
            approval_path=approval_path,
            confidence=repr_confidence,      # backwards-compat alias
            needs_escalation=needs_escalation,
            escalation_reason=escalation_reason,
        )


# ---------------------------------------------------------------------------
# Representational confidence scorer
# ---------------------------------------------------------------------------

def _score_representational(
    trace: ReasoningTrace,
    response_text: str,
    prior_responses: list[str],
) -> float:
    """
    How faithfully does this response represent the owner?
    Combines trace-level signals with contradiction detection.
    """
    confidence = trace.confidence

    # Penalize: slow path with no supporting evidence
    if trace.path == "slow" and not trace.sources:
        confidence *= 0.85

    # Penalize: reasoning scratchpad signaled uncertainty
    if trace.path == "slow" and "not sure" in trace.private_scratchpad.lower():
        confidence = min(confidence, 0.65)

    # Penalize: stark contradiction with recent responses
    if _detect_contradiction(response_text, prior_responses):
        confidence *= 0.70

    # Floor at escalation_threshold from settings (already in config)
    # — but don't modify; routing handles the escalation logic.
    return max(0.0, min(1.0, confidence))


# ---------------------------------------------------------------------------
# Consequentiality scorer
# ---------------------------------------------------------------------------

def _score_consequentiality(
    perceived: PerceivedInput | None,
    message: str,
) -> float:
    """
    How high-stakes is this action? What's the blast radius if wrong?

    Inputs:
      - perceived.stakes from the perception layer
      - keyword signals in the message/response text
    """
    # Base score from perceived stakes
    if perceived is not None:
        base_map = {"low": 0.15, "medium": 0.45, "high": 0.75}
        score = base_map.get(perceived.stakes, 0.45)
    else:
        score = 0.45  # default: medium stakes when perception unavailable

    lower = message.lower()

    # High-consequentiality: destructive operations
    if any(kw in lower for kw in ("delete", "remove", "clear", "wipe", "cancel", "drop", "close")):
        score = min(1.0, score + 0.25)

    # High-consequentiality: external communications
    if any(kw in lower for kw in ("send", "post", "publish", "reply", "forward", "share", "broadcast", "email", "message")):
        score = min(1.0, score + 0.20)

    # High-consequentiality: irreversible commits
    if any(kw in lower for kw in ("commit", "merge", "deploy", "push", "submit", "approve", "sign")):
        score = min(1.0, score + 0.20)

    # Maximum consequentiality: financial actions
    if any(kw in lower for kw in ("pay", "payment", "invoice", "transfer", "charge", "refund", "billing", "purchase")):
        score = min(1.0, score + 0.35)

    # Low-consequentiality: read-only operations (only reduces if already low)
    if score < 0.40 and any(kw in lower for kw in ("search", "find", "list", "show", "get", "read", "look up", "fetch", "check")):
        score = max(0.05, score - 0.10)

    return max(0.0, min(1.0, score))


# ---------------------------------------------------------------------------
# Contradiction detector
# ---------------------------------------------------------------------------

def _detect_contradiction(response: str, prior_responses: list[str]) -> bool:
    """
    Simple heuristic: catches obvious inversions across the last 3 responses.
    """
    if not prior_responses:
        return False

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
