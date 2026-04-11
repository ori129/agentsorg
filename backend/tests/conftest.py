import os

# Tests run over http://test (not HTTPS), so secure cookies would be dropped
# by HTTPX. Force this before the app module is imported so Settings picks it up.
os.environ.setdefault("COOKIE_SECURE", "false")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app
from app.database import get_db

# ---------------------------------------------------------------------------
# Database setup — use real PostgreSQL (pgvector-enabled)
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://agentsorg:changeme@postgres:5432/agentsorg_test",
)


def _build_engine():
    return create_async_engine(TEST_DATABASE_URL, echo=False)


@pytest_asyncio.fixture(scope="function")
async def db_session():
    # Import models *after* the pgvector patch so Base.metadata is clean
    from app.models.models import Base  # noqa: PLC0415

    engine = _build_engine()
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


def _set_limiters_enabled(enabled: bool):
    """Enable/disable all known Limiter instances in the app."""
    import importlib
    for mod_name in ("app.main", "app.routers.auth"):
        try:
            mod = importlib.import_module(mod_name)
            if hasattr(mod, "limiter"):
                mod.limiter.enabled = enabled
        except Exception:
            pass


async def _register_user(ac):
    """Register a fresh admin user and return the bearer token."""
    resp = await ac.post(
        "/api/v1/auth/register",
        json={"email": "testadmin@example.com", "password": "testpassword123"},
    )
    assert resp.status_code == 200, f"register failed: {resp.text}"
    return resp.json()["token"]


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession):
    # Disable rate limiting so tests don't trip over each other's counters.
    _set_limiters_enabled(False)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
    _set_limiters_enabled(True)


@pytest_asyncio.fixture(scope="function")
async def registered_client(client: AsyncClient):
    """Like `client`, but with a registered admin user already logged in."""
    await _register_user(client)
    yield client
