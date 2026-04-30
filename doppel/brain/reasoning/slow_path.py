"""
Slow path (System 2): private reasoning scratchpad → deliberation → response.
Used for decisions, high-stakes queries, and novel situations.
Two LLM calls:
  1. Private scratchpad — thinks like the user, generates structured reasoning JSON
  2. Response generation — collapses the scratchpad into an in-character response

Target latency: <4s end-to-end.
"""
from __future__ import annotations

import json
from typing import AsyncGenerator

import anthropic

from doppel.brain.context import get_anthropic_key
from doppel.brain.models.types import (
    BrainInput,
    MemoryContext,
    PerceivedInput,
    ReasoningTrace,
    SourceRef,
    ValueSystem,
)
from doppel.brain.identity.layer import IdentityLayer
from doppel.brain.memory.system import MemorySystem
from doppel.brain.memory.working import WorkingMemoryTurn
from doppel.config import settings


async def run_stream(
    brain_input: BrainInput,
    perceived: PerceivedInput,
    memory: MemoryContext,
    working: list[WorkingMemoryTurn],
    identity: IdentityLayer,
    mem_system: MemorySystem,
) -> AsyncGenerator[tuple[str, object], None]:
    """
    Streaming slow path — yields "thinking", then ("token", chunk) events, then ("done", (full_text, trace)).
    """
    from doppel.brain.metacognition.escalation import format_escalation_message

    context_block = mem_system.render_context_block(memory, working)
    yield "thinking", ""

    scratchpad = await _run_scratchpad(
        message=brain_input.message,
        context_block=context_block,
        identity=identity,
        perceived=perceived,
    )

    needs_escalation = scratchpad.get("needs_escalation", False)
    confidence = float(scratchpad.get("confidence", 0.6))
    escalation_reason = scratchpad.get("escalation_reason")
    sources = _extract_sources(memory)

    if needs_escalation:
        escalation_msg = format_escalation_message(identity.clone_name, escalation_reason)
        yield "token", escalation_msg
        trace = ReasoningTrace(
            path="slow",
            framing=scratchpad.get("framing", ""),
            private_scratchpad=json.dumps(scratchpad, indent=2),
            confidence=confidence,
            needs_escalation=True,
            escalation_reason=escalation_reason,
            sources=sources,
        )
        yield "done", (escalation_msg, trace)
        return

    full_text = ""
    async with anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.stream(
        model=settings.reasoning_model,
        max_tokens=1500,
        system=identity.render_persona_block(),
        messages=[{
            "role": "user",
            "content": _build_response_prompt(brain_input.message, scratchpad, brain_input.context_type),
        }],
    ) as stream:
        async for chunk in stream.text_stream:
            full_text += chunk
            yield "token", chunk

    trace = ReasoningTrace(
        path="slow",
        framing=scratchpad.get("framing", ""),
        retrieved_context_summary=scratchpad.get("relevant_context", ""),
        options_considered=scratchpad.get("options", []),
        selected_approach=scratchpad.get("chosen_option", ""),
        private_scratchpad=json.dumps(scratchpad, indent=2),
        confidence=confidence,
        needs_escalation=False,
        sources=sources,
    )
    yield "done", (full_text, trace)


async def run(
    brain_input: BrainInput,
    perceived: PerceivedInput,
    memory: MemoryContext,
    working: list[WorkingMemoryTurn],
    identity: IdentityLayer,
    mem_system: MemorySystem,
) -> tuple[str, ReasoningTrace]:
    """
    Slow path: think privately, then respond.
    Returns (response_text, ReasoningTrace).
    """
    context_block = mem_system.render_context_block(memory, working)

    # Step 1: Private reasoning scratchpad
    scratchpad = await _run_scratchpad(
        message=brain_input.message,
        context_block=context_block,
        identity=identity,
        perceived=perceived,
    )

    needs_escalation = scratchpad.get("needs_escalation", False)
    confidence = float(scratchpad.get("confidence", 0.6))
    escalation_reason = scratchpad.get("escalation_reason")

    # Step 2: Generate the actual response using the scratchpad
    response_text = await _generate_response(
        message=brain_input.message,
        scratchpad=scratchpad,
        identity=identity,
        context_type=brain_input.context_type,
        needs_escalation=needs_escalation,
    )

    sources = _extract_sources(memory)
    trace = ReasoningTrace(
        path="slow",
        framing=scratchpad.get("framing", ""),
        retrieved_context_summary=scratchpad.get("relevant_context", ""),
        options_considered=scratchpad.get("options", []),
        selected_approach=scratchpad.get("chosen_option", ""),
        private_scratchpad=json.dumps(scratchpad, indent=2),
        confidence=confidence,
        needs_escalation=needs_escalation,
        escalation_reason=escalation_reason,
        sources=sources,
    )

    return response_text, trace


