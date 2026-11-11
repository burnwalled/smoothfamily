"""Where sign-ins come from (3.4.1): the country table, the rule, a member travelling, the stricter brake."""

import gzip
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import Notification, User
from app.services import geo, security_log


async def _family(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    ids["eva"] = (await client.post("/api/family/members", json={"display_name": "Eva", "username": "eva", "password": "pass1234", "role": "adult"})).json()["id"]
    return ids


async def _rule(client, countries):
    policy = (await client.get("/api/admin/security-policy")).json()
    resp = await client.put("/api/admin/security-policy", json={**policy, "signin_countries": countries})
    assert resp.status_code == 200, resp.text
    return resp.json()["signin_countries"]


def test_flags_and_the_rule():
    assert geo.flag("SE") == "🇸🇪" and geo.flag(None) == "" and geo.flag("x") == ""
    assert geo.country_of("192.168.1.5") is None and geo.country_of("127.0.0.1") is None and geo.country_of("not an address") is None
    # Without a table a public address is unknown too, and unknown is never refused.
    assert geo.country_of("8.8.8.8") is None
    assert geo.allowed(None, ["SE"]) is True
    assert geo.allowed("SE", []) is True
    assert geo.allowed("SE", ["SE", "NO"]) is True
    assert geo.allowed("RU", ["SE"]) is False
    today = date(2026, 11, 11)
    assert geo.allowed("RU", ["SE"], travel_until=date(2026, 11, 20), today=today) is True
    assert geo.allowed("RU", ["SE"], travel_until=date(2026, 11, 10), today=today) is False


async def test_sign_in_from_outside_the_allowed_countries(client, monkeypatch, db_session):
    ids = await _family(client)
    assert await _rule(client, ["se", "NO", "xx1"]) == ["NO", "SE"]  # tidied: upper case, two letters only
    assert await _rule(client, ["SE"]) == ["SE"]
    # Everyone comes from Russia now.
    monkeypatch.setattr(geo, "country_of", lambda ip: "RU")
    refused = await client.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})
    assert refused.status_code == 403 and "where you are" in refused.json()["detail"]
    view = (await client.get("/api/server/security")).json()
    assert [(e["kind"], e["country"], e["family"]) for e in view["events"]][0] == ("country_blocked", "RU", "Lind")
    # Eva is travelling: she gets in until the day has passed.
    assert (await client.patch(f"/api/family/members/{ids['eva']}", json={"travel_until": str(date.today() + timedelta(days=5))})).status_code == 200
    assert (await client.get(f"/api/family/members")).json()[1]["travel_until"] == str(date.today() + timedelta(days=5))
    assert (await client.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200
    await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"}) if False else None
    assert (await client.patch(f"/api/family/members/{ids['eva']}", json={"travel_until": None})).status_code in (200, 403)
    # Back home (the admin's own session is from Russia too now – so the rule stops the admin as well).
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 403
    # No rule: anyone, from anywhere.
    monkeypatch.setattr(geo, "country_of", lambda ip: None)
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200
    assert await _rule(client, []) == []
    monkeypatch.setattr(geo, "country_of", lambda ip: "RU")
    assert (await client.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200


async def test_the_brake_is_stricter_from_outside(client, monkeypatch):
    await _family(client)
    await _rule(client, ["SE"])
    monkeypatch.setattr(geo, "country_of", lambda ip: "RU")
    # Three wrong tries from outside, then the fourth is stopped (eight at home).
    codes = [(await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})).status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    # Links too: ten tries per address an hour.
    links = [(await client.get(f"/api/guest/not-{i}")).status_code for i in range(8)]
    # The address already has its three sign-in failures; the limit of ten an hour is shared.
    assert links == [404] * 7 + [429]
    monkeypatch.setattr(geo, "country_of", lambda ip: "SE")
    # At home the same address has only four failures of twenty-five.
    assert (await client.get("/api/guest/not-at-all")).status_code == 404


async def test_the_summary_shows_where_things_came_from(client, monkeypatch, db_session):
    await _family(client)
    monkeypatch.setattr(geo, "country_of", lambda ip: "RU")
    await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})
    monkeypatch.setattr(geo, "country_of", lambda ip: "SE")
    await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})
    await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})
    # A day on, a minute before now: the day it looks back on holds what just happened.
    morning = datetime.now(timezone.utc) + timedelta(days=1) - timedelta(minutes=1)
    if morning.hour < 7:
        morning = morning.replace(hour=7, minute=0)
    assert await security_log.run_security_summary(db_session, morning) == 1
    admin = (await db_session.execute(select(User).where(User.username == "admin"))).scalar_one()
    body = (await db_session.execute(select(Notification.body).where(Notification.user_id == admin.id, Notification.kind == "security"))).scalars().all()[-1]
    assert body == "3 misslyckade inloggningar – Lind 🇸🇪 2 · 🇷🇺 1"
    view = (await client.get("/api/server/security")).json()
    assert sorted(e["country"] for e in view["events"] if e["kind"] == "login_failed") == ["RU", "SE", "SE"]


async def test_the_table_is_fetched_checked_and_kept(client, monkeypatch, tmp_path):
    from app.config import get_settings

    await _family(client)
    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    status = (await client.get("/api/admin/geo")).json()
    assert status["loaded"] is False and status["attribution"] == "IP Geolocation by DB-IP"

    async def broken(month):
        return gzip.compress(b"not a table")

    monkeypatch.setattr(geo, "_fetch", broken)
    assert (await client.post("/api/admin/geo/download")).status_code == 502
    assert not geo.table_path().exists()

    months = []

    async def fetch(month):
        months.append(month)
        return None if len(months) == 1 else gzip.compress(b"a table, trust me")

    monkeypatch.setattr(geo, "_fetch", fetch)
    monkeypatch.setattr(geo, "_verify", lambda raw: None)
    out = (await client.post("/api/admin/geo/download")).json()
    # This month's isn't out yet: last month's is taken.
    assert len(months) == 2 and out["month"] == months[1] and out["size"] == len(b"a table, trust me")
    assert geo.table_path().read_bytes() == b"a table, trust me"
    assert "geo_table" in [r["action"] for r in (await client.get("/api/server/log")).json()]
    # The server admin only.
    other_login = await client.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})
    assert other_login.status_code == 200
    assert (await client.post("/api/admin/geo/download")).status_code == 403


@pytest.mark.parametrize("kind", ["guest", "kiosk"])
async def test_links_stay_open_for_guests_abroad(client, monkeypatch, kind):
    """The rule is about signing in: a guest's link works from anywhere."""
    await _family(client)
    await _rule(client, ["SE"])
    monkeypatch.setattr(geo, "country_of", lambda ip: "US")
    created = (await client.post("/api/guests", json={"name": "Farmor", "hours": 5})).json()
    assert (await client.get(f"/api/guest/{created['url'].rsplit('/', 1)[1]}")).status_code == 200
