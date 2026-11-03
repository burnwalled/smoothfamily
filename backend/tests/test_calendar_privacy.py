"""Phase G: calendar feed privacy semantics.

Scenarios:
1) user outside visible_to sees no events
2) user in visible_to but outside details_for sees busy blocks only
3) admin sees full details regardless of details_for
"""

import pytest

from app.services import calendar_view

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Calendar Privacy Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _add_member(client, username: str, display_name: str):
    resp = await client.post(
        "/api/family/members",
        json={"display_name": display_name, "username": username, "password": "pass1234", "role": "child"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _login(client, username: str, password: str):
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text


def _mock_events(*_args, **_kwargs):
    return [
        {
            "title": "Dentist",
            "start": "2026-06-12T09:00:00+00:00",
            "end": "2026-06-12T10:00:00+00:00",
            "all_day": False,
            "location": "Clinic",
        }
    ]


async def _mock_fetch(*_args, **_kwargs):
    return "BEGIN:VCALENDAR"


async def test_user_outside_visible_to_gets_no_events(client, monkeypatch):
    admin = await _setup(client)
    child = await _add_member(client, "kid", "Kid")

    monkeypatch.setattr(calendar_view, "fetch_ical_raw", _mock_fetch)
    monkeypatch.setattr(calendar_view, "parse_events", _mock_events)

    create = await client.post(
        "/api/calendar/feeds",
        json={
            "name": "Private",
            "url": "webcal://example.com/private.ics",
            "visible_to": [admin["id"]],
            "details_for": [admin["id"]],
        },
    )
    assert create.status_code == 201, create.text

    await _login(client, "kid", "pass1234")
    resp = await client.get("/api/calendar/events?start=2026-06-10&end=2026-06-14")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_user_in_visible_without_details_gets_busy_blocks(client, monkeypatch):
    admin = await _setup(client)
    child = await _add_member(client, "kid", "Kid")

    monkeypatch.setattr(calendar_view, "fetch_ical_raw", _mock_fetch)
    monkeypatch.setattr(calendar_view, "parse_events", _mock_events)

    create = await client.post(
        "/api/calendar/feeds",
        json={
            "name": "Semi-private",
            "url": "webcal://example.com/private.ics",
            "visible_to": [admin["id"], child["id"]],
            "details_for": [admin["id"]],
        },
    )
    assert create.status_code == 201, create.text

    await _login(client, "kid", "pass1234")
    resp = await client.get("/api/calendar/events?start=2026-06-10&end=2026-06-14")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["busy"] is True
    assert body[0]["title"] is None
    assert body[0]["location"] is None


async def test_admin_always_sees_full_details(client, monkeypatch):
    admin = await _setup(client)
    child = await _add_member(client, "kid", "Kid")

    monkeypatch.setattr(calendar_view, "fetch_ical_raw", _mock_fetch)
    monkeypatch.setattr(calendar_view, "parse_events", _mock_events)

    create = await client.post(
        "/api/calendar/feeds",
        json={
            "name": "Restricted",
            "url": "webcal://example.com/private.ics",
            "visible_to": [child["id"]],
            "details_for": [child["id"]],
        },
    )
    assert create.status_code == 201, create.text

    # still logged in as admin from setup
    resp = await client.get("/api/calendar/events?start=2026-06-10&end=2026-06-14")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["busy"] is False
    assert body[0]["title"] == "Dentist"
    assert body[0]["location"] == "Clinic"


ICS_SOURCE = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:a@test
DTSTART:20991201T170000Z
DTEND:20991201T180000Z
SUMMARY:Football practice
LOCATION:Spanga IP
END:VEVENT
BEGIN:VEVENT
UID:b@test
DTSTART;VALUE=DATE:20991224
DTEND;VALUE=DATE:20991225
SUMMARY:Christmas Eve
END:VEVENT
END:VCALENDAR
"""


async def test_shared_ics_contains_events(client, monkeypatch):
    """Regression: the shared .ics link used to swallow every event (datetime handling)."""
    from datetime import date as real_date

    from app.routers import calendar as calendar_router

    class FakeDate(real_date):
        @classmethod
        def today(cls):
            return real_date(2099, 11, 30)

    async def fetch(_url, _family_id=None):
        return ICS_SOURCE

    monkeypatch.setattr(calendar_view, "fetch_ical_raw", fetch)
    monkeypatch.setattr(calendar_router, "date", FakeDate)

    await _setup(client)
    await client.post("/api/calendar/feeds", json={"name": "Club", "url": "https://example.com/club.ics"})
    token = (await client.get("/api/calendar/ical/token")).json()["token"]

    body = (await client.get(f"/api/calendar/ical/{token}.ics")).text
    assert body.count("BEGIN:VEVENT") == 2
    assert "SUMMARY:Football practice" in body
    assert "DTSTART:20991201T170000Z" in body
    assert "DTSTART;VALUE=DATE:20991224" in body and "DTEND;VALUE=DATE:20991225" in body


async def test_a_members_own_calendar_and_their_subscription(client, monkeypatch):
    """2.8.4: a feed marked as a member's own makes its events theirs; their subscription link holds
    what concerns them – not their own calendar again, not others' events."""
    from datetime import date, timedelta

    soon = date.today() + timedelta(days=3)
    ics = f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dentist
SUMMARY:Dentist
DTSTART:{soon:%Y%m%d}T090000Z
DTEND:{soon:%Y%m%d}T100000Z
END:VEVENT
END:VCALENDAR"""

    async def fetch(_url, _family_id=None):
        return ics

    monkeypatch.setattr(calendar_view, "fetch_ical_raw", fetch)
    await _setup(client)
    me = (await client.get("/api/auth/me")).json()
    other = (await client.post("/api/family/members", json={"display_name": "Bo", "username": "bo", "password": "pass1234", "role": "adult"})).json()
    feed = (await client.post("/api/calendar/feeds", json={"name": "Anna's Google", "url": "https://example.com/a.ics", "member_id": me["id"]})).json()
    assert feed["member_id"] == me["id"]
    events = (await client.get(f"/api/calendar/events?start={date.today()}&end={soon + timedelta(days=1)}")).json()
    assert next(e for e in events if e["title"] == "Dentist")["member_ids"] == [me["id"]]

    await client.post("/api/calendar/family-events", json={"title": "Family dinner", "start": f"{soon}T17:00:00Z", "end": f"{soon}T18:00:00Z"})
    await client.post("/api/calendar/family-events", json={"title": "Their match", "start": f"{soon}T12:00:00Z", "end": f"{soon}T13:00:00Z", "member_ids": [other["id"]]})
    await client.post("/api/calendar/family-events", json={"title": "My haircut", "start": f"{soon}T14:00:00Z", "end": f"{soon}T15:00:00Z", "member_ids": [me["id"]]})
    token = (await client.get("/api/calendar/ical/token")).json()["token"]
    body = (await client.get(f"/api/calendar/ical/{token}.ics")).text
    assert "SUMMARY:Family dinner" in body and "SUMMARY:My haircut" in body
    assert "Their match" not in body and "Dentist" not in body  # not theirs; already in their phone

    # Made the family's again: then it is in the link.
    assert (await client.patch(f"/api/calendar/feeds/{feed['id']}", json={"member_id": None})).json()["member_id"] is None
    assert "SUMMARY:Dentist" in (await client.get(f"/api/calendar/ical/{token}.ics")).text
    assert (await client.post("/api/calendar/feeds", json={"name": "x", "url": "https://example.com/x.ics", "member_id": "00000000-0000-0000-0000-000000000000"})).status_code == 422

