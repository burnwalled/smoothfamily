"""Two homes (2.7.5): the patterns, exceptions, the calendar, tasks that wait, the evening-before
reminder, the handover list, and the other parent's link that shows only the child."""
from datetime import date, datetime, time, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for username, role in [("klara", "child"), ("leo", "child")]:
        ids[username] = (await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})).json()["id"]
    return ids


def test_patterns():
    from types import SimpleNamespace

    from app.routers.custody import next_handover, place_on

    monday = date(2026, 11, 2)
    week = SimpleNamespace(pattern="week", anchor_date=monday)
    assert [place_on(week, [], monday + timedelta(days=d)) for d in (0, 6, 7, 13, 14)] == ["here", "here", "other", "other", "here"]
    two = SimpleNamespace(pattern="223", anchor_date=monday)
    assert "".join("h" if place_on(two, [], monday + timedelta(days=d)) == "here" else "o" for d in range(14)) == "hhoohhhoohhooo"
    weekend = SimpleNamespace(pattern="weekend", anchor_date=date(2026, 11, 6))  # a Friday away
    assert [place_on(weekend, [], date(2026, 11, 6) + timedelta(days=d)) for d in (0, 2, 3, 7, 14)] == ["other", "other", "here", "here", "other"]
    holiday = SimpleNamespace(start_date=date(2026, 11, 9), end_date=date(2026, 11, 10), place="here")
    assert place_on(week, [holiday], date(2026, 11, 9)) == "here"
    assert next_handover(week, [], monday) == (date(2026, 11, 9), "other")


async def test_schedule_calendar_tasks_and_reminder(client, db_session):
    from app.routers.custody import run_custody

    ids = await _family(client)
    today = date.today()
    # Klara is at Dad's this week, with us the next.
    monday = today - timedelta(days=today.weekday())
    saved = (await client.put(f"/api/custody/{ids['klara']}", json={"other_home": "Dad's", "pattern": "week", "anchor_date": str(monday - timedelta(days=7)), "handover_time": "17:00"})).json()
    assert saved["place"] == "other" and saved["handover_list_id"] and saved["next_handover"] == str(monday + timedelta(days=7))
    assert (await client.put(f"/api/custody/{ids['klara']}", json={"other_home": "x", "anchor_date": str(monday), "handover_time": "25:00"})).status_code == 422

    # Her task waits while she's away; Leo's doesn't.
    await client.post("/api/tasks", json={"title": "Feed the cat", "assignee_id": ids["klara"], "recurrence": "daily"})
    await client.post("/api/tasks", json={"title": "Water the plants", "assignee_id": ids["leo"], "recurrence": "daily"})
    titles = [t["task"]["title"] for t in (await client.get("/api/tasks/today")).json()]
    assert titles == ["Water the plants"]

    # The calendar: the days away, and the handover.
    events = (await client.get(f"/api/calendar/events?start={monday}&end={monday + timedelta(days=14)}")).json()
    away = [e for e in events if e["title"] == "Klara at Dad's"]
    assert away and away[0]["all_day"] and away[0]["member_ids"] == [ids["klara"]]
    assert any(e["title"] == "🔁 Klara home" and not e["all_day"] for e in events)

    # An exception: she comes home early (from tomorrow).
    await client.post(f"/api/custody/{ids['klara']}/exceptions", json={"start_date": str(today + timedelta(days=1)), "end_date": str(monday + timedelta(days=6)), "place": "here", "note": "Autumn break"})
    sched = (await client.get("/api/custody")).json()[0]
    assert sched["next_handover"] == str(today + timedelta(days=1)) and sched["next_place"] == "here"

    # The evening before, the adults are told (once) with the handover list.
    await client.post(f"/api/lists/{saved['handover_list_id']}/items", json={"name": "Football boots"})
    # This evening (17 UTC = 18 in Stockholm), on the same day as "today" above – also just after midnight.
    evening = datetime.combine(today, time(17), tzinfo=timezone.utc)
    assert await run_custody(db_session, evening) == 1
    assert await run_custody(db_session, evening) == 0
    note = next(n for n in (await client.get("/api/notifications")).json() if n["kind"] == "custody")
    assert note["title"] == "Klara comes home tomorrow" and "1 things" in note["body"]

    # A child sees their own schedule only, and can't change any.
    assert (await client.post("/api/auth/login", json={"username": "leo", "password": "pass1234"})).status_code == 200
    assert (await client.get("/api/custody")).json() == []
    assert (await client.put(f"/api/custody/{ids['leo']}", json={"other_home": "Mum's", "anchor_date": str(monday)})).status_code == 403


async def test_the_handover_list_is_cleared_after_a_handover(client, db_session):
    from app.routers.custody import run_custody

    ids = await _family(client)
    today = date.today()
    # The handover was yesterday: she went to Dad's.
    saved = (await client.put(f"/api/custody/{ids['klara']}", json={"other_home": "Dad's", "pattern": "custom", "anchor_date": str(today)})).json()
    await client.post(f"/api/custody/{ids['klara']}/exceptions", json={"start_date": str(today - timedelta(days=1)), "end_date": str(today + timedelta(days=5)), "place": "other"})
    item = (await client.post(f"/api/lists/{saved['handover_list_id']}/items", json={"name": "Charger"})).json()
    await client.patch(f"/api/lists/{saved['handover_list_id']}/items/{item['id']}", json={"done": True})
    await run_custody(db_session, datetime.combine(today, time(7), tzinfo=timezone.utc))
    assert (await client.get(f"/api/lists/{saved['handover_list_id']}/items")).json()[0]["done"] is False


