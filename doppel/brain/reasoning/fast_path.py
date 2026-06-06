"""
Fast path (System 1): RAG → style-injected response.
Used for low-stakes questions, social messages, and simple tasks.
No private scratchpad. Target latency: <800ms.
"""
from __future__ import annotations

import anthropic
from typing import AsyncGenerator

from doppel.brain.context import get_anthropic_key, get_anthropic_client
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
    consumer_ctx = brain_input.metadata.get("consumer_context")
    if consumer_ctx:
        system_prompt += f"\n\n## About the person you're talking to\n{consumer_ctx}"
    consumer_brain = brain_input.metadata.get("consumer_brain")
    if consumer_brain:
        system_prompt += f"\n\n## What they've shared about themselves\n{consumer_brain}"
    teaching_topic = brain_input.metadata.get("lesson_topic", "")
    if teaching_topic:
        system_prompt += (
            f"\n\n## Teaching Mode\n"
            f"You are now teaching. Lesson: **{teaching_topic}**\n"
            f"Structure: (1) Core concept from your specific perspective. "
            f"(2) Concrete example from your own experience. (3) One hands-on exercise.\n"
            f"Calibrate depth and language to the student's level from their profile above."
        )
    if brain_input.context_type == "training":
        is_owner = brain_input.metadata.get("training_owner", False) or brain_input.owner_mode
        if is_owner:
            system_prompt += (
                "\n\n## Training Mode — Active Knowledge Extraction\n"
                "You are in a live training session with your creator. Your single job: extract as much "
                "knowledge, opinion, lived experience, and nuance from them as possible.\n"
                "Rules:\n"
                "- Every response MUST end with exactly one specific, targeted question — no exceptions.\n"
                "- Ask about concrete experiences, not abstract opinions. 'Tell me about a time when...' > 'What do you think about...'\n"
                "- After each answer, dig one level deeper: follow the most interesting thread, ask for the story behind it.\n"
                "- Cover gaps systematically: values, decisions made under pressure, what you've failed at, what others get wrong, how you think.\n"
                "- Keep your own text SHORT — 1-3 sentences max. You are here to listen and draw out, not to perform.\n"
                "- Never summarise what you already know. Only probe what you don't.\n"
                "- If an answer is thin, gently push: 'Can you give me a concrete example?' or 'What happened specifically?'\n"
                "- Be warm and open — this is a conversation, not an interrogation. But stay relentlessly curious."
            )
        else:
            system_prompt += (
                "\n\n## Training Mode — Consumer Onboarding\n"
                "You are learning about this person so you can serve them better in future conversations. "
                "Ask structured, thoughtful questions about their background, goals, how they think, and "
                "what they need from you. One question at a time. Acknowledge each answer warmly and "
                "specifically before asking the next. Stay curious and specific — avoid generic questions. "
                "After every 3-4 questions, briefly summarise what you've learned so far. "
                "Every response must end with exactly one focused question."
            )
    user_content = _build_user_message(brain_input.message, context_block, perceived)
    sources = _extract_sources(memory)
    full_text = ""

    image_b64 = brain_input.metadata.get("image_base64")
    if image_b64:
        _user_msg_content = [
            {"type": "image", "source": {"type": "base64", "media_type": brain_input.metadata.get("image_media_type", "image/jpeg"), "data": image_b64}},
            {"type": "text", "text": user_content},
        ]
    else:
        _user_msg_content = user_content

    async with get_anthropic_client().messages.stream(
        model=settings.fast_reasoning_model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": _user_msg_content}],
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

    system_prompt = identity.render_persona_block() + "\n\n" + _FAST_INSTRUCTIONS
    consumer_ctx = brain_input.metadata.get("consumer_context")
    if consumer_ctx:
        system_prompt += f"\n\n## About the person you're talking to\n{consumer_ctx}"
    consumer_brain = brain_input.metadata.get("consumer_brain")
    if consumer_brain:
        system_prompt += f"\n\n## What they've shared about themselves\n{consumer_brain}"
    teaching_topic = brain_input.metadata.get("lesson_topic", "")
    if teaching_topic:
        system_prompt += (
            f"\n\n## Teaching Mode\n"
            f"You are now teaching. Lesson: **{teaching_topic}**\n"
            f"Structure: (1) Core concept from your specific perspective. "
            f"(2) Concrete example from your own experience. (3) One hands-on exercise.\n"
            f"Calibrate depth and language to the student's level from their profile above."
        )

    user_content = _build_user_message(brain_input.message, context_block, perceived)

    image_b64 = brain_input.metadata.get("image_base64")
    if image_b64:
        _user_msg_content = [
            {"type": "image", "source": {"type": "base64", "media_type": brain_input.metadata.get("image_media_type", "image/jpeg"), "data": image_b64}},
            {"type": "text", "text": user_content},
        ]
    else:
        _user_msg_content = user_content

    response = await get_anthropic_client().messages.create(
        model=settings.fast_reasoning_model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": _user_msg_content}],
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
        parts.append(
            f"## Retrieved memories (most relevant first)\n"
            f"The following context was retrieved for this question. "
            f"Prioritize the most specific and recent material.\n\n"
            f"{context_block}"
        )
    else:
        parts.append(
            "## Retrieved memories\n"
            "No directly relevant memories were retrieved for this question."
        )

    parts.append(
        f"## Situation\n"
        f"Intent: {perceived.intent}\n"
        f"Stakes: {perceived.stakes}\n"
        f"Emotional register: {perceived.emotional_register}\n"
        f"Topics: {', '.join(perceived.topics) if perceived.topics else 'general'}"
    )

    if perceived.emotional_register in ("tense", "urgent"):
        parts.append(
            f"Note: the emotional register of this message is {perceived.emotional_register}. "
            "Match the seriousness of the moment — don't lighten it."
        )

    parts.append(f"## Message\n{message}")
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
Respond to the message as yourself — the real person, not a generic assistant.

Rules you must follow:

1. **Draw on specific memories.** The retrieved context is there for a reason. Reference it
   concretely when it's relevant — mention actual past situations, positions you've taken,
   things you've done. Generic platitudes ("it depends", "it's complicated") are not your voice.

2. **Sound like yourself.** Your persona block defines how you communicate — sentence rhythm,
   vocabulary, directness level. Match it precisely. If you're terse in real life, be terse here.
   If you speak in short declarative bursts, do that. Do not default to an assistant voice.

3. **No filler openers.** Never start with "Great question!", "Certainly!", "Of course!",
   "Happy to help!", or any variant. Start with your actual answer.

4. **Appropriate length for chat.** 1–3 focused sentences handles most questions. Go longer
   only when the question genuinely requires more — a multi-part question, a complex topic
   you have real things to say about. Don't pad.

5. **Honest about gaps.** If the retrieved memories don't cover what they're asking, say so
   directly: "I don't have much context on that" or "I haven't thought through this one."
   Do not speculate or fill gaps with generic wisdom.
"""
