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

    party = (await client.post("/api/parties", json=_party(start, bring="one", show_guests="names", wishlist=True, person_id=person["id"], budget=1500))).json()
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
    assert page["title"] == "Majas kalas" and page["bring"] == "one" and page["guests"] == {"coming": 0, "names": []}
    assert page["language"] == "sv"  # the host's
    assert [w["title"] for w in page["wishes"]] == ["Lego", "Pyssel"]
    sent = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "last_name": "Berg", "allergies": "Nötter", "companions": [{"first_name": "Ella", "last_name": "Berg", "allergies": "Laktos"}, {"first_name": "Smygis"}]})).json()
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
    sent = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Per", "companions": [{"first_name": "Smygis"}]})).json()
    assert sent["mine"]["companions"] == []
    assert party["steps"] == []  # the timeline template is a child's party's
    assert (await client.post("/api/parties", json=_party(start, ends_at=(start - timedelta(hours=1)).isoformat()))).status_code == 422


async def test_updates_by_email_for_the_guests_who_ask(client, db_session, monkeypatch):
    from app.models import AppSetting
    from app.routers.parties import run_party_reminders
    from app.services import mailer

    db_session.add(AppSetting(key="external_url", value="https://fest.example"))
    await db_session.commit()

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    start = (datetime.now(timezone.utc) + timedelta(days=20)).replace(hour=13, minute=0, second=0, microsecond=0)
    party = (await client.post("/api/parties", json=_party(start, page_theme="jungle"))).json()
    token = party["link"].rsplit("/", 1)[1]
    # No e-mail on the server: the guests aren't asked for an address.
    assert (await client.get(f"/api/party/{token}")).json()["mail"] is False
    out = (await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "username": "u", "password": "secret-pass", "sender": "fest@example.com"})).json()
    assert out["accounts"]["smtp"]["configured"] and out["accounts"]["smtp"]["has_password"] and out["owner"] == "smtp" and "secret-pass" not in str(out)
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
    await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    start = (datetime.now(timezone.utc) + timedelta(days=40)).replace(hour=17, minute=0, second=0, microsecond=0)
    second, third = start + timedelta(days=7), start + timedelta(days=14)
    body = _party(start, kind="dinner", title="Julmiddag", date_poll=True, bring="family", show_guests="names", date_options=[second.isoformat(), third.isoformat()])
    assert (await client.post("/api/parties", json={**body, "date_options": []})).status_code == 422  # one date isn't a vote
    party = (await client.post("/api/parties", json=body)).json()
    assert party["date_poll"] and len(party["date_options"]) == 3 and party["bring"] == "family"
    # Not in the calendar while the date is open.
    events = (await client.get(f"/api/calendar/events?start={start.date()}&end={(third + timedelta(days=1)).date()}")).json()
    assert not any("Julmiddag" in e["title"] for e in events)
    token = party["link"].rsplit("/", 1)[1]
    first, mid, last = party["date_options"]

    # The families vote and say how many are coming; a date not on offer is dropped.
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["date_poll"] and page["date_options"] == [first, mid, last] and page["bring"] == "family"
    berg = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "last_name": "Berg", "companions": [{"first_name": "Lars", "last_name": "Berg"}, {"first_name": "Ella", "child": True, "allergies": "Laktos"}, {"first_name": "Ture", "child": True}], "date_votes": [mid, last, "2020-01-01T00:00:00+00:00"], "email": "saga@example.com", "updates": True})).json()
    assert berg["mine"]["date_votes"] == [mid, last] and berg["mine"]["coming"] and "röstat på 2 datum" in sent[0][2]
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "date_votes": [first, mid]})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Ola", "companions": [{"first_name": "Eva"}], "date_votes": []})
    page = (await client.get(f"/api/party/{token}")).json()
    assert [(r["votes"], r["people"]) for r in page["tally"]] == [(1, 1), (2, 5), (1, 4)]
    assert page["guests"]["names"][:4] == ["Saga Berg", "Lars Berg", "Ella", "Ture"]
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
    again = (await client.post(f"/api/party/{token}/reply?key={berg['key']}", json={"first_name": "Saga", "last_name": "Berg", "companions": [{"first_name": "Lars", "last_name": "Berg"}, {"first_name": "Ella", "child": True}], "coming": True})).json()
    assert again["mine"]["date_votes"] == [mid, last] and (await client.get(f"/api/parties/{party['id']}")).json()["coming"] == 4


