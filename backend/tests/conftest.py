"""Pytest configuration and fixtures.

As the project grows, this is where we'll put fixtures for:
- Test database (in-memory SQLite or test Postgres)
- Authenticated test client
- Sample family/user data
"""

import pytest


@pytest.fixture
def anyio_backend() -> str:
    """Force asyncio backend for anyio (used by httpx etc.)."""
    return "asyncio"