async def test_the_other_parents_link_shows_only_the_child(client):
    ids = await _family(client)
    today = date.today()
    await client.put(f"/api/custody/{ids['klara']}", json={"other_home": "Dad's", "pattern": "week", "anchor_date": str(today - timedelta(days=today.weekday()))})
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(days=1)
    end = start + timedelta(hours=1)
    await client.post("/api/calendar/family-events", json={"title": "Klara: football", "start": start.isoformat(), "end": end.isoformat(), "member_ids": [ids["klara"]]})
    await client.post("/api/calendar/family-events", json={"title": "Parents' dinner", "start": start.isoformat(), "end": end.isoformat()})
    await client.put(f"/api/emergency/members/{ids['klara']}", json={"allergies": "Nuts"})
    await client.put(f"/api/emergency/members/{ids['leo']}", json={"allergies": "Eggs"})

    link = (await client.post(f"/api/custody/{ids['klara']}/link", json={"name": "Erik (Klara's dad)", "days": 180})).json()
    token = link["url"].rsplit("/", 1)[1]
    client.cookies.clear()
    view = (await client.get(f"/api/guest/{token}")).json()
    titles = [e["title"] for e in view["calendar"]]
    assert "Klara: football" in titles and "Parents' dinner" not in titles
    assert [m["name"] for m in view["emergency"]["members"]] == ["Klara"]
    assert view["custody"][0]["name"] == "Klara" and len(view["custody"][0]["days"]) == 28
    assert [lst["name"] for lst in view["lists"]] == ["To Dad's – Klara"]


async def test_the_other_parent_has_an_account_that_sees_only_the_child(client):
    import httpx

    from app.main import app

    ids = await _family(client)
    monday = date.today() - timedelta(days=date.today().weekday())
    saved = (await client.put(f"/api/custody/{ids['klara']}", json={"other_home": "Dad's", "pattern": "week", "anchor_date": str(monday), "handover_list": True})).json()
    item = (await client.post(f"/api/lists/{saved['handover_list_id']}/items", json={"name": "Football boots"})).json()
    await client.post("/api/lists", json={"name": "Family secrets"})

    invited = await client.post(f"/api/custody/{ids['klara']}/coparents", json={"name": "Erik"})
    assert invited.status_code == 201, invited.text
    token = invited.json()["url"].rsplit("/coparent/join/", 1)[1]
    assert (await client.post(f"/api/custody/{ids['leo']}/coparents", json={"name": "x"})).status_code == 201  # Leo is a child too

    erik = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    info = (await erik.get(f"/api/coparent/invite/{token}")).json()
    assert info["name"] == "Erik" and info["children"] == ["Klara"]
    assert (await erik.post(f"/api/coparent/invite/{token}", json={"username": "admin", "password": "longpass1"})).status_code == 409
    assert (await erik.post(f"/api/coparent/invite/{token}", json={"username": "erik.dad", "password": "longpass1"})).status_code == 204
    # The invitation is used.
    assert (await erik.get(f"/api/coparent/invite/{token}")).status_code == 404

    view = (await erik.get("/api/coparent/me")).json()
    assert [c["name"] for c in view["custody"]] == ["Klara"]
    # Only the handover list – not the family's other lists.
    assert len(view["lists"]) == 1 and [i["name"] for i in view["lists"][0]["items"]] == ["Football boots"]
    assert [m["name"] for m in view["emergency"]["members"]] == ["Klara"]
    assert (await erik.post(f"/api/coparent/items/{item['id']}", json={"done": True})).json()["done"] is True
    # Nothing of the family's: their session is no family session.
    for path in ("/api/lists", "/api/auth/me", "/api/chat/conversations", "/api/family/members", "/api/vault"):
        assert (await erik.get(path)).status_code == 401, path

    # Writing with the family's adults; they are told.
    assert (await erik.post("/api/coparent/messages", json={"body": "Can I take her Friday?"})).status_code == 201
    cp = (await client.get("/api/custody/coparents")).json()
    erik_row = next(c for c in cp if c["name"] == "Erik")
    assert erik_row["joined"] is True
    thread = (await client.get(f"/api/custody/coparents/{erik_row['id']}/messages")).json()
    assert [(m["from_name"], m["mine"]) for m in thread] == [("Erik", False)]
    assert any(n["kind"] == "coparent_message" for n in (await client.get("/api/notifications")).json())
    await client.post(f"/api/custody/coparents/{erik_row['id']}/messages", json={"body": "Sure!"})
    assert [(m["body"], m["mine"]) for m in (await erik.get("/api/coparent/me")).json()["messages"]] == [("Can I take her Friday?", True), ("Sure!", False)]

    # Signing in again; closing it stops everything at once.
    await erik.post("/api/coparent/logout")
    assert (await erik.get("/api/coparent/me")).status_code == 401
    assert (await erik.post("/api/coparent/login", json={"username": "erik.dad", "password": "wrong"})).status_code == 401
    assert (await erik.post("/api/coparent/login", json={"username": "erik.dad", "password": "longpass1"})).status_code == 204
    assert (await client.delete(f"/api/custody/coparents/{erik_row['id']}")).json()["revoked"] is True
    assert (await erik.get("/api/coparent/me")).status_code == 401
    # A family member can't invite unless they may change the family's settings.
    assert (await client.post("/api/auth/login", json={"username": "klara", "password": "pass1234"})).status_code == 200
    assert (await client.post(f"/api/custody/{ids['klara']}/coparents", json={"name": "x"})).status_code == 403
    await erik.aclose()
