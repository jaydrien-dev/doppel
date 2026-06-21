"""Async SQLAlchemy engine + session factory."""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from doppel.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,   # ping before checkout — catches closed connections (near-free with asyncpg)
    pool_recycle=300,     # recycle every 5 min — shorter than Supabase/PgBouncer idle timeout
    pool_timeout=10,
    connect_args={"command_timeout": 10},
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