async def test_own_themes_pictures_and_more_kinds(client):
    import io

    from PIL import Image

    ids = await _family(client)
    maja = (await client.post("/api/birthdays/people", json={"name": "Maja", "user_id": ids["maja"]})).json()
    leo = (await client.post("/api/birthdays/people", json={"name": "Leo"})).json()
    start = (datetime.now(timezone.utc) + timedelta(days=30)).replace(hour=15, minute=0, second=0, microsecond=0)

    # An own theme, kept to use again, with its own pictures.
    theme = (await client.post("/api/parties/themes", json={"name": "Majas lila", "bg": "#f3e8ff", "bg2": "#fff7fb", "accent": "#7c3aed", "ink": "#2e1065", "pattern": "stars", "decor": "💜🦄⭐"})).json()
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1200), "#7c3aed").save(buf, "PNG")
    theme = (await client.post(f"/api/parties/themes/{theme['id']}/pictures/header", files={"file": ("top.png", buf.getvalue(), "image/png")})).json()
    assert theme["header"] and theme["background"] is None
    # A see-through picture is laid on the theme's colour (not black); the font and effect are kept.
    clear = io.BytesIO()
    Image.new("RGBA", (40, 40), (0, 0, 0, 0)).save(clear, "PNG")
    theme = (await client.post(f"/api/parties/themes/{theme['id']}/pictures/background", files={"file": ("logo.png", clear.getvalue(), "image/png")})).json()
    back = await client.get(f"/api/parties/themes/{theme['id']}/pictures/background")
    assert Image.open(io.BytesIO(back.content)).convert("RGB").getpixel((20, 20))[0] > 200  # #f3e8ff, not black
    theme = (await client.put(f"/api/parties/themes/{theme['id']}", json={"name": "Majas lila", "bg": "#f3e8ff", "bg2": "#fff7fb", "accent": "#7c3aed", "ink": "#2e1065", "pattern": "stars", "decor": "💜🦄⭐", "font": "gala", "effect": "bokeh"})).json()
    assert theme["font"] == "gala" and theme["effect"] == "bokeh"
    assert (await client.post(f"/api/parties/themes/{theme['id']}/pictures/header", files={"file": ("x.txt", b"hello", "text/plain")})).status_code == 422
    assert [t["name"] for t in (await client.get("/api/parties/themes")).json()] == ["Majas lila"]

    # A party for two of the children, with the theme and a picture on the invitation; another kind.
    party = (await client.post("/api/parties", json=_party(start, person_ids=[maja["id"], leo["id"]], person_id=maja["id"], page_theme="custom", page_custom_id=theme["id"], bring="family"))).json()
    assert party["person_ids"] == [maja["id"], leo["id"]] and party["page_custom_id"] == theme["id"]
    party = (await client.post(f"/api/parties/{party['id']}/picture", files={"file": ("maja.jpg", buf.getvalue(), "image/png")})).json()
    assert party["invite_image"]
    token = party["link"].rsplit("/", 1)[1]
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["page_theme"] == "custom" and page["page_custom"]["decor"] == "💜🦄⭐" and page["thanks_custom"]["id"] == theme["id"]
    pic = await client.get(f"/api/party/{token}/themes/{theme['id']}/header")
    assert pic.status_code == 200 and pic.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(pic.content)).size == (1600, 800)  # web-sized
    assert (await client.get(f"/api/party/{token}/picture")).status_code == 200
    other = (await client.post("/api/parties/themes", json={"name": "Annan", "bg": "#ffffff", "bg2": "#ffffff", "accent": "#000000", "ink": "#000000"})).json()
    assert (await client.get(f"/api/party/{token}/themes/{other['id']}/header")).status_code == 404

    # Deleting the theme: the party falls back to a built-in look.
    assert (await client.delete(f"/api/parties/themes/{theme['id']}")).status_code == 204
    assert (await client.get(f"/api/parties/{party['id']}")).json()["page_theme"] == "balloons"

    # A match night starts with its own checklist, not a cake.
    match = (await client.post("/api/parties", json=_party(start, kind="match", title="Finalen", page_theme="football"))).json()
    titles = [t["title"] for t in match["tasks"]]
    assert "Kolla avsparken och var den sänds" in titles and not any("tårta" in t.lower() for t in titles)
    assert (await client.post("/api/parties", json=_party(start, page_theme="nope"))).status_code == 422


