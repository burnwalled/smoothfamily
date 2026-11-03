"""3.4.0: parties – the shared invitation page for the guests, and the adults' planning."""
from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"},
    )
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    for name, role in [("adult1", "adult"), ("maja", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _as(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


def _party(start: datetime, **extra) -> dict:
    return {
        "title": "Majas kalas", "kind": "child_birthday", "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=2)).isoformat(),
        "place": "Hemma", "address": "Storgatan 1", "invitation": "Välkommen på kalas!", "rsvp_by": (start - timedelta(days=5)).date().isoformat(), **extra,
    }


async def test_a_party_from_invitation_to_thanks(client, db_session):
    from app.routers.parties import run_party_reminders

    ids = await _family(client)
    start = (datetime.now(timezone.utc) + timedelta(days=30)).replace(hour=13, minute=0, second=0, microsecond=0)
    person = (await client.post("/api/birthdays/people", json={"name": "Maja", "user_id": ids["maja"], "birth_month": start.month, "birth_day": start.day})).json()
    await client.post(f"/api/birthdays/people/{person['id']}/wishes", json={"title": "Lego"})
    await client.post(f"/api/birthdays/people/{person['id']}/wishes", json={"title": "Pyssel"})

    party = (await client.post("/api/parties", json=_party(start, plus_one=True, show_guests="names", wishlist=True, person_id=person["id"], budget=1500))).json()
    # Started with a checklist (in the admin's language) and, for a child's party, the day's timeline.
    assert any(t["title"] == "Dela inbjudan" for t in party["tasks"]) and any(t["title"] == "Påminn dem som inte svarat" for t in party["tasks"])
    assert [s["title"] for s in party["steps"]][0] == "Gästerna kommer" and party["steps"][-1]["title"] == "Hämtning"
    assert party["link"].split("/party/")[1] and "<svg" in party["qr_svg"]
    token = party["link"].rsplit("/", 1)[1]
    # It's in the family's calendar, as Maja's.
    day = start.date()
    events = (await client.get(f"/api/calendar/events?start={day}&end={day + timedelta(days=1)}")).json()
    assert any(e["title"].endswith("Majas kalas") and e["member_ids"] == [ids["maja"]] for e in events)

    # A guest replies (with a +1), sees the wish list, reserves a wish and changes the reply later.
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["title"] == "Majas kalas" and page["plus_one"] and page["guests"] == {"coming": 0, "names": []}
    assert [w["title"] for w in page["wishes"]] == ["Lego", "Pyssel"]
    sent = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "last_name": "Berg", "allergies": "Nötter", "plus_first_name": "Ella", "plus_last_name": "Berg", "plus_allergies": "Laktos"})).json()
    key = sent["key"]
    lego = page["wishes"][0]["id"]
    wkey = (await client.post(f"/api/party/{token}/wishes/{lego}/reserve", json={"name": "Saga"})).json()["key"]
    assert (await client.post(f"/api/party/{token}/wishes/{lego}/reserve", json={"name": "Nils"})).status_code == 409
    mine = (await client.get(f"/api/party/{token}?key={key}&wish_key={wkey}")).json()
    assert mine["mine"]["first_name"] == "Saga" and mine["guests"]["names"] == ["Saga Berg", "Ella Berg"]
    assert next(w for w in mine["wishes"] if w["id"] == lego)["reserved_by_you"] is True
    await client.post(f"/api/party/{token}/reply?key={key}", json={"first_name": "Saga", "last_name": "Berg", "allergies": "Nötter"})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "coming": False})
    assert (await client.get(f"/api/party/{token}/calendar.ics")).text.count("BEGIN:VEVENT") == 1
    assert (await client.get("/api/party/not-a-link")).status_code == 404

    # The hosts: replies, the people coming, the allergies gathered, who's buying what.
    detail = (await client.get(f"/api/parties/{party['id']}")).json()
    assert detail["coming"] == 1 and detail["not_coming"] == 1 and detail["allergies"] == [{"name": "Saga Berg", "allergies": "Nötter"}]
    assert next(w for w in detail["wishes"] if w["title"] == "Lego")["reserved_by"] == "Saga"
    notes = [n["kind"] for n in (await client.get("/api/notifications")).json()]
    assert "party_reply" in notes

    # Budget and the timeline.
    detail = (await client.post(f"/api/parties/{party['id']}/expenses", json={"title": "Tårta", "amount": 450})).json()
    assert detail["spent"] == 450 and detail["budget"] == 1500
    detail = (await client.post(f"/api/parties/{party['id']}/steps", json={"at": "14:10", "title": "Fiskdamm"})).json()
    assert "Fiskdamm" in [s["title"] for s in detail["steps"]]
    # Only names when the hosts want: now just how many.
    await client.put(f"/api/parties/{party['id']}", json={"show_guests": "count"})
    assert (await client.get(f"/api/party/{token}")).json()["guests"] == {"coming": 1}

    # A child doesn't open the planning (the reservations are on it).
    await _as(client, "maja")
    assert (await client.get("/api/parties")).status_code == 403

    # Reminders: the tasks due today tell the adults, once.
    await _as(client, "admin", "secret123")
    first = detail["tasks"][0]
    await client.put(f"/api/parties/{party['id']}/tasks/{first['id']}", json={"due_date": datetime.now(timezone.utc).date().isoformat()})
    morning = datetime.now(timezone.utc).replace(hour=9, minute=0)
    assert await run_party_reminders(db_session, morning) >= 2
    assert await run_party_reminders(db_session, morning) == 0

    # Afterwards: the thank-you page.
    await client.put(f"/api/parties/{party['id']}", json={"thanks_text": "Tack för att ni kom!", "thanks_published": True})
    assert (await client.get(f"/api/party/{token}")).json()["thanks"] == {"text": "Tack för att ni kom!", "photos": []}

    # A new link: the old one stops working.
    fresh = (await client.post(f"/api/parties/{party['id']}/link")).json()
    assert (await client.get(f"/api/party/{token}")).status_code == 404
    assert (await client.get(f"/api/party/{fresh['link'].rsplit('/', 1)[1]}")).status_code == 200

    # Removing the party removes it from the calendar.
    assert (await client.delete(f"/api/parties/{party['id']}")).status_code == 204
    events = (await client.get(f"/api/calendar/events?start={day}&end={day + timedelta(days=1)}")).json()
    assert not any(e["title"].endswith("Majas kalas") for e in events)


async def test_no_plus_one_unless_allowed(client):
    await _family(client)
    start = datetime.now(timezone.utc) + timedelta(days=10)
    party = (await client.post("/api/parties", json=_party(start, kind="party", title="Middag"))).json()
    token = party["link"].rsplit("/", 1)[1]
    sent = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Per", "plus_first_name": "Smygis"})).json()
    assert sent["mine"]["plus_first_name"] is None
    assert party["steps"] == []  # the timeline template is a child's party's
    assert (await client.post("/api/parties", json=_party(start, ends_at=(start - timedelta(hours=1)).isoformat()))).status_code == 422
