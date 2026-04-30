"""
ReasoningEngine: orchestrates the fast/slow path decision and delegates accordingly.
This is the brain's "thinking" coordinator.
"""
from __future__ import annotations

from doppel.brain.identity.layer import IdentityLayer
from doppel.brain.memory.system import MemorySystem
from doppel.brain.memory.working import WorkingMemoryTurn
from doppel.brain.models.types import (
    BrainInput,
    MemoryContext,
    PerceivedInput,
    ReasoningTrace,
)
from doppel.brain.reasoning import fast_path, slow_path
from doppel.brain.reasoning.router import route


class ReasoningEngine:
    """
    Routes each input to the fast or slow path and returns
    the (response_text, reasoning_trace) pair.
    """

    async def think(
        self,
        brain_input: BrainInput,
        perceived: PerceivedInput,
        memory: MemoryContext,
        working: list[WorkingMemoryTurn],
        identity: IdentityLayer,
        mem_system: MemorySystem,
    ) -> tuple[str, ReasoningTrace]:
        path = route(perceived)

        if path == "fast":
            return await fast_path.run(
                brain_input=brain_input,
                perceived=perceived,
                memory=memory,
                working=working,
                identity=identity,
                mem_system=mem_system,
            )
        else:
            return await slow_path.run(
                brain_input=brain_input,
                perceived=perceived,
                memory=memory,
                working=working,
                identity=identity,
                mem_system=mem_system,
            )
