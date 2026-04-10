from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db_base import Base


def _async_database_url(url: str) -> str:
    """Runtime API must use asyncpg; Alembic uses psycopg2 via env.py."""
    if "+asyncpg" in url:
        return url
    if url.startswith("postgresql+psycopg2"):
        return url.replace("postgresql+psycopg2", "postgresql+asyncpg", 1)
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgresql://")
    return url


settings = get_settings()
engine = create_async_engine(
    _async_database_url(settings.database_url),
    echo=settings.debug,
)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Dev-only helper. Prefer `alembic upgrade head` for schema management."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