async def test_mail_services_and_who_may_use_them(client, monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.main import app
    from app.services import mailer

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((conf["host"], conf["sender"], to)))
    await _family(client)
    # Gmail sends as its own address; Brevo from a verified one; both keep their own server.
    out = (await client.put("/api/admin/integrations/email/gmail", json={"username": "lind@gmail.com", "password": "abcd efgh ijkl mnop"})).json()
    assert out["accounts"]["gmail"]["sender"] == "lind@gmail.com" and out["accounts"]["gmail"]["host"] == "smtp.gmail.com" and out["owner"] == "gmail"
    assert (await client.put("/api/admin/integrations/email/brevo", json={"username": "x@smtp-brevo.com", "sender": "fest@burnwall.se"})).status_code == 422  # no key
    out = (await client.put("/api/admin/integrations/email/brevo", json={"username": "x@smtp-brevo.com", "password": "xsmtpsib-key", "sender": "fest@burnwall.se", "sender_name": "Familjen Lind"})).json()
    assert out["accounts"]["brevo"]["host"] == "smtp-relay.brevo.com" and "xsmtpsib-key" not in str(out)
    assert (await client.post("/api/admin/integrations/email/test", json={"provider": "brevo", "to": "a@example.com"})).json() == {"sent": True}
    assert sent[-1] == ("smtp-relay.brevo.com", "fest@burnwall.se", "a@example.com")
    assert (await client.put("/api/admin/integrations/email-use", json={"owner": "gmail", "hosted": "smtp"})).status_code == 422  # not set up

    # A hosted family: no mail until the admin chooses a service for them.
    invite = (await client.post("/api/server/invitations", json={"label": "Gäster", "days": 7})).json()
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await guest.post(f"/api/invite/{invite['url'].rsplit('/', 1)[1]}/family", json={"family_name": "Berg", "display_name": "Olle", "username": "olle", "password": "guestpass1", "email": "o@example.com"})
    start = datetime.now(timezone.utc) + timedelta(days=20)
    theirs = (await guest.post("/api/parties", json=_party(start, title="Olles fest"))).json()
    assert theirs["mail"] is False
    ours = (await client.post("/api/parties", json=_party(start))).json()
    assert ours["mail"] is True
    await client.put("/api/admin/integrations/email-use", json={"owner": "gmail", "hosted": "brevo"})
    assert (await guest.get(f"/api/parties/{theirs['id']}")).json()["mail"] is True
    token = theirs["link"].rsplit("/", 1)[1]
    await guest.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "email": "saga@example.com", "updates": True})
    assert sent[-1] == ("smtp-relay.brevo.com", "fest@burnwall.se", "saga@example.com")
    mine = ours["link"].rsplit("/", 1)[1]
    await client.post(f"/api/party/{mine}/reply", json={"first_name": "Nils", "email": "nils@example.com", "updates": True})
    assert sent[-1] == ("smtp.gmail.com", "lind@gmail.com", "nils@example.com")
    # Removing a service: whoever used it has none.
    out = (await client.delete("/api/admin/integrations/email/brevo")).json()
    assert out["hosted"] == "" and out["owner"] == "gmail" and not out["accounts"]["brevo"]["configured"]
    await guest.aclose()


