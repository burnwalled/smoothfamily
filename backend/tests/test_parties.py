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
    assert page["language"] == "sv"  # the host's
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


async def test_updates_by_email_for_the_guests_who_ask(client, db_session, monkeypatch):
    from app.routers.parties import run_party_reminders
    from app.services import mailer

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    start = (datetime.now(timezone.utc) + timedelta(days=20)).replace(hour=13, minute=0, second=0, microsecond=0)
    party = (await client.post("/api/parties", json=_party(start, page_theme="jungle"))).json()
    token = party["link"].rsplit("/", 1)[1]
    # No e-mail on the server: the guests aren't asked for an address.
    assert (await client.get(f"/api/party/{token}")).json()["mail"] is False
    out = (await client.put("/api/admin/integrations/email", json={"host": "smtp.example.com", "port": 587, "username": "u", "password": "secret-pass", "sender": "fest@example.com"})).json()
    assert out["configured"] and out["has_password"] and "secret-pass" not in str(out)
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["mail"] is True and page["page_theme"] == "jungle" and page["thanks_theme"] == "jungle"

    # A guest with an address who asks for updates gets a confirmation; one who doesn't, nothing.
    mine = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "email": "Saga@Example.com", "updates": True})).json()
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "email": "nils@example.com"})
    assert [s[0] for s in sent] == ["saga@example.com"] and "Majas kalas" in sent[0][1] and "?unsubscribe=" in sent[0][2]
    # A new time tells her; publishing the thank-you; a message from the hosts.
    await client.put(f"/api/parties/{party['id']}", json={"starts_at": (start + timedelta(hours=1)).isoformat(), "ends_at": (start + timedelta(hours=3)).isoformat()})
    await client.put(f"/api/parties/{party['id']}", json={"thanks_text": "Tack!", "thanks_published": True, "thanks_theme": "garden"})
    assert (await client.post(f"/api/parties/{party['id']}/announce", json={"subject": "Parkering", "text": "Parkera på gatan."})).json() == {"sent": 1}
    assert len(sent) == 4 and "Parkera på gatan." in sent[-1][2]
    assert (await client.get(f"/api/party/{token}")).json()["thanks_theme"] == "garden"

    # The day before: a reminder, once.
    sent.clear()
    day_before = datetime.combine((start + timedelta(hours=1)).astimezone(timezone.utc).date() - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).replace(hour=9)
    await run_party_reminders(db_session, day_before)
    await run_party_reminders(db_session, day_before)
    assert [s[0] for s in sent] == ["saga@example.com"]

    # Stopping them through the link in the mail.
    code = sent[0][2].rsplit("?unsubscribe=", 1)[1].strip()
    assert (await client.post(f"/api/party/{token}/unsubscribe", json={"code": code})).json() == {"done": True}
    assert (await client.post(f"/api/parties/{party['id']}/announce", json={"subject": "x", "text": "y"})).json() == {"sent": 0}
    assert mine["key"]


async def test_a_dinner_votes_on_the_date_and_families_say_how_many(client, db_session, monkeypatch):
    from app.services import mailer

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    await client.put("/api/admin/integrations/email", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    start = (datetime.now(timezone.utc) + timedelta(days=40)).replace(hour=17, minute=0, second=0, microsecond=0)
    second, third = start + timedelta(days=7), start + timedelta(days=14)
    body = _party(start, kind="dinner", title="Julmiddag", date_poll=True, households=True, show_guests="names", date_options=[second.isoformat(), third.isoformat()])
    assert (await client.post("/api/parties", json={**body, "date_options": []})).status_code == 422  # one date isn't a vote
    party = (await client.post("/api/parties", json=body)).json()
    assert party["date_poll"] and len(party["date_options"]) == 3 and party["households"]
    # Not in the calendar while the date is open.
    events = (await client.get(f"/api/calendar/events?start={start.date()}&end={(third + timedelta(days=1)).date()}")).json()
    assert not any("Julmiddag" in e["title"] for e in events)
    token = party["link"].rsplit("/", 1)[1]
    first, mid, last = party["date_options"]

    # The families vote and say how many are coming; a date not on offer is dropped.
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["date_poll"] and page["date_options"] == [first, mid, last] and page["households"]
    berg = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "last_name": "Berg", "adults": 2, "children": 2, "date_votes": [mid, last, "2020-01-01T00:00:00+00:00"], "email": "saga@example.com", "updates": True})).json()
    assert berg["mine"]["date_votes"] == [mid, last] and berg["mine"]["coming"] and "röstat på 2 datum" in sent[0][2]
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "adults": 1, "children": 0, "date_votes": [first, mid]})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Ola", "adults": 2, "date_votes": []})
    page = (await client.get(f"/api/party/{token}")).json()
    assert [(r["votes"], r["people"]) for r in page["tally"]] == [(1, 1), (2, 5), (1, 4)]
    assert "Saga Berg (+3)" in page["guests"]["names"]
    detail = (await client.get(f"/api/parties/{party['id']}")).json()
    assert detail["tally"][1]["names"] == ["Saga Berg", "Nils"] and detail["not_coming"] == 1

    # The hosts pick the date: the vote closes, it's in the calendar, the families who voted for it are coming.
    assert (await client.post(f"/api/parties/{party['id']}/decide", json={"option": "2020-01-01T00:00:00+00:00"})).status_code == 404
    detail = (await client.post(f"/api/parties/{party['id']}/decide", json={"option": mid})).json()
    assert not detail["date_poll"] and detail["starts_at"].startswith(mid[:16]) and detail["coming"] == 5
    assert "datumet är bestämt" in sent[-1][1] and sent[-1][0] == "saga@example.com"
    events = (await client.get(f"/api/calendar/events?start={second.date()}&end={(second + timedelta(days=1)).date()}")).json()
    assert any("Julmiddag" in e["title"] for e in events)
    # After the vote, a reply is an ordinary yes or no again (with the family's count).
    again = (await client.post(f"/api/party/{token}/reply?key={berg['key']}", json={"first_name": "Saga", "last_name": "Berg", "adults": 2, "children": 1, "coming": True})).json()
    assert again["mine"]["date_votes"] == [mid, last] and (await client.get(f"/api/parties/{party['id']}")).json()["coming"] == 4