async def _run_scratchpad(
    message: str,
    context_block: str,
    identity: IdentityLayer,
    perceived: PerceivedInput,
) -> dict:
    """
    The heart of the slow path.
    Ask the LLM to think like the user before generating any response.
    Returns the parsed scratchpad JSON.
    """
    scratchpad_prompt = _build_scratchpad_prompt(
        message=message,
        context_block=context_block,
        identity=identity,
        perceived=perceived,
    )

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=2048,
        messages=[{"role": "user", "content": scratchpad_prompt}],
    )

    raw = response.content[0].text.strip()
    # Extract JSON from response
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("```")

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Graceful degradation: extract what we can
        return {
            "framing": message[:200],
            "relevant_context": "Parse error in scratchpad",
            "priorities": [],
            "options": [],
            "chosen_option": "respond honestly based on available context",
            "reasoning": raw[:500],
            "confidence": 0.5,
            "needs_escalation": False,
            "escalation_reason": None,
        }


async def _generate_response(
    message: str,
    scratchpad: dict,
    identity: IdentityLayer,
    context_type: str,
    needs_escalation: bool,
) -> str:
    """
    Generate the user-facing response using the scratchpad as a guide.
    The response is styled to sound like the real person.
    """
    if needs_escalation:
        return (
            f"This is something I'd want to handle personally rather than through my clone — "
            f"let me get back to you directly on this. "
            f"({scratchpad.get('escalation_reason', 'requires my direct attention')})"
        )

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=1500,
        system=identity.render_persona_block(),
        messages=[
            {
                "role": "user",
                "content": _build_response_prompt(message, scratchpad, context_type),
            }
        ],
    )
    return response.content[0].text.strip()


def _build_scratchpad_prompt(
    message: str,
    context_block: str,
    identity: IdentityLayer,
    perceived: PerceivedInput,
) -> str:
    values = identity.values

    return f"""\
You are the INTERNAL REASONING ENGINE for {identity.clone_name}'s Doppel clone.
This reasoning is COMPLETELY PRIVATE — it will never be shown to anyone.
Your only job is to think through this situation exactly as {identity.clone_name} would.

## {identity.clone_name}'s Identity

Core values (in priority order): {', '.join(values.core_values)}
Professional priorities: {', '.join(values.professional_priorities)}
Risk tolerance: {values.risk_tolerance} (0=risk-averse, 1=risk-tolerant)
Conflict style: {values.conflict_style}
Core beliefs: {'; '.join(values.domain_beliefs[:3]) if values.domain_beliefs else 'not specified'}

## Persona Boundaries (never recommend violating these)
{chr(10).join('- ' + b for b in values.persona_boundaries)}

## Context from memory
{context_block or 'No directly relevant past context found.'}

## The message to reason about
{message}

## Situation assessment
Intent: {perceived.intent}
Stakes: {perceived.stakes}
Requires decision: {perceived.requires_decision}
Emotional register: {perceived.emotional_register}
Topics: {', '.join(perceived.topics)}

## Your reasoning task
Think through this step by step as {identity.clone_name} would. Be specific.
Then output ONLY a JSON object with this exact structure (no markdown fences):

{{
  "framing": "What is actually being asked or needed here? (1-2 sentences)",
  "relevant_context": "What from memory and knowledge bears most on this? (2-3 sentences)",
  "priorities": ["what matters most here", "second priority", "..."],
  "options": [
    "Option A: describe it specifically",
    "Option B: describe it specifically",
    "Option C: describe it specifically (if applicable)"
  ],
  "chosen_option": "Which option and specifically why — tie it to values",
  "reasoning": "The full reasoning behind the chosen option, as {identity.clone_name} would think it through",
  "confidence": 0.0,
  "needs_escalation": false,
  "escalation_reason": null
}}

confidence should be:
- 0.8–1.0: high confidence, clear context, in-distribution
- 0.5–0.8: moderate confidence, some uncertainty
- 0.3–0.5: low confidence, significant uncertainty — consider escalation
- <0.3: set needs_escalation = true

needs_escalation = true when:
- The question requires real-time information you don't have
- Making a commitment that needs actual authorization
- High-stakes situation with insufficient context to respond responsibly
- Legal, financial, or medical decisions
"""


def _build_response_prompt(message: str, scratchpad: dict, context_type: str) -> str:
    length_guidance = {
        "chat": "Keep it brief — 1-3 sentences unless depth is clearly needed.",
        "email_draft": "Write a complete email reply at appropriate length.",
        "decision": "Be clear and direct. State your recommendation and the core reason.",
        "meeting": "Be concise — meeting context, people are listening.",
    }.get(context_type, "Match the appropriate length for this context.")

    return f"""\
Based on your private reasoning, craft your response to this message.

## What you decided (from your reasoning)
Chosen approach: {scratchpad.get('chosen_option', '')}
Core reasoning: {scratchpad.get('reasoning', '')}
Your priorities here: {', '.join(scratchpad.get('priorities', []))}

## The original message
{message}

## Length guidance
{length_guidance}

Now write your response. Sound like yourself — not a generic assistant.
"""


def _extract_sources(memory: MemoryContext) -> list[SourceRef]:
    sources = []
    for chunk in memory.episodic[:5]:
        sources.append(SourceRef(
            chunk_id=chunk.id,
            source=chunk.source,
            excerpt=chunk.content[:200],
            similarity_score=chunk.similarity_score,
        ))
    return sources
