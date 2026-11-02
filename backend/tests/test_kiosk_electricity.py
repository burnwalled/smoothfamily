"""Electricity price (#74) – the card and cheap-hour flows – and the kitchen display (#50)."""
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


def _quarters(day: date, price_for_hour) -> list[dict]:
    """A day of quarter-hour prices in UTC (SEK/kWh), as elprisetjustnu.se gives them."""
    rows = []
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    for q in range(96):
        t = start + timedelta(minutes=15 * q)
        rows.append({"SEK_per_kWh": price_for_hour(t.hour) + (0.004 if q % 2 else 0.0), "time_start": t.isoformat(), "time_end": (t + timedelta(minutes=15)).isoformat()})
    return rows


@pytest.fixture
def prices(monkeypatch):
    from app.config import get_settings
    from app.services import electricity

    monkeypatch.setattr(get_settings(), "timezone", "UTC")
    electricity._cache.clear()
    asked = []

    async def fake_fetch(area, day):
        asked.append((area, day))
        # Cheap at night (03–05), expensive at 18.
        return _quarters(day, lambda h: 0.10 + h / 100 if h not in (3, 4, 5) else 0.02 + h / 1000)

    monkeypatch.setattr(electricity, "_fetch", fake_fetch)
    yield asked
    electricity._cache.clear()


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "Lindqvist", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": resp.json()["id"]}
    r = await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})
    ids["leo"] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_electricity_card(client, prices):
    from app.services import electricity

    hours = electricity.hourly(_quarters(date(2026, 10, 28), lambda h: 0.5))
    assert len(hours) == 24 and hours[0]["ore"] == 50.2  # four quarters averaged, in öre
    await _family(client)
    assert (await client.get("/api/dashboard/electricity")).json() is None
    assert (await client.put("/api/dashboard/sources/electricity", json={"area": "SE9"})).status_code == 422
    assert (await client.put("/api/dashboard/sources/electricity", json={"area": "SE3"})).json()["electricity_area"] == "SE3"
    card = (await client.get("/api/dashboard/electricity")).json()
    assert card["area"] == "SE3" and len(card["today"]) == 24 and card["tomorrow"] and card["now"] is not None
    assert prices[0][0] == "SE3"  # only the area (and the date) is asked for


async def test_cheap_hour_flows(client, db_session, prices):
    from app.services.flows import run_time_flows

    await _family(client)
    await client.put("/api/dashboard/sources/electricity", json={"area": "SE3"})
    await client.post("/api/smarthome/connection/simulated")
    devices = {d["entity_id"]: d["id"] for d in (await client.get("/api/smarthome/my-devices")).json()}
    coffee = {"type": "device", "device_id": devices["switch.coffee_machine"], "action": "turn_on"}
    cheap = (await client.post("/api/smarthome/flows", json={"name": "Charge at the cheapest", "trigger": {"type": "cheapest_hour", "hours": 2}, "actions": [coffee]})).json()
    below = (await client.post("/api/smarthome/flows", json={"name": "Hourly if cheap", "trigger": {"type": "time", "at": "04:00"}, "conditions": [{"type": "price_below", "ore": 10}], "actions": [coffee]})).json()
    assert cheap["trigger"]["hours"] == 2 and below["conditions"][0]["ore"] == 10

    day = date.today()
    at = lambda h, m=0: datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).replace(hour=h, minute=m)  # noqa: E731
    assert await run_time_flows(db_session, at(3)) == 1  # 03 is among the two cheapest hours (03, 04)
    assert await run_time_flows(db_session, at(3, 1)) == 0  # only when the hour starts
    assert await run_time_flows(db_session, at(5)) == 0  # 05 is cheap but not among the two cheapest
    # 04:00: the cheapest hour starts (flow 1) and 04:00 with a price under 10 öre (flow 2).
    assert await run_time_flows(db_session, at(4)) == 2
    flows = (await client.get("/api/smarthome/flows")).json()
    assert all(f["last_error"] is None for f in flows)