async def test_the_poster_is_the_hosts_own(client):
    import io

    from PIL import Image

    await _family(client)
    start = (datetime.now(timezone.utc) + timedelta(days=30)).replace(hour=18, minute=0, second=0, microsecond=0)
    party = (await client.post("/api/parties", json=_party(start, kind="party", title="40-årsfest"))).json()
    assert party["layout"] is None and party["assets"] == []  # the theme's own poster
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), "#d9a94a").save(buf, "PNG")
    party = (await client.post(f"/api/parties/{party['id']}/assets", files={"file": ("ballong.png", buf.getvalue(), "image/png")})).json()
    asset = party["assets"][0]["id"]
    layout = [
        {"id": "a", "type": "text", "text": "Den stora {title}!", "font": "gala-display", "align": "center", "size": "xl"},
        {"id": "b", "type": "decor", "items": [{"kind": "sticker", "value": asset}, {"kind": "emoji", "value": "🥂"}]},
        {"id": "c", "type": "calendar", "buttons": ["google", "outlook"]},
    ]
    party = (await client.put(f"/api/parties/{party['id']}", json={"layout": layout})).json()
    assert [b["type"] for b in party["layout"]] == ["text", "decor", "calendar"]
    token = party["link"].rsplit("/", 1)[1]
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["layout"][0]["text"] == "Den stora {title}!" and page["assets"] == party["assets"]
    assert (await client.get(f"/api/party/{token}/assets/{asset}")).status_code == 200
    assert (await client.get(f"/api/party/{token}/assets/nope")).status_code == 404
    # Too big, or a block without a type, is refused; an empty poster is the theme's again.
    assert (await client.put(f"/api/parties/{party['id']}", json={"layout": [{"id": "x", "type": "text", "text": "a" * 70000}]})).status_code == 422
    assert (await client.put(f"/api/parties/{party['id']}", json={"layout": [{"id": "x"}]})).status_code == 422
    assert (await client.put(f"/api/parties/{party['id']}", json={"layout": []})).json()["layout"] is None
    party = (await client.delete(f"/api/parties/{party['id']}/assets/{asset}")).json()
    assert party["assets"] == []


