"""The guards on every request (3.4.1): no cross-site writes, no cached link answers, no placeholder secret."""

import pytest

from app.main import check_secret
from app.services.guard import NO_STORE_PREFIXES, allowed_origins, cross_site_write


def _scope(method="POST", path="/api/lists", **headers):
    return {"type": "http", "method": method, "path": path, "scheme": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]}


def test_a_write_from_another_site_is_refused(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "public_url", "https://family.example.com")
    assert cross_site_write(_scope(host="family.example.com", origin="https://evil.example")) is True
    assert cross_site_write(_scope(host="family.example.com", origin="null")) is True
    # The app's own pages, as the proxy, the host or the configured address says them.
    assert cross_site_write(_scope(host="family.example.com", origin="https://family.example.com")) is False
    assert cross_site_write(_scope(host="backend:8000", **{"x-forwarded-host": "localhost:3000", "x-forwarded-proto": "http"}, origin="http://localhost:3000")) is False
    assert cross_site_write(_scope(host="backend:8000", origin="https://family.example.com")) is False
    # Without Origin (curl, the tests), and for reads, nothing is refused.
    assert cross_site_write(_scope(host="family.example.com")) is False
    assert cross_site_write(_scope(method="GET", host="family.example.com", origin="https://evil.example")) is False
    assert cross_site_write(_scope(path="/api/csp-report", host="family.example.com", origin="https://evil.example")) is False
    # The configured address is one of the request's own origins (a set, so this is membership, not a substring).
    assert allowed_origins(_scope(host="family.example.com")) >= {"https://family.example.com"}


async def test_the_middleware_answers_403_and_marks_links_no_store(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123"})
    refused = await client.post("/api/lists", json={"name": "x"}, headers={"Origin": "https://evil.example"})
    assert refused.status_code == 403 and refused.json()["detail"] == "Cross-site request refused"
    assert (await client.post("/api/lists", json={"name": "x"}, headers={"Origin": "http://test"})).status_code == 201
    created = (await client.post("/api/guests", json={"name": "Babysitter Sara", "hours": 5})).json()
    seen = await client.get(f"/api/guest/{created['url'].rsplit('/', 1)[1]}")
    assert seen.status_code == 200 and seen.headers["cache-control"] == "no-store, private"
    assert "cache-control" not in (await client.get("/api/lists")).headers
    assert all(p.startswith("/api/") for p in NO_STORE_PREFIXES)


def test_the_placeholder_secret_is_refused():
    with pytest.raises(RuntimeError):
        check_secret("change-me-in-.env")
    with pytest.raises(RuntimeError):
        check_secret("short")
    check_secret("e2e-only-not-a-secret-just-long-enough-for-hs256")
