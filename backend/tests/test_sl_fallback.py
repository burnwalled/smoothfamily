"""SL departures: last known departures stand in when SL answers empty or fails."""
from datetime import datetime, timedelta

import httpx
import pytest

from app.services import sl

pytestmark = pytest.mark.asyncio


def _answer(*minutes: int) -> dict:
    now = datetime.now(sl._STOCKHOLM).replace(tzinfo=None, microsecond=0)
    return {
        "departures": [
            {
                "line": {"designation": "117", "transport_mode": "BUS"},
                "destination": "Spånga station",
                "scheduled": (now + timedelta(minutes=m)).isoformat(),
                "expected": (now + timedelta(minutes=m)).isoformat(),
                "state": "EXPECTED",
            }
            for m in minutes
        ]
    }


@pytest.fixture
def fake_sl(monkeypatch):
    sl._last_known.clear()
    answers: list = []

    async def fake_get(url, cache_key, ttl, empty_ttl=None):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    class NoRedis:
        async def get(self, key):
            raise ConnectionError

        async def set(self, *args, **kwargs):
            raise ConnectionError

    monkeypatch.setattr(sl, "_cached_get_json", fake_get)
    monkeypatch.setattr(sl, "_get_redis", lambda: NoRedis())
    return answers


async def test_empty_answer_serves_last_known_upcoming(fake_sl):
    fake_sl.extend([_answer(-5, 4, 12), {"departures": []}])
    fresh = await sl.departures(3872)
    assert len(fresh) == 3 and not any(d.get("stale") for d in fresh)

    stale = await sl.departures(3872)
    # The one that already left is dropped; the rest are flagged.
    assert len(stale) == 2 and all(d["stale"] for d in stale)


async def test_error_with_last_known_serves_it(fake_sl):
    fake_sl.extend([_answer(6), httpx.ConnectError("down")])
    await sl.departures(3872)
    assert [d["stale"] for d in await sl.departures(3872)] == [True]


async def test_error_without_last_known_raises(fake_sl):
    fake_sl.append(httpx.ConnectError("down"))
    with pytest.raises(httpx.HTTPError):
        await sl.departures(3872)


async def test_empty_without_last_known_is_empty(fake_sl):
    fake_sl.append({"departures": []})
    assert await sl.departures(3872) == []