async def test_save_the_date_then_the_invitation_and_the_portal(client, monkeypatch):
    import io

    from httpx import ASGITransport, AsyncClient
    from PIL import Image

    from app.main import app
    from app.services import mailer

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    start = (datetime.now(timezone.utc) + timedelta(days=60)).replace(hour=18, minute=0, second=0, microsecond=0)
    party = (await client.post("/api/parties", json=_party(start, kind="party", title="40-årsfest"))).json()
    party = (await client.put(f"/api/parties/{party['id']}", json={"phase": "save", "playlist_url": "https://open.spotify.com/playlist/abc123", "layouts": {"save": [{"id": "s1", "type": "text", "text": "Spara datumet!"}]}})).json()
    assert party["phase"] == "save" and party["layouts"]["save"][0]["text"] == "Spara datumet!" and party["layouts"]["invite"] is None
    assert (await client.put(f"/api/parties/{party['id']}", json={"playlist_url": "https://evil.example/x"})).status_code == 422
    token = party["link"].rsplit("/", 1)[1]

    # A guest signs up from the save-the-date: not a reply yet, but told when the invitation is out.
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["phase"] == "save" and page["playlist_url"].endswith("abc123")
    signed = (await client.post(f"/api/party/{token}/subscribe", json={"first_name": "Saga", "email": "Saga@Example.com"})).json()
    assert "Spara datumet" in sent[-1][2] or "Save the date" in sent[-1][2]
    detail = (await client.get(f"/api/parties/{party['id']}")).json()
    assert detail["signed_up"] == 1 and detail["not_coming"] == 0 and detail["coming"] == 0
    party = (await client.put(f"/api/parties/{party['id']}", json={"phase": "invite"})).json()
    assert sent[-1][0] == "saga@example.com" and "inbjudan" in sent[-1][1].lower()
    # Her reply with the same key: the sign-up becomes the reply.
    await client.post(f"/api/party/{token}/reply?key={signed['key']}", json={"first_name": "Saga", "email": "saga@example.com", "updates": True})
    detail = (await client.get(f"/api/parties/{party['id']}")).json()
    assert detail["signed_up"] == 0 and detail["coming"] == 1 and len(detail["guests"]) == 1

    # The portal: closed until the hosts open it; then the guests upload, into an album in the vault.
    assert detail["portal"] is None
    detail = (await client.post(f"/api/parties/{party['id']}/portal")).json()
    portal = detail["portal"]["link"].rsplit("/", 1)[1]
    assert detail["portal"]["open"] and "<svg" in detail["portal"]["qr_svg"]
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    info = (await guest.get(f"/api/party-portal/{portal}")).json()
    assert info["title"] == "40-årsfest" and info["photos"] == []
    buf = io.BytesIO()
    Image.new("RGB", (800, 600), "#d9a94a").save(buf, "JPEG")
    up = await guest.post(f"/api/party-portal/{portal}/photos?name=Saga", files={"file": ("bild.jpg", buf.getvalue(), "image/jpeg")})
    assert up.status_code == 201
    info = (await guest.get(f"/api/party-portal/{portal}")).json()
    assert info["photos"] == [up.json()["id"]]
    assert (await guest.get(f"/api/party-portal/{portal}/photos/{up.json()['id']}")).status_code == 200
    media = (await client.get(f"/api/albums/{detail['portal']['album_id']}/media")).json()
    assert len(media) == 1 and media[0]["original_name"].startswith("Saga")
    assert (await guest.post(f"/api/party-portal/{portal}/photos", files={"file": ("x.txt", b"hello", "text/plain")})).status_code == 422
    await client.delete(f"/api/parties/{party['id']}/portal")
    assert (await guest.get(f"/api/party-portal/{portal}")).status_code == 404
    await guest.aclose()


