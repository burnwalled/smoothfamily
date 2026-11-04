import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["LIVE_EVENTS"] = "false"
os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="sf-test-media-")

import asyncio  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def short_passwords(monkeypatch):
    """Most tests make adults with short passwords; the 12-character default has its own test."""
    from app.services import security_policy

    monkeypatch.setitem(security_policy.DEFAULTS, "password_min_adult", 4)


@pytest.fixture
async def client():
    from app.services import login_throttle, mfa, security_log

    login_throttle.reset()
    mfa.reset_challenges()
    security_log.reset()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def db_session(client):  # noqa: F811 – depends on client so tables exist
    from app.database import SessionLocal
    async with SessionLocal() as session:
        yield session
