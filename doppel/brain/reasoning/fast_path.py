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
            interview_topic = brain_input.metadata.get("interview_topic", "").strip()
            topic_line = (
                f"\n- The topic for this session is: **{interview_topic}**. "
                "Stay focused on this topic throughout. Every question must dig deeper into it — "
                "don't drift to other subjects unless the creator explicitly steers you there."
            ) if interview_topic else ""
            system_prompt += (
                "\n\n## Training Mode — Active Knowledge Extraction\n"
                "You are in a live training session with your creator. Your single job: extract as much "
                "knowledge, opinion, lived experience, and nuance from them as possible.\n"
                f"Rules:\n"
                f"- Every response MUST end with exactly one specific, targeted question — no exceptions.{topic_line}\n"
                "- Ask about concrete experiences, not abstract opinions. 'Tell me about a time when...' > 'What do you think about...'\n"
                "- After each answer, dig one level deeper: follow the most interesting thread, ask for the story behind it.\n"
                "- Questions should get progressively more specific as the conversation continues — don't keep asking at the same surface level.\n"
                "- Keep your own text SHORT — 1 sentence of acknowledgement max, then the question. You are here to listen, not to perform.\n"
                "- Never summarise what you already know. Only probe what you don't.\n"
                "- If an answer is thin, push for specifics: 'Can you give me a concrete example?' or 'What happened specifically?'\n"
                "- Be warm but direct — this is a conversation, not an interrogation."
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
    if brain_input.metadata.get("_knowledge_gap"):
        system_prompt += (
            "\n\n## Memory match was weak — clarify before deflecting\n"
            "The memory search didn't find a strong direct match for this question. "
            "That often means the person phrased it differently from how your knowledge is stored — not that you don't know. "
            "Ask ONE short, specific clarifying question to understand exactly what they're after. "
            "For example: 'Are you asking about X, or more about Y?' "
            "Only say you genuinely don't have information after you've tried to understand what they're actually asking."
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
        max_tokens=1800,
        system=system_prompt,
        messages=[{"role": "user", "content": _user_msg_content}],
    ) as stream:
        async for text_chunk in stream.text_stream:
            full_text += text_chunk
            yield "token", text_chunk

    confidence = _compute_fast_confidence(memory)
    trace = ReasoningTrace(
        path="fast",
        framing=f"Fast path: {perceived.intent} / {perceived.stakes} stakes",
        retrieved_context_summary=f"{len(memory.episodic)} episodic, {len(memory.semantic)} semantic chunks",
        confidence=confidence,
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
    if brain_input.context_type == "training":
        is_owner = brain_input.metadata.get("training_owner", False) or brain_input.owner_mode
        if is_owner:
            interview_topic = brain_input.metadata.get("interview_topic", "").strip()
            topic_line = (
                f"\n- The topic for this session is: **{interview_topic}**. "
                "Stay focused on this topic throughout. Every question must dig deeper into it — "
                "don't drift to other subjects unless the creator explicitly steers you there."
            ) if interview_topic else ""
            system_prompt += (
                "\n\n## Training Mode — Active Knowledge Extraction\n"
                "You are in a live training session with your creator. Your single job: extract as much "
                "knowledge, opinion, lived experience, and nuance from them as possible.\n"
                f"Rules:\n"
                f"- Every response MUST end with exactly one specific, targeted question — no exceptions.{topic_line}\n"
                "- Ask about concrete experiences, not abstract opinions. 'Tell me about a time when...' > 'What do you think about...'\n"
                "- After each answer, dig one level deeper: follow the most interesting thread, ask for the story behind it.\n"
                "- Questions should get progressively more specific as the conversation continues — don't keep asking at the same surface level.\n"
                "- Keep your own text SHORT — 1 sentence of acknowledgement max, then the question. You are here to listen, not to perform.\n"
                "- Never summarise what you already know. Only probe what you don't.\n"
                "- If an answer is thin, push for specifics: 'Can you give me a concrete example?' or 'What happened specifically?'\n"
                "- Be warm but direct — this is a conversation, not an interrogation."
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
        max_tokens=1800,
        system=system_prompt,
        messages=[{"role": "user", "content": _user_msg_content}],
    )

    response_text = response.content[0].text.strip()

    # Build a minimal trace with real confidence from memory signal
    sources = _extract_sources(memory)
    confidence = _compute_fast_confidence(memory)
    trace = ReasoningTrace(
        path="fast",
        framing=f"Fast path: {perceived.intent} / {perceived.stakes} stakes",
        retrieved_context_summary=f"{len(memory.episodic)} episodic, {len(memory.semantic)} semantic chunks",
        confidence=confidence,
        sources=sources,
    )

    return response_text, trace


def _compute_fast_confidence(memory: MemoryContext) -> float:
    """
    Compute real confidence from retrieved memory signal.
    - High (0.82–0.92): rich episodic + semantic context
    - Medium (0.58–0.72): some relevant chunks
    - Low (0.35–0.50): little or no matching memory
    """
    episodic_count  = len(memory.episodic)
    semantic_count  = len(memory.semantic)
    total           = episodic_count + semantic_count

    if total == 0:
        return 0.38  # nothing retrieved — genuinely uncertain

    # Episodic memories are richer signal than semantic
    weighted = episodic_count * 1.5 + semantic_count * 1.0

    # Check similarity scores if available (episodic MemoryEntry has .relevance or .similarity)
    top_scores: list[float] = []
    for entry in memory.episodic[:3]:
        score = getattr(entry, "relevance", None) or getattr(entry, "similarity", None)
        if score is not None:
            top_scores.append(float(score))
    for entry in memory.semantic[:2]:
        score = getattr(entry, "relevance", None) or getattr(entry, "similarity", None)
        if score is not None:
            top_scores.append(float(score))

    avg_score = sum(top_scores) / len(top_scores) if top_scores else 0.65

    # Base confidence from quantity
    if weighted >= 8:
        base = 0.88
    elif weighted >= 4:
        base = 0.74
    elif weighted >= 2:
        base = 0.60
    else:
        base = 0.45

    # Scale by similarity quality — high avg score boosts confidence, low drags it
    quality_adjustment = (avg_score - 0.65) * 0.20   # ±0.13 range
    confidence = max(0.30, min(0.95, base + quality_adjustment))

    return round(confidence, 2)


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
            "No memory matched the exact phrasing of this question. "
            "This does NOT mean you don't have relevant knowledge — it means the vocabulary "
            "used in the question didn't align with how the information was stored. "
            "Before deciding you have nothing to offer:\n"
            "1. Re-read the question and think about what broader topic or concept it's really about.\n"
            "2. Consider synonyms or related framings — 'overseas contacts' could be 'international clients', "
            "'abroad', 'foreign partners'. 'The BT thing' could be anything in your past with BT.\n"
            "3. If you have any partial knowledge on the topic, share it — then ask one specific question "
            "to confirm you're on the right track.\n"
            "4. Only say you genuinely lack information if you've exhausted all reasonable interpretations."
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

4. **Appropriate length for the question.** Match your response length to the complexity of
   what was asked. Simple factual questions: 1–3 sentences. Complex multi-part questions,
   requests for opinions, or topics you have real things to say about: go longer. Never pad,
   never truncate mid-thought.

5. **Try multiple interpretations before giving up.** When the retrieved memories feel loosely
   related or not quite matching the question, do not immediately say you don't know. Instead:
   - Ask yourself: "What is this person ACTUALLY trying to understand?"
   - Try to map their phrasing to what you know: "conflict" might be in your memories as
     "disagreement", "dispute", "pushback". "risk" might appear as "uncertainty", "downside",
     "exposure". Match the concept, not the exact word.
   - If a retrieved memory is adjacent — same domain, related topic — use it. Partial answers
     are better than deflections.
   - Only after exhausting reasonable interpretations: ask ONE short clarifying question.

6. **Clarify before deflecting.** If you genuinely have nothing usable, ask one short clarifying
   question to narrow it down: "Are you asking about X or more about Y?" Never say "I don't know"
   or "I don't have information on that" as a first response. Never refuse to engage.

7. **Non-standard English — interpret, don't penalise.** The person's message may be informal,
   abbreviated, misspelled, or in non-native English. Always interpret the intent, not the
   literal words. Examples:
   - "wat u think bout risk" → "what's your view on risk-taking"
   - "how u do decisons" → "how do you make decisions"
   - "tell me bout the BT thing" → find anything in memories related to BT, British Telecom,
     or whatever BT refers to in context
   - "that thing u said about X" → search memories for X and adjacent concepts
   Answer naturally based on what you understood. Never comment on their grammar or phrasing.
   Only ask for clarification if the message is genuinely ambiguous even after charitable
   interpretation — and then ask ONE specific question to resolve it.

8. **Prefer specific over vague.** When answering, ground your response in concrete detail from
   your memories — names, dates, decisions, specific situations. "I usually prefer X" is weaker
   than "When I handled [situation], I did X because Y." The retrieved context gives you the
   raw material — use it.
"""