async def test_the_guest_list_and_mails_at_their_time(client, db_session, monkeypatch):
    from app.models import AppSetting
    from app.routers.parties import run_party_mailings
    from app.services import mailer

    db_session.add(AppSetting(key="external_url", value="https://fest.example"))
    await db_session.commit()

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    start = (datetime.now(timezone.utc) + timedelta(days=60)).replace(hour=18, minute=0, second=0, microsecond=0)
    party = (await client.post("/api/parties", json=_party(start, kind="party", title="Sommarfest"))).json()
    pid = party["id"]
    # The hosts put two on the list, with their e-mail; they haven't replied.
    await client.post(f"/api/parties/{pid}/guests", json={"first_name": "Saga", "email": "saga@example.com", "invited": True})
    detail = (await client.post(f"/api/parties/{pid}/guests", json={"first_name": "Nils", "email": "nils@example.com", "invited": True})).json()
    assert detail["signed_up"] == 2 and detail["coming"] == 0 and detail["not_coming"] == 0
    # A save-the-date now, the invitation later: each guest's mail has their own link.
    detail = (await client.post(f"/api/parties/{pid}/mailings", json={"kind": "save", "send_at": datetime.now(timezone.utc).isoformat()})).json()
    assert sorted(s[0] for s in sent) == ["nils@example.com", "saga@example.com"] and all("?key=" in s[2] for s in sent)
    assert detail["mailings"][0]["sent_count"] == 2
    saga_key = next(s[2] for s in sent if s[0] == "saga@example.com").split("?key=")[1].split()[0]
    later = datetime.now(timezone.utc) + timedelta(days=3)
    detail = (await client.post(f"/api/parties/{pid}/mailings", json={"kind": "invite", "send_at": later.isoformat()})).json()
    assert detail["mailings"][1]["sent_at"] is None
    # Saga replies with her own link; the reminder goes only to those who haven't.
    token = party["link"].rsplit("/", 1)[1]
    await client.post(f"/api/party/{token}/reply?key={saga_key}", json={"first_name": "Saga", "email": "saga@example.com", "updates": True})
    detail = (await client.get(f"/api/parties/{pid}")).json()
    assert detail["coming"] == 1 and detail["signed_up"] == 1 and len(detail["guests"]) == 2
    sent.clear()
    await client.post(f"/api/parties/{pid}/mailings", json={"kind": "remind", "audience": "waiting", "send_at": (later + timedelta(days=1)).isoformat()})
    assert await run_party_mailings(db_session, later + timedelta(days=2)) == 3  # the invitation to both, the reminder to Nils
    assert [s[0] for s in sent if "inte fått ditt svar" in s[2]] == ["nils@example.com"]
    # The day's plan: a point hidden from the guests stays off the portal.
    detail = (await client.post(f"/api/parties/{pid}/steps", json={"at": "21:00", "title": "Överraskningen", "hidden": True})).json()
    detail = (await client.post(f"/api/parties/{pid}/steps", json={"at": "18:00", "title": "Middag"})).json()
    portal = (await client.post(f"/api/parties/{pid}/portal")).json()["portal"]["link"].rsplit("/", 1)[1]
    assert [s["title"] for s in (await client.get(f"/api/party-portal/{portal}")).json()["steps"]] == ["Middag"]


