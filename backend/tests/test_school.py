"""3.4.0: the children's school from Home Assistant (InfoMentor in the simulated home)."""
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    for name, role in [("adult1", "adult"), ("maja", "child"), ("leo", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _as(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_a_childs_school_from_home_assistant(client, db_session):
    from app.services import ha_sim
    from app.services.school_ha import run_school_sync

    ids = await _family(client)
    assert (await client.get(f"/api/school/links/{ids['maja']}")).json()["available"] is False
    await client.post("/api/smarthome/connection/simulated")
    ha_sim.reset()

    # The admin sees InfoMentor's two children (not its hub), with what each sensor is.
    links = (await client.get(f"/api/school/links/{ids['maja']}")).json()
    found = {a["key"]: a for a in links["accounts"]}
    assert set(found) == {"sim-im-maja", "sim-im-leo"} and found["sim-im-maja"]["label"] == "InfoMentor"
    assert found["sim-im-maja"]["roles"]["weekly_letter"] == "sensor.maja_weekly_letter"
    assert found["sim-im-maja"]["roles"]["news"] == "sensor.infomentor_school_news"  # the hub's, shared
    assert found["sim-im-leo"]["roles"]["leisure_today"] == "sensor.leo_leisure_time_centre_today"

    # Linking Maja: her school calendar becomes her calendar subscription.
    linked = (await client.put(f"/api/school/links/{ids['maja']}", json={"accounts": ["sim-im-maja"]})).json()
    assert linked["linked"] == ["sim-im-maja"] and linked["calendars"] == ["calendar.maja_calendar"]
    feeds = (await client.get("/api/calendar/feeds")).json()
    feed = next(f for f in feeds if f["url"] == "homeassistant://calendar.maja_calendar")
    assert feed["member_id"] == ids["maja"]
    today = date.today()
    events = (await client.get(f"/api/calendar/events?start={today}&end={today + timedelta(days=10)}")).json()
    titles = {e["title"] for e in events if e.get("feed_id") == feed["id"]}
    assert {"Prov i matematik", "Utflykt till Skansen"} <= titles
    await client.put(f"/api/school/links/{ids['leo']}", json={"accounts": ["sim-im-leo"]})
    # An account already linked shows whose it is.
    assert {a["key"]: a["linked_to"] for a in (await client.get(f"/api/school/links/{ids['leo']}")).json()["accounts"]}["sim-im-maja"] == "Maja"

    # The school card: the day, PE tomorrow, homework, the letter; Leo's after-school hours.
    cards = {c["name"]: c for c in (await client.get("/api/school/today")).json()}
    assert cards["Maja"]["school_day"] == "08:10–14:40" and cards["Maja"]["pe"] is True and cards["Maja"]["assignments"] == 2
    assert cards["Maja"]["assignment_titles"][0] == "Matte s. 34–36" and cards["Maja"]["weekly_letter"] == "Veckobrev v.45"
    assert cards["Leo"]["leisure_today"] == "13:30–16:30" and cards["Leo"]["checked_in"] is True
    letter = (await client.get(f"/api/school/{ids['maja']}/letter")).json()
    assert "Skansen" in letter["text"] and letter["attachments"][0]["name"] == "Veckobrev v45.pdf"

    # A child sees their own only; another adult sees both.
    await _as(client, "maja")
    assert [c["name"] for c in (await client.get("/api/school/today")).json()] == ["Maja"]
    assert (await client.get(f"/api/school/{ids['leo']}/letter")).status_code == 404
    assert (await client.get(f"/api/school/links/{ids['maja']}")).status_code == 403
    await _as(client, "adult1")
    assert len((await client.get("/api/school/today")).json()) == 2

    # The worker: what's there when linked isn't news; a new letter and an absence tell the adults.
    assert await run_school_sync(db_session) == 0
    home = ha_sim._homes[next(iter(ha_sim._homes))]
    home["sensor.maja_weekly_letter"]["state"] = "Veckobrev v.46"
    home["binary_sensor.leo_absent_today"]["state"] = "on"
    assert await run_school_sync(db_session) == 4  # two adults, a letter and an absence each
    assert await run_school_sync(db_session) == 0
    notes = [n["kind"] for n in (await client.get("/api/notifications")).json()]
    assert "school_letter" in notes and "school_absent" in notes

    # Unlinking removes the calendar subscription.
    await _as(client, "admin", "secret123")
    await client.put(f"/api/school/links/{ids['maja']}", json={"accounts": []})
    assert not any(f["url"] == "homeassistant://calendar.maja_calendar" for f in (await client.get("/api/calendar/feeds")).json())

    # The kitchen display's school card: the day, never absence or letters.
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    await client.put(f"/api/kiosks/{screen['id']}", json={"widgets": ["school"]})
    view = (await client.get(f"/api/kiosk/{screen['url'].rsplit('/', 1)[1]}")).json()
    [leo] = view["school"]
    assert (leo["name"], leo["school_day"], leo["pe"], leo["leisure_today"]) == ("Leo", "08:30–13:30", False, "13:30–16:30")
    assert "absent_today" not in leo and "weekly_letter" not in leo


def test_recognising_sensors_in_swedish_too():
    from app.services.school_ha import day_of, role_of

    assert role_of("sensor.maja_skoldag", "Maja Skoldag") == "school_day"
    assert role_of("binary_sensor.maja_idrott_nasta_skoldag", "Maja Idrott nästa skoldag") == "pe"
    assert role_of("sensor.maja_veckobrev", None) == "weekly_letter"
    assert role_of("binary_sensor.maja_franvarande_idag", "Maja Frånvarande idag") == "absent_today"
    assert role_of("sensor.maja_fritids_idag", None) == "leisure_today"
    assert role_of("light.kitchen", None) is None
    # SchoolSoft: the start and the end make the day.
    facts = day_of({"school_start": "sensor.a", "school_end": "sensor.b"}, {"sensor.a": {"state": "2026-11-04T08:15:00+01:00"}, "sensor.b": {"state": "2026-11-04T15:05:00+01:00"}})
    assert facts["school_day"] == "08:15–15:05"
