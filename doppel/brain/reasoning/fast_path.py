"""
Fast path (System 1): RAG → style-injected response.
Used for low-stakes questions, social messages, and simple tasks.
No private scratchpad. Target latency: <800ms.
"""
from __future__ import annotations

import anthropic
from typing import AsyncGenerator

from doppel.brain.context import get_anthropic_key
from doppel.brain.models.types import (
    BrainInput,
    MemoryContext,
    PerceivedInput,
    ReasoningTrace,
    SourceRef,
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
    Streaming fast path — yields ("token", text_chunk) events then ("done", (full_text, trace)).
    """
    context_block = mem_system.render_context_block(memory, working)
    system_prompt = identity.render_persona_block() + "\n\n" + _FAST_INSTRUCTIONS
    user_content = _build_user_message(brain_input.message, context_block, perceived)
    sources = _extract_sources(memory)
    full_text = ""

    async with anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.stream(
        model=settings.reasoning_model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        async for text_chunk in stream.text_stream:
            full_text += text_chunk
            yield "token", text_chunk

    trace = ReasoningTrace(
        path="fast",
        framing=f"Fast path: {perceived.intent} / {perceived.stakes} stakes",
        retrieved_context_summary=f"{len(memory.episodic)} episodic, {len(memory.semantic)} semantic chunks",
        confidence=0.75,
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
    Fast path: build context from retrieved memory, inject style, generate response.
    Returns (response_text, ReasoningTrace).
    """
    context_block = mem_system.render_context_block(memory, working)

    system_prompt = (
        identity.render_persona_block()
        + "\n\n"
        + _FAST_INSTRUCTIONS
    )

    user_content = _build_user_message(brain_input.message, context_block, perceived)

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )

    response_text = response.content[0].text.strip()

    # Build a minimal trace for the fast path
    sources = _extract_sources(memory)
    trace = ReasoningTrace(
        path="fast",
        framing=f"Fast path: {perceived.intent} / {perceived.stakes} stakes",
        retrieved_context_summary=f"{len(memory.episodic)} episodic, {len(memory.semantic)} semantic chunks",
        confidence=0.75,  # Fast path has a baseline confidence — metacognition will refine
        sources=sources,
    )

    return response_text, trace


def _build_user_message(message: str, context_block: str, perceived: PerceivedInput) -> str:
    parts = []
    if context_block:
        parts.append(context_block)
    parts.append(f"## Message\n{message}")
    if perceived.emotional_register in ("tense", "urgent"):
        parts.append(
            f"(Note: the emotional register of this message is {perceived.emotional_register} — "
            "calibrate your tone accordingly)"
        )
    return "\n\n".join(parts)


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


_FAST_INSTRUCTIONS = """\
## Task
Respond to the message below as yourself — drawing on your memories and knowledge.
Keep it natural. Don't over-explain. Match the expected length for this context.
If you genuinely don't know something, say so clearly rather than guessing.
"""