async def test_kitchen_display(client, db_session, prices):
    ids = await _family(client)
    await client.put("/api/dashboard/sources/electricity", json={"area": "SE3"})
    await client.post("/api/smarthome/connection/simulated")
    devices = {d["entity_id"]: d["id"] for d in (await client.get("/api/smarthome/my-devices")).json()}
    scene = {"type": "device", "device_id": devices["scene.movie_night"], "action": "activate"}
    shared = (await client.post("/api/smarthome/flows", json={"name": "Movie night", "trigger": {"type": "button"}, "shared": True, "on_today": True, "actions": [scene]})).json()
    mine = (await client.post("/api/smarthome/flows", json={"name": "Mine", "trigger": {"type": "button"}, "on_today": True, "actions": [scene]})).json()
    await client.post("/api/tasks", json={"title": "Empty the dishwasher", "recurrence": "daily", "assignee_id": ids["leo"]})
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    await client.post("/api/calendar/family-events", json={"title": "Football", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()})
    await client.put(f"/api/emergency/members/{ids['leo']}", json={"allergies": "Nuts"})

    await _login(client, "leo")
    assert (await client.post("/api/kiosks", json={"name": "Kitchen"})).status_code == 403
    await _login(client, "admin", "secret123")
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen tablet"})).json()
    assert screen["qr_svg"].startswith("<") or "svg" in screen["qr_svg"]
    token = screen["url"].rsplit("/", 1)[1]

    client.cookies.clear()  # the screen has no session
    view = (await client.get(f"/api/kiosk/{token}")).json()
    assert view["family_name"] == "Lindqvist"
    assert [t["title"] for t in view["tasks"]] == ["Empty the dishwasher"] and view["tasks"][0]["who"] == "Leo"
    assert "Football" in [e["title"] for e in view["events"]]
    assert [f["name"] for f in view["flows"]] == ["Movie night"]  # only shared buttons
    assert view["electricity"]["area"] == "SE3"
    assert (await client.get(f"/api/kiosk/{token}/emergency")).json()["members"][0]["allergies"] == "Nuts"
    assert (await client.post(f"/api/kiosk/{token}/flows/{shared['id']}/run")).status_code == 204
    assert (await client.post(f"/api/kiosk/{token}/flows/{mine['id']}/run")).status_code == 404
    # Nothing private opens with the screen's link.
    assert (await client.get("/api/chat/conversations")).status_code == 401

    await _login(client, "admin", "secret123")
    [listed] = (await client.get("/api/kiosks")).json()
    assert listed["last_seen_at"] is not None
    await client.delete(f"/api/kiosks/{listed['id']}")
    client.cookies.clear()
    assert (await client.get(f"/api/kiosk/{token}")).status_code == 404


async def test_a_screen_shows_only_the_widgets_chosen(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "w@example.com", "family_name": "W", "display_name": "Anna", "username": "wadmin", "password": "secret123"},
    )
    made = (await client.post("/api/kiosks", json={"name": "Hall"})).json()
    token = made["url"].rsplit("/kiosk/", 1)[1]
    assert made["widgets"][0] == "calendar" and "slideshow" in made["widgets"]
    await client.post("/api/tasks", json={"title": "Feed the cat", "recurrence": "daily"})
    assert (await client.get(f"/api/kiosk/{token}")).json()["tasks"]

    changed = (await client.put(f"/api/kiosks/{made['id']}", json={"widgets": ["weather", "calendar"]})).json()
    assert changed["widgets"] == ["calendar", "weather"]
    view = (await client.get(f"/api/kiosk/{token}")).json()
    # Not shown, so not read or sent.
    assert view["widgets"] == ["calendar", "weather"] and view["tasks"] == [] and view["flows"] == []
    assert (await client.get(f"/api/kiosk/{token}/emergency")).status_code == 404
    assert (await client.get(f"/api/kiosk/{token}/photos")).json() == []
