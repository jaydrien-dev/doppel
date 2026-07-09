"""
FeedbackProcessor: ingests user corrections and approvals.
Every edit or rejection is a training signal that makes the clone better.
"""
from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.models.types import FeedbackSignal


async def record_feedback(session: AsyncSession, feedback: FeedbackSignal) -> None:
    """
    Store feedback against the reasoning trace.
    This is the primary data pipeline for future DPO fine-tuning.
    Also updates the clone's calibration_score via exponential moving average
    so future confidence scores reflect actual approval history.
    """
    await session.execute(
        text("""
            UPDATE reasoning_traces
            SET feedback_signal    = :signal_type,
                corrected_response = :corrected,
                correction_reason  = :reason
            WHERE id = :trace_id
        """),
        {
            "trace_id": str(feedback.trace_id),
            "signal_type": feedback.signal_type,
            "corrected": feedback.corrected_response,
            "reason": feedback.correction_reason,
        },
    )

    # Update calibration score using exponential moving average (alpha=0.15)
    # approved=1.0, edited=0.7, rejected=0.0
    _signal_values = {"approved": 1.0, "edited": 0.7, "rejected": 0.0}
    if feedback.signal_type in _signal_values:
        signal_val = _signal_values[feedback.signal_type]
        await session.execute(
            text("""
                UPDATE clone_identity
                SET calibration_score = GREATEST(0.0, LEAST(1.0,
                        0.15 * :signal + 0.85 * calibration_score)),
                    feedback_count = feedback_count + 1
                WHERE clone_id = :clone_id
            """),
            {"signal": signal_val, "clone_id": str(feedback.clone_id)},
        )

    await session.commit()


async def get_training_pairs(
    session: AsyncSession,
    clone_id: UUID,
    min_pairs: int = 50,
) -> list[dict]:
    """
    Retrieve (rejected, preferred) pairs for DPO fine-tuning.
    Returns pairs where the user edited the response — the edit is the "preferred" response.
    """
    result = await session.execute(
        text("""
            SELECT
                brain_input->>'message' AS prompt,
                response               AS rejected,
                corrected_response     AS preferred,
                private_scratchpad
            FROM reasoning_traces
            WHERE clone_id = :clone_id
              AND feedback_signal = 'edit'
              AND corrected_response IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 500
        """),
        {"clone_id": str(clone_id)},
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


async def should_trigger_training(
    session: AsyncSession,
    clone_id: UUID,
    threshold: int = 50,
) -> bool:
    """
    Check if we have enough new feedback signals to warrant a training run.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(*) as cnt
            FROM reasoning_traces
            WHERE clone_id = :clone_id
              AND feedback_signal IN ('edit', 'reject')
              AND corrected_response IS NOT NULL
              -- Only count signals since last training (would check a training_runs table in prod)
              AND created_at > NOW() - INTERVAL '7 days'
        """),
        {"clone_id": str(clone_id)},
    )
    row = result.mappings().first()
    return (row["cnt"] if row else 0) >= threshold
