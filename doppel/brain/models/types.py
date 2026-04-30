"""
All Pydantic types for the Doppel Brain.
These flow through every layer of the cognitive architecture.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# INPUT
# ---------------------------------------------------------------------------

class BrainInput(BaseModel):
    clone_id: UUID
    session_id: UUID = Field(default_factory=uuid4)
    message: str
    context_type: Literal["chat", "email_draft", "meeting", "decision"] = "chat"
    sender_id: Optional[str] = None        # who is talking to the clone
    sender_name: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# PERCEPTION
# ---------------------------------------------------------------------------

class PerceivedInput(BaseModel):
    """Output of the Perception layer — understanding of what this input is."""
    intent: Literal["question", "decision", "task", "social", "emotional"]
    stakes: Literal["low", "medium", "high"]
    is_novel: bool          # outside the clone's training distribution
    urgency: float          # 0.0–1.0
    entities: list[str]     # named entities extracted (people, orgs, products)
    topics: list[str]       # semantic topics
    requires_decision: bool # does this need the clone to make a choice?
    emotional_register: Literal["neutral", "positive", "tense", "urgent", "formal"]


# ---------------------------------------------------------------------------
# MEMORY
# ---------------------------------------------------------------------------

class MemoryChunk(BaseModel):
    """A single retrieved piece of episodic memory."""
    id: UUID
    content: str
    source: str                         # gmail | slack | upload | chat
    authored_by_user: bool
    similarity_score: float             # 0.0–1.0, cosine similarity
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeFact(BaseModel):
    """A structured semantic fact the clone knows."""
    id: UUID
    fact: str
    domain: str
    confidence: float
    source_count: int                   # how many sources support this


class DecisionPattern(BaseModel):
    """A procedural pattern: how the user typically handles a type of situation."""
    id: UUID
    pattern_type: str                   # decision_heuristic | communication_norm | priority_rule
    description: str
    examples: list[str]
    confidence: float
    occurrence_count: int


class ContactMemory(BaseModel):
    """What the clone knows about a specific person."""
    contact_identifier: str
    contact_name: Optional[str]
    relationship_type: Optional[str]    # teammate | investor | client | friend
    interaction_summary: str            # narrative summary
    communication_style_notes: str      # how user talks to this person
    last_interaction: Optional[datetime]


class MemoryContext(BaseModel):
    """Aggregated memory retrieved for a given input."""
    episodic: list[MemoryChunk] = Field(default_factory=list)
    semantic: list[KnowledgeFact] = Field(default_factory=list)
    procedural: list[DecisionPattern] = Field(default_factory=list)
    relational: Optional[ContactMemory] = None

    def is_empty(self) -> bool:
        return not self.episodic and not self.semantic and not self.procedural


class WorkingMemoryTurn(BaseModel):
    """A single turn in the session working memory."""
    role: Literal["user", "clone"]
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    confidence: Optional[float] = None


# ---------------------------------------------------------------------------
# IDENTITY
# ---------------------------------------------------------------------------

class StyleFingerprint(BaseModel):
    """
    Extracted writing and communication style.
    Used as a constant constraint on every response.
    """
    # Writing patterns
    avg_sentence_length: float = 15.0           # words
    preferred_formality: float = 0.6            # 0=casual, 1=formal
    uses_hedging: bool = True                   # "I think", "maybe", "probably"
    hedging_frequency: float = 0.3             # fraction of responses with hedges
    uses_bullet_points: bool = True
    uses_em_dash: bool = False
    oxford_comma: bool = True
    emoji_frequency: float = 0.0                # fraction of messages with emoji

    # Greeting / closing
    greeting_patterns: list[str] = Field(default_factory=lambda: ["Hi", "Hey"])
    closing_patterns: list[str] = Field(default_factory=lambda: ["Best,", "Thanks,"])

    # Tone
    directness: float = 0.7                     # 0=indirect, 1=very direct
    warmth: float = 0.6                         # 0=cold/transactional, 1=warm
    humor_frequency: float = 0.1                # fraction of messages with humor

    # Vocabulary
    top_phrases: list[str] = Field(default_factory=list)  # recurring phrases
    avoided_words: list[str] = Field(default_factory=list)

    # Length norms by context
    email_reply_length: Literal["short", "medium", "long"] = "medium"
    chat_reply_length: Literal["short", "medium", "long"] = "short"


class ValueSystem(BaseModel):
    """The user's extracted values and decision priors."""
    # Ordered list: most important first
    core_values: list[str] = Field(
        default_factory=lambda: ["quality", "honesty", "impact"]
    )
    # What they optimize for professionally
    professional_priorities: list[str] = Field(
        default_factory=lambda: ["shipping", "team", "learning"]
    )
    # Risk tolerance: 0=very risk-averse, 1=high risk tolerance
    risk_tolerance: float = 0.5
    # How they handle conflict
    conflict_style: Literal["direct", "diplomatic", "avoidant"] = "direct"
    # What they fundamentally believe about their domain
    domain_beliefs: list[str] = Field(default_factory=list)
    # Hard limits: things the clone should never say or commit to
    persona_boundaries: list[str] = Field(
        default_factory=lambda: [
            "Never make financial commitments on behalf of the user",
            "Never share information explicitly marked confidential",
            "Always identify as an AI clone, never claim to be the real person",
        ]
    )

    @field_validator("risk_tolerance", mode="before")
    @classmethod
    def coerce_risk_tolerance(cls, v: object) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                pass
            lower = v.lower()
            if any(w in lower for w in ("low", "averse", "conservative", "cautious", "safe")):
                return 0.2
            if any(w in lower for w in ("high", "bold", "aggressive", "max", "extreme")):
                return 0.8
            if any(w in lower for w in ("calculated", "moderate", "balanced", "medium", "taker")):
                return 0.6
        return 0.5

    @field_validator("conflict_style", mode="before")
    @classmethod
    def coerce_conflict_style(cls, v: object) -> str:
        if v in ("direct", "diplomatic", "avoidant"):
            return v
        if isinstance(v, str):
            lower = v.lower()
            if any(w in lower for w in ("avoid", "harmony", "peace", "indirect", "smooth")):
                return "avoidant"
            if any(w in lower for w in ("direct", "honest", "straight", "frank", "head-on", "blunt")):
                return "direct"
            # "collaborate", "together", "consult", "partner", "best outcome", etc.
            return "diplomatic"
        return "direct"


