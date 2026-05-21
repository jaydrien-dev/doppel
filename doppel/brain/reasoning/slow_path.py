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
    extended_thinking: bool = False,
) -> AsyncGenerator[tuple[str, object], None]:
    """
    Streaming slow path — yields "thinking", then ("token", chunk) events, then ("done", (full_text, trace)).
    extended_thinking=True enables Claude's built-in thinking with budget_tokens=10000.
    """
    from doppel.brain.metacognition.escalation import format_escalation_message

    depth = "extended" if extended_thinking else "pro"
    context_block = mem_system.render_context_block(memory, working)
    yield "thinking", ""

    scratchpad = await _run_scratchpad(
        message=brain_input.message,
        context_block=context_block,
        identity=identity,
        perceived=perceived,
        depth=depth,
        consumer_brain=brain_input.metadata.get("consumer_brain", ""),
        image_b64=brain_input.metadata.get("image_base64"),
        image_media_type=brain_input.metadata.get("image_media_type", "image/jpeg"),
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

    _slow_system = identity.render_persona_block()
    _slow_consumer_ctx = brain_input.metadata.get("consumer_context")
    if _slow_consumer_ctx:
        _slow_system += f"\n\n## About the person you're talking to\n{_slow_consumer_ctx}"
    _slow_consumer_brain = brain_input.metadata.get("consumer_brain")
    if _slow_consumer_brain:
        _slow_system += f"\n\n## What they've shared about themselves\n{_slow_consumer_brain}"
    _slow_teaching_topic = brain_input.metadata.get("lesson_topic", "")
    if _slow_teaching_topic:
        _slow_system += (
            f"\n\n## Teaching Mode\n"
            f"Lesson: **{_slow_teaching_topic}**\n"
            f"Structure: (1) Core concept. (2) Example. (3) Hands-on exercise. Calibrate to their level."
        )
    if brain_input.context_type == "training":
        _is_owner = brain_input.metadata.get("training_owner", False)
        if _is_owner:
            _slow_system += (
                "\n\n## Training Mode — Knowledge Gap Filling\n"
                "You are in active training with your creator. Identify gaps in your own knowledge and ask "
                "focused questions to fill them. Be methodical: one topic at a time, probe deeply. "
                "Every response ends with exactly one specific question. Draw knowledge out, don't lecture."
            )
        else:
            _slow_system += (
                "\n\n## Training Mode — Consumer Onboarding\n"
                "You are learning about this person. Ask structured questions about their background, goals, "
                "and how they think. One question at a time. Acknowledge each answer before moving on. "
                "Every response ends with exactly one focused question."
            )

    _slow_messages = [{
        "role": "user",
        "content": _build_response_prompt(brain_input.message, scratchpad, brain_input.context_type, depth=depth),
    }]

    _image_b64 = brain_input.metadata.get("image_base64")
    if _image_b64:
        _slow_messages = [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": brain_input.metadata.get("image_media_type", "image/jpeg"), "data": _image_b64}},
                {"type": "text", "text": _slow_messages[0]["content"]},
            ],
        }]

    full_text = ""
    client = anthropic.AsyncAnthropic(api_key=get_anthropic_key())

    if extended_thinking:
        # Claude extended thinking: budget_tokens=10000, max_tokens must exceed budget
        async with client.messages.stream(
            model=settings.reasoning_model,
            max_tokens=16000,
            thinking={"type": "enabled", "budget_tokens": 10000},
            system=_slow_system,
            messages=_slow_messages,
        ) as stream:
            async for text_chunk in stream.text_stream:
                full_text += text_chunk
                yield "token", text_chunk
    else:
        async with client.messages.stream(
            model=settings.reasoning_model,
            max_tokens=1500,
            system=_slow_system,
            messages=_slow_messages,
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
        consumer_brain=brain_input.metadata.get("consumer_brain", ""),
        image_b64=brain_input.metadata.get("image_base64"),
        image_media_type=brain_input.metadata.get("image_media_type", "image/jpeg"),
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
    depth: str = "pro",
    consumer_brain: str = "",
    image_b64: str | None = None,
    image_media_type: str = "image/jpeg",
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
        depth=depth,
        consumer_brain=consumer_brain,
    )

    max_tokens = 3000 if depth == "extended" else 2048

    # If a screen capture was provided, include it so the scratchpad can reason about it
    if image_b64:
        scratchpad_content = [
            {"type": "image", "source": {"type": "base64", "media_type": image_media_type, "data": image_b64}},
            {"type": "text", "text": scratchpad_prompt},
        ]
    else:
        scratchpad_content = scratchpad_prompt

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": scratchpad_content}],
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
    depth: str = "pro",
    consumer_brain: str = "",
) -> str:
    values = identity.values

    consumer_brain_block = f"\n\n## What the person has shared about themselves\n{consumer_brain}" if consumer_brain else ""

    base = f"""\
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
{context_block or 'No directly relevant past context found.'}{consumer_brain_block}

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
Be specific about which memories directly support your answer. Don't just list options — rank them
by how well they fit this person's values and the actual context.
"""

    if depth == "extended":
        base += f"""
## Extended reasoning (do this before producing JSON)

Work through the following before settling on your answer:

1. **Challenge your initial framing.** What is the most obvious interpretation of this message?
   Now ask: is that actually what's being asked, or is there a different underlying need?

2. **What does this person actually need vs what they literally asked?** Consider the context,
   the relationship, the stakes. Sometimes the literal question is a proxy for something else.

3. **Memory gaps.** What relevant context is missing from the retrieved memories that would
   meaningfully affect the answer? Name it explicitly.

4. **Second-order effects.** If {identity.clone_name} responds with the chosen approach,
   what happens next? Are there downstream consequences worth noting?

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
  "unasked_needs": "What does this person probably need to know that they didn't ask? Be specific.",
  "memory_gaps": "What relevant context is missing from the retrieved memories that would improve confidence?",
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
    else:
        base += f"""
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

    return base


def _build_response_prompt(message: str, scratchpad: dict, context_type: str, depth: str = "pro") -> str:
    if depth == "extended":
        unasked = scratchpad.get("unasked_needs", "")
        memory_gaps = scratchpad.get("memory_gaps", "")

        unasked_block = f"\nWhat they may also need to know: {unasked}" if unasked else ""
        gaps_block = f"\nMemory gaps to acknowledge if relevant: {memory_gaps}" if memory_gaps else ""

        return f"""\
Based on your private reasoning, craft your response to this message.

## What you decided (from your reasoning)
Chosen approach: {scratchpad.get('chosen_option', '')}
Core reasoning: {scratchpad.get('reasoning', '')}
Your priorities here: {', '.join(scratchpad.get('priorities', []))}
{unasked_block}
{gaps_block}

## The original message
{message}

## Length and depth guidance
Give a comprehensive answer. Cover the direct response AND anything they should know that they
didn't ask about — use the "unasked needs" above as a guide. Reference specific memories or
patterns when relevant. Structure your response if it benefits from it (use short paragraphs
or a list if there are genuinely multiple distinct things to say). Don't truncate — this person
wants depth. If there are memory gaps that affect your confidence, name them honestly.

Now write your response. Sound like yourself — not a generic assistant.
"""
    else:
        length_guidance = {
            "chat": "Be thorough on what matters, concise on what doesn't. 2-5 sentences for most chat questions. More if genuinely warranted.",
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
