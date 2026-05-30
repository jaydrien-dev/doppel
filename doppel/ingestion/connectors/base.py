"""
Base connector interface. Every data source (Gmail, Slack, etc.) implements this.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import AsyncIterator
from uuid import UUID

from pydantic import BaseModel


class RawItem(BaseModel):
    """
    A single piece of raw content yielded by a connector.
    The pipeline preprocesses, chunks, and embeds these.
    """
    content: str                        # raw body text (may be HTML)
    content_type: str = "text"          # text | html
    source: str                         # gmail | slack | upload | notion
    authored_by_user: bool = True
    context_type: str = "email_reply"   # email_reply | message | document | decision
    created_at: datetime
    metadata: dict = {}                 # subject, recipients, thread_id, etc.
    source_ref: str | None = None       # filename for uploads, thread_id for slack, etc.


class BaseConnector(ABC):
    """
    Abstract base for all ingestion connectors.
    Subclasses implement `fetch_items` as an async generator.
    """

    @abstractmethod
    async def fetch_items(
        self,
        clone_id: UUID,
        since_days: int,
    ) -> AsyncIterator[RawItem]:
        """
        Yield RawItems from the data source.
        Implementations should:
        - Handle pagination transparently
        - Respect rate limits with async sleeps
        - Log (not raise) per-item errors so the pipeline continues
        """
        ...