async def test_one_link_from_the_save_the_date_to_the_thank_you(client, db_session, monkeypatch):
    from app.models import AppSetting
    from app.routers.parties import run_party_mailings, run_party_reminders, run_party_thanks
    from app.services import mailer

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    start = (datetime.now(timezone.utc) + timedelta(days=60)).replace(hour=18, minute=0, second=0, microsecond=0)
    party = (await client.post("/api/parties", json=_party(start, kind="party", title="Sommarfest", rsvp_by=(start - timedelta(days=10)).date().isoformat()))).json()
    pid, token = party["id"], party["link"].rsplit("/", 1)[1]
    assert party["rsvp_remind_days"] == 3 and party["stage"] == "invite"
    await client.put(f"/api/parties/{pid}", json={"phase": "save"})

    # Saga and Nils register on the save-the-date: a name and an e-mail, and their own link.
    assert (await client.post(f"/api/party/{token}/subscribe", json={"first_name": "Saga"})).status_code == 422
    await client.post(f"/api/party/{token}/subscribe", json={"first_name": "Saga", "email": "saga@example.com"})
    await client.post(f"/api/party/{token}/subscribe", json={"first_name": "Nils", "email": "nils@example.com"})
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "save"

    # The scheduled invitation switches the link and goes out, each with their own link. No server
    # address: it waits rather than sending links that lead nowhere.
    sent.clear()
    await client.post(f"/api/parties/{pid}/mailings", json={"kind": "invite", "send_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()})
    day2 = datetime.now(timezone.utc) + timedelta(days=2)
    assert await run_party_mailings(db_session, day2) == 0 and sent == []
    assert (await client.get(f"/api/parties/{pid}")).json()["address_set"] is False
    db_session.add(AppSetting(key="external_url", value="https://fest.example"))
    await db_session.commit()
    assert await run_party_mailings(db_session, day2) == 2
    assert {s[0] for s in sent} == {"saga@example.com", "nils@example.com"}
    link = next(s[2] for s in sent if s[0] == "saga@example.com").split("https://fest.example", 1)[1].split()[0]
    assert link.startswith(f"/party/{token}?key=")
    key = link.split("?key=")[1]
    page = (await client.get(f"/api/party/{token}?key={key}")).json()
    assert page["stage"] == "invite" and page["mine"]["first_name"] == "Saga" and page["mine"]["pending"] is True

    # Saga replies through her link, and sees her reply when she opens it again.
    await client.post(f"/api/party/{token}/reply?key={key}", json={"first_name": "Saga", "email": "saga@example.com", "updates": True, "coming": True})
    mine = (await client.get(f"/api/party/{token}?key={key}")).json()["mine"]
    assert mine["coming"] is True and mine["pending"] is False

    # The reminder goes by itself, once, three days before the last day, only to who hasn't replied.
    sent.clear()
    last = datetime.combine(start.date() - timedelta(days=10), datetime.min.time(), tzinfo=timezone.utc)
    await run_party_reminders(db_session, last - timedelta(days=5) + timedelta(hours=9))
    assert sent == []
    await run_party_reminders(db_session, last - timedelta(days=3) + timedelta(hours=9))
    await run_party_reminders(db_session, last - timedelta(days=2) + timedelta(hours=9))
    assert [s[0] for s in sent] == ["nils@example.com"] and "?key=" in sent[0][2]

    # At its time the same link becomes the portal: its album is ready, and the portal opens.
    portal_at = start - timedelta(minutes=30)
    detail = (await client.put(f"/api/parties/{pid}", json={"portal_at": portal_at.isoformat()})).json()
    assert detail["stage"] == "invite" and detail["portal"]["album_id"] and detail["portal"]["open"] is False
    ptoken = detail["portal"]["link"].rsplit("/", 1)[1]
    assert (await client.get(f"/api/party/{token}")).json()["portal_token"] is None
    assert (await client.get(f"/api/party-portal/{ptoken}")).status_code == 404
    soon = datetime.now(timezone.utc) - timedelta(minutes=1)
    await client.put(f"/api/parties/{pid}", json={"portal_at": soon.isoformat()})
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["stage"] == "portal" and page["portal_token"] == ptoken
    assert (await client.get(f"/api/party-portal/{ptoken}")).status_code == 200

    # The thank-you at its time – not without anything to say – to those who came, and the link shows it.
    sent.clear()
    at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await client.put(f"/api/parties/{pid}", json={"thanks_at": at.isoformat()})
    assert await run_party_thanks(db_session) == 0
    await client.put(f"/api/parties/{pid}", json={"thanks_text": "Tack för en fin kväll!"})
    assert await run_party_thanks(db_session) == 1 and await run_party_thanks(db_session) == 0
    assert [s[0] for s in sent] == ["saga@example.com"] and "Tack för en fin kväll!" in sent[0][2]
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["stage"] == "thanks" and page["portal_token"] is None


async def test_mail_through_exchange_online(client, monkeypatch):
    import httpx

    from app.services import mailer

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if "login.microsoftonline.com" in str(request.url):
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        if "stop@" in request.content.decode():
            return httpx.Response(403, json={"error": {"code": "ErrorAccessDenied", "message": "Access is denied."}})
        return httpx.Response(202)

    real = httpx.AsyncClient
    await _family(client)
    # The tenant, the client id, the secret and the mailbox are all needed; the secret never comes back.
    assert (await client.put("/api/admin/integrations/email/exchange", json={"sender": "fest@lind.se"})).status_code == 422
    assert (await client.put("/api/admin/integrations/email/exchange", json={"tenant_id": "../evil", "client_id": "11111111-2222-3333-4444-555555555555", "password": "s3cret", "sender": "fest@lind.se"})).status_code == 422
    out = (await client.put("/api/admin/integrations/email/exchange", json={"tenant_id": "lind.onmicrosoft.com", "client_id": "11111111-2222-3333-4444-555555555555", "password": "s3cret-value", "sender": "fest@lind.se"})).json()
    assert out["owner"] == "exchange" and out["accounts"]["exchange"]["client_id"].startswith("1111") and "s3cret-value" not in str(out)

    mailer._tokens.clear()
    conf = mailer.account({"accounts": {"exchange": {"tenant_id": "lind.onmicrosoft.com", "client_id": "11111111-2222-3333-4444-555555555555", "password": "s3cret-value", "sender": "fest@lind.se"}}}, "exchange")
    monkeypatch.setattr(mailer.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    await mailer.send_with(conf, "saga@example.com", "Hej", "Välkommen!")
    await mailer.send_with(conf, "nils@example.com", "Hej", "Välkommen!")
    assert [str(c.url).split("?")[0] for c in calls] == [
        "https://login.microsoftonline.com/lind.onmicrosoft.com/oauth2/v2.0/token",
        "https://graph.microsoft.com/v1.0/users/fest@lind.se/sendMail",
        "https://graph.microsoft.com/v1.0/users/fest@lind.se/sendMail",
    ]  # one token, kept
    assert calls[1].headers["authorization"] == "Bearer tok" and b"saga@example.com" in calls[1].content
    # Microsoft's refusal comes back in its own words.
    with pytest.raises(mailer.MailError, match="403: Access is denied"):
        await mailer.send_with(conf, "stop@example.com", "Hej", "x")


async def test_a_familys_templates(client):
    await _family(client)
    path = "/api/parties/templates"
    blocks = [{"id": "a", "type": "text", "text": "{title}"}]
    look = {"bg": "#000000", "bg2": "#111111", "accent": "#d9a94a", "ink": "#ffffff", "font": "gala", "effect": "bokeh"}
    assert (await client.get(path)).json() == []

    made = (await client.post(path, json={"name": " Natten ", "look": look, "layouts": {"invite": blocks, "save": None}})).json()
    assert made["name"] == "Natten" and made["theme"] is None and made["look"]["accent"] == "#d9a94a" and made["layouts"]["invite"] == blocks
    themed = (await client.post(path, json={"name": "Guld", "theme": "glamour", "layouts": {"invite": blocks}})).json()
    assert themed["theme"] == "glamour"
    assert [x["name"] for x in (await client.get(path)).json()] == ["Natten", "Guld"]

    # Only the app's themes, the four posters, plain colours and known parts come in.
    for bad in (
        {"name": "x", "theme": "../nope", "layouts": {"invite": blocks}},
        {"name": "x", "layouts": {"other": blocks}},
        {"name": "x", "layouts": {"invite": [{"id": "a", "type": "html", "html": "<script>"}]}},
        {"name": "x", "look": {**look, "bg": "url(x)"}, "layouts": {"invite": blocks}},
        {"name": "", "layouts": {"invite": blocks}},
    ):
        assert (await client.post(path, json=bad)).status_code == 422, bad

    # Used on a party: its posters, the party's own to change from then on.
    start = datetime.now(timezone.utc) + timedelta(days=30)
    party = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    out = (await client.put(f"/api/parties/{party['id']}", json={"page_theme": "glamour", "thanks_theme": "glamour", "layouts": {"save": [], "invite": blocks, "portal": [], "thanks": []}})).json()
    assert out["page_theme"] == "glamour" and out["layouts"]["invite"] == blocks and out["layouts"]["save"] is None

    assert (await client.delete(f"{path}/{themed['id']}")).status_code == 204
    assert (await client.delete(f"{path}/{themed['id']}")).status_code == 404
    assert [x["name"] for x in (await client.get(path)).json()] == ["Natten"]
    # They stay with the family, and with the adults.
    await client.post("/api/family/members", json={"username": "maja", "display_name": "Maja", "password": "pass1234", "role": "child"})
    await _as(client, "maja")
    assert (await client.get(path)).status_code == 403
