"""Async SQLAlchemy engine + session factory."""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from doppel.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,  # never echo in prod — generates massive logs and adds latency
    pool_size=20,        # enough for concurrent sessions per request
    max_overflow=30,
    pool_pre_ping=False, # pre_ping adds a round-trip per checkout; use pool_recycle instead
    pool_recycle=600,    # recycle connections every 10 min to avoid stale connections
    pool_timeout=10,     # fail fast if pool exhausted rather than hanging
    connect_args={"command_timeout": 10},  # kill runaway queries after 10s
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    """FastAPI dependency — yields a db session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # Only commit if there's an active transaction (endpoint may have already committed)
            if session.in_transaction():
                await session.commit()
        except Exception:
            if session.in_transaction():
                await session.rollback()
            raise