# ---------------------------------------------------------------------------
# REASONING
# ---------------------------------------------------------------------------

class SourceRef(BaseModel):
    chunk_id: UUID
    source: str
    excerpt: str                # short quote supporting the response
    similarity_score: float


class ReasoningTrace(BaseModel):
    """
    Private internal reasoning — stored but never shown to end users.
    The scratchpad is the 'thinking' step before every non-trivial response.
    """
    id: UUID = Field(default_factory=uuid4)
    path: Literal["fast", "slow"]

    # Fast path fields (populated for all traces)
    framing: str = ""                       # how the brain understood the input
    retrieved_context_summary: str = ""     # what it found relevant

    # Slow path fields (populated only for slow path)
    options_considered: list[str] = Field(default_factory=list)
    selected_approach: str = ""
    private_scratchpad: str = ""            # full Claude scratchpad output

    # Shared
    confidence: float = 0.0
    needs_escalation: bool = False
    escalation_reason: Optional[str] = None
    sources: list[SourceRef] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# OUTPUT
# ---------------------------------------------------------------------------

class BrainOutput(BaseModel):
    """Final output from the DoppelBrain.process() call."""
    response: str
    confidence: float
    needs_escalation: bool = False
    escalation_reason: Optional[str] = None
    sources: list[SourceRef] = Field(default_factory=list)
    reasoning_trace_id: UUID                # stored trace for learning loop
    path_taken: Literal["fast", "slow"]
    latency_ms: Optional[int] = None
    style_score: Optional[float] = None    # auto-eval, populated async


# ---------------------------------------------------------------------------
# FEEDBACK / LEARNING
# ---------------------------------------------------------------------------

class FeedbackSignal(BaseModel):
    """User feedback on a clone response — primary training signal."""
    trace_id: UUID
    clone_id: UUID
    signal_type: Literal["approve", "edit", "reject", "rating"]
    corrected_response: Optional[str] = None    # if edited
    correction_reason: Optional[str] = None
    rating: Optional[int] = None               # 1–5 if signal_type == "rating"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
