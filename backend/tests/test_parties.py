"""3.4.0: parties – the shared invitation page for the guests, and the adults' planning."""
import uuid
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
    assert page["mail"] is True and page["page_theme"] == "jungle"

    # A guest with an address who asks for updates gets a confirmation; one who doesn't, nothing.
    mine = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "email": "Saga@Example.com", "updates": True})).json()
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "email": "nils@example.com"})
    assert [s[0] for s in sent] == ["saga@example.com"] and "Majas kalas" in sent[0][1] and "?unsubscribe=" in sent[0][2]
    # A new time tells her; publishing the thank-you; a message from the hosts.
    await client.put(f"/api/parties/{party['id']}", json={"starts_at": (start + timedelta(hours=1)).isoformat(), "ends_at": (start + timedelta(hours=3)).isoformat()})
    await client.put(f"/api/parties/{party['id']}", json={"thanks_text": "Tack!", "thanks_published": True})
    assert (await client.post(f"/api/parties/{party['id']}/announce", json={"subject": "Parkering", "text": "Parkera på gatan."})).json() == {"sent": 1}
    assert len(sent) == 4 and "Parkera på gatan." in sent[-1][2]
    # The thank-you wears the party's one theme.
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["stage"] == "thanks" and page["page_theme"] == "jungle" and "thanks_theme" not in page

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
    assert page["page_theme"] == "custom" and page["page_custom"]["decor"] == "💜🦄⭐"
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
    assert (await guest.get(f"/api/party-portal/{portal}")).json()["locked"] is True
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
    assert (await client.get(f"/api/party-portal/{ptoken}")).json()["locked"] is True
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
    out = (await client.put(f"/api/parties/{party['id']}", json={"page_theme": "glamour", "layouts": {"save": [], "invite": blocks, "portal": [], "thanks": []}})).json()
    assert out["page_theme"] == "glamour" and out["layouts"]["invite"] == blocks and out["layouts"]["save"] is None

    assert (await client.delete(f"{path}/{themed['id']}")).status_code == 204
    assert (await client.delete(f"{path}/{themed['id']}")).status_code == 404
    assert [x["name"] for x in (await client.get(path)).json()] == ["Natten"]
    # They stay with the family, and with the adults.
    await client.post("/api/family/members", json={"username": "maja", "display_name": "Maja", "password": "pass1234", "role": "child"})
    await _as(client, "maja")
    assert (await client.get(path)).status_code == 403


async def test_a_guests_personal_link_for_the_hosts_to_send(client, db_session):
    from app.models import PartyGuest

    await _family(client)
    start = datetime.now(timezone.utc) + timedelta(days=30)
    party = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    pid, token = party["id"], party["link"].rsplit("/", 1)[1]
    # Someone without e-mail, added by the hosts: the link is theirs, and it knows them.
    detail = (await client.post(f"/api/parties/{pid}/guests", json={"first_name": "Saga", "invited": True})).json()
    gid = detail["guests"][0]["id"]
    assert "key" not in str(detail["guests"][0])
    link = (await client.post(f"/api/parties/{pid}/guests/{gid}/link")).json()["link"]
    assert f"/party/{token}?key=" in link
    key = link.split("?key=")[1]
    mine = (await client.get(f"/api/party/{token}?key={key}")).json()["mine"]
    assert mine["first_name"] == "Saga" and mine["pending"] is True
    assert (await client.post(f"/api/parties/{pid}/guests/{gid}/link")).json()["link"] == link  # the same each time

    # A guest from before keys were kept gets one; the link works.
    row = await db_session.get(PartyGuest, uuid.UUID(gid))
    row.key_encrypted = None
    await db_session.commit()
    fresh = (await client.post(f"/api/parties/{pid}/guests/{gid}/link")).json()["link"]
    assert fresh != link
    assert (await client.get(f"/api/party/{token}?key={fresh.split('?key=')[1]}")).json()["mine"]["first_name"] == "Saga"

    # Only the family's adults, and only this party's guests.
    other = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    assert (await client.post(f"/api/parties/{other['id']}/guests/{gid}/link")).status_code == 404
    await client.post("/api/family/members", json={"username": "maja", "display_name": "Maja", "password": "pass1234", "role": "child"})
    await _as(client, "maja")
    assert (await client.post(f"/api/parties/{pid}/guests/{gid}/link")).status_code == 403


async def test_the_pages_a_party_has(client):
    await _family(client)
    start = datetime.now(timezone.utc) + timedelta(days=30)
    party = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    pid, token = party["id"], party["link"].rsplit("/", 1)[1]
    assert party["pages"] == ["save", "invite", "portal", "thanks"]
    qr = [t for t in party["tasks"] if t["action"] == "print_qr"]
    assert len(qr) == 1 and not qr[0]["done"]

    # Only the invitation: the save-the-date, the portal and the thank-you are off, whatever was set.
    await client.put(f"/api/parties/{pid}", json={"phase": "save", "portal_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()})
    await client.post(f"/api/parties/{pid}/mailings", json={"kind": "thanks", "send_at": (start + timedelta(days=3)).isoformat()})
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "portal"
    only = (await client.put(f"/api/parties/{pid}", json={"pages": ["invite"]})).json()
    assert only["pages"] == ["invite"] and only["phase"] == "invite" and only["mailings"] == []
    assert only["portal"]["at"] is None and not [t for t in only["tasks"] if t["action"] == "print_qr"]
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "invite"
    assert (await client.post(f"/api/parties/{pid}/portal")).status_code == 409
    await client.put(f"/api/parties/{pid}", json={"thanks_text": "Tack!", "thanks_published": True})
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "invite"

    # The invitation can't be chosen away; the portal comes back with its task, once.
    back = (await client.put(f"/api/parties/{pid}", json={"pages": ["portal"]})).json()
    assert back["pages"] == ["invite", "portal"] and len([t for t in back["tasks"] if t["action"] == "print_qr"]) == 1
    again = (await client.put(f"/api/parties/{pid}", json={"pages": ["invite", "portal"]})).json()
    assert len([t for t in again["tasks"] if t["action"] == "print_qr"]) == 1
    assert (await client.put(f"/api/parties/{pid}", json={"pages": ["nope"]})).status_code == 422


async def test_the_portals_link_ends(client):
    await _family(client)
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=1)
    party = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    pid, token = party["id"], party["link"].rsplit("/", 1)[1]

    # Printing the QR code doesn't open anything.
    ready = (await client.post(f"/api/parties/{pid}/portal/prepare")).json()
    code = ready["portal"]["link"].rsplit("/", 1)[1]
    assert ready["portal"]["open"] is False and (await client.get(f"/api/party-portal/{code}")).json()["locked"] is True

    # A time for it brings an end by itself, a little after the party.
    out = (await client.put(f"/api/parties/{pid}", json={"portal_at": (now - timedelta(minutes=1)).isoformat()})).json()
    ends = datetime.fromisoformat(party["ends_at"].replace("Z", "+00:00"))
    assert datetime.fromisoformat(out["portal"]["until"].replace("Z", "+00:00")) == (ends if ends.tzinfo else ends.replace(tzinfo=timezone.utc)) + timedelta(hours=3)
    assert (await client.get(f"/api/party-portal/{code}")).status_code == 200
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "portal"

    # The morning after: the cleaners' phones get nothing, and the guests' link is back on the invitation.
    await client.put(f"/api/parties/{pid}", json={"portal_until": (now - timedelta(seconds=1)).isoformat(), "portal_at": (now - timedelta(hours=2)).isoformat()})
    assert (await client.get(f"/api/party-portal/{code}")).status_code == 404
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["stage"] == "invite" and page["portal_token"] is None
    assert (await client.put(f"/api/parties/{pid}", json={"portal_until": (now - timedelta(hours=3)).isoformat()})).status_code == 422

    # Opened again by hand it gets a new end; no end at all has to be asked for.
    reopened = (await client.post(f"/api/parties/{pid}/portal")).json()
    assert reopened["portal"]["open"] is True and datetime.fromisoformat(reopened["portal"]["until"].replace("Z", "+00:00")) > now
    open_ended = (await client.put(f"/api/parties/{pid}", json={"portal_until": None})).json()
    assert open_ended["portal"]["until"] is None


async def test_bringing_in_a_guest_list(client):
    await _family(client)
    start = datetime.now(timezone.utc) + timedelta(days=30)
    party = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    pid, token = party["id"], party["link"].rsplit("/", 1)[1]
    await client.post(f"/api/parties/{pid}/guests", json={"first_name": "Nils", "last_name": "Ek", "coming": True})
    out = (await client.post(f"/api/parties/{pid}/guests/import", json={"guests": [
        {"first_name": "Saga", "last_name": "Berg", "email": "Saga@Example.com", "allergies": "Nötter"},
        {"first_name": "Nils", "last_name": "Ek"},
        {"first_name": "Saga B", "email": "saga@example.com"},
    ]})).json()
    assert out["added"] == 1 and out["skipped"] == 2
    saga = next(g for g in out["party"]["guests"] if g["first_name"] == "Saga")
    assert saga["pending"] is True and saga["coming"] is False and saga["email"] == "saga@example.com" and saga["updates"] is True and saga["allergies"] == "Nötter"
    nils = next(g for g in out["party"]["guests"] if g["first_name"] == "Nils")
    assert nils["coming"] is True  # who's already there stays as they are
    link = (await client.post(f"/api/parties/{pid}/guests/{saga['id']}/link")).json()["link"]
    assert (await client.get(f"/api/party/{token}?key={link.split('?key=')[1]}")).json()["mine"]["first_name"] == "Saga"
    assert (await client.post(f"/api/parties/{pid}/guests/import", json={"guests": [{"first_name": "x", "email": "not-an-address"}]})).status_code == 422
    assert (await client.post(f"/api/parties/{pid}/guests/import", json={"guests": []})).status_code == 422


async def test_the_seating(client):
    await _family(client)
    start = datetime.now(timezone.utc) + timedelta(days=30)
    party = (await client.post("/api/parties", json=_party(start, kind="party"))).json()
    pid = party["id"]
    guest = (await client.post(f"/api/parties/{pid}/guests", json={"first_name": "Saga", "coming": True})).json()["guests"][0]["id"]
    tables = [{"id": "a", "name": "Bord 1", "seats": 8}, {"id": "b", "name": "Bord 2", "seats": 6}]
    assert (await client.put(f"/api/parties/{pid}", json={"tables": tables})).json()["tables"] == tables
    seat = f"/api/parties/{pid}/guests/{guest}/table"
    assert (await client.put(seat, json={"table_id": "a"})).json()["guests"][0]["table_id"] == "a"
    assert (await client.put(seat, json={"table_id": "nope"})).status_code == 404
    # A table taken away: nobody sits at it any more.
    out = (await client.put(f"/api/parties/{pid}", json={"tables": tables[1:]})).json()
    assert out["guests"][0]["table_id"] is None
    assert (await client.put(f"/api/parties/{pid}", json={"tables": [tables[1], tables[1]]})).status_code == 422
    assert (await client.put(f"/api/parties/{pid}", json={"tables": [{"id": "../x", "name": "x"}]})).status_code == 422


async def _token_party(client, **extra):
    start = extra.pop("start", datetime.now(timezone.utc) + timedelta(days=30))
    party = (await client.post("/api/parties", json=_party(start, kind="party", **extra))).json()
    return party["id"], party["link"].rsplit("/", 1)[1], start


async def test_speeches_the_menu_and_practical_information(client):
    await _family(client)
    pid, token, _ = await _token_party(client)
    menu = [{"id": "kott", "name": "Kött"}, {"id": "veg", "name": "Vegetariskt"}]
    await client.put(f"/api/parties/{pid}", json={"menu": menu, "speech_signup": True, "practical": {"parking": "  Bakom huset ", "lodging": ""}})
    page = (await client.get(f"/api/party/{token}")).json()
    assert page["menu"] == menu and page["speech_signup"] is True and page["practical"] == {"parking": "Bakom huset"}

    reply = {"first_name": "Saga", "coming": True, "menu_choice": "veg", "wants_speech": True, "speech_note": "Två minuter", "companions": []}
    await client.put(f"/api/parties/{pid}", json={"bring": "one"})
    reply["companions"] = [{"first_name": "Ella", "menu_choice": "kott"}]
    assert (await client.post(f"/api/party/{token}/reply", json=reply)).status_code in (200, 201)
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "coming": True, "menu_choice": "fel"})
    detail = (await client.get(f"/api/parties/{pid}")).json()
    assert {x["name"]: x["people"] for x in detail["menu_tally"]} == {"Kött": 1, "Vegetariskt": 1, "": 1}
    assert detail["speeches"] == [{"id": detail["guests"][0]["id"], "name": "Saga", "note": "Två minuter"}]
    # No sign-up on offer: no speech comes in.
    await client.put(f"/api/parties/{pid}", json={"speech_signup": False})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Maja", "coming": True, "wants_speech": True})
    assert not next(g for g in (await client.get(f"/api/parties/{pid}")).json()["guests"] if g["first_name"] == "Maja")["wants_speech"]


async def test_the_check_in(client, db_session, monkeypatch):
    await _family(client)
    now = datetime.now(timezone.utc)
    pid, token, start = await _token_party(client)
    out = (await client.put(f"/api/parties/{pid}", json={"pages": ["invite", "checkin"]})).json()
    assert out["pages"] == ["invite", "checkin"]
    assert datetime.fromisoformat(out["checkin_at"].replace("Z", "+00:00")).replace(tzinfo=timezone.utc) == datetime.fromisoformat(out["starts_at"].replace("Z", "+00:00")).replace(tzinfo=timezone.utc) - timedelta(days=3)
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "invite"
    await client.put(f"/api/parties/{pid}", json={"checkin_at": (now - timedelta(minutes=1)).isoformat()})
    assert (await client.get(f"/api/party/{token}")).json()["stage"] == "checkin"

    key = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "coming": True})).json()["key"]
    assert (await client.post(f"/api/party/{token}/checkin?key=fel", json={"going": True})).status_code == 404
    assert (await client.post(f"/api/party/{token}/checkin?key={key}", json={"going": True})).json()["mine"]["checkin"] == "yes"
    mine = (await client.post(f"/api/party/{token}/checkin?key={key}", json={"going": False, "message": "Sjuk"})).json()["mine"]
    assert mine["checkin"] == "no" and mine["coming"] is False and mine["message"] == "Sjuk"
    detail = (await client.get(f"/api/parties/{pid}")).json()
    assert detail["guests"][0]["checkin"] == "no" and detail["coming"] == 0
    # Chosen away: gone.
    assert (await client.put(f"/api/parties/{pid}", json={"pages": ["invite"]})).json()["checkin_at"] is None
    assert (await client.post(f"/api/party/{token}/checkin?key={key}", json={"going": True})).status_code == 404


async def test_the_portal_before_its_time(client):
    await _family(client)
    now = datetime.now(timezone.utc)
    pid, token, _ = await _token_party(client)
    code = (await client.post(f"/api/parties/{pid}/portal/prepare")).json()["portal"]["link"].rsplit("/", 1)[1]
    early = (await client.get(f"/api/party-portal/{code}")).json()
    assert early["locked"] is True and early["opens_at"] is None and "photos" not in early and "steps" not in early
    opens = now + timedelta(days=2)
    await client.put(f"/api/parties/{pid}", json={"portal_at": opens.isoformat()})
    assert (await client.get(f"/api/party-portal/{code}")).json()["opens_at"]
    assert (await client.get("/api/party-portal/fel-kod")).status_code == 404


async def test_the_hosts_own_mails(client, monkeypatch):
    from app.services import mailer

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append((to, subject, text)))
    await _family(client)
    await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    pid, token, _ = await _token_party(client)
    templates = (await client.get(f"/api/parties/{pid}")).json()["mail_templates"]
    assert {t["kind"] for t in templates} >= {"invited", "checkin", "thanks", "confirm"} and all(t["default_text"] for t in templates)
    assert (await client.put(f"/api/parties/{pid}", json={"mail_texts": {"nope": {"subject": "x"}}})).status_code == 422
    await client.put(f"/api/parties/{pid}", json={"mail_texts": {"confirm": {"subject": "Hurra {name}", "text": "Tack {name} {okänd}! Länk: {link}"}}})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "email": "saga@example.com", "updates": True, "coming": True})
    assert sent[0][1] == "Hurra Saga"
    assert "Tack Saga {okänd}! Länk: " in sent[0][2] and sent[0][2].count("?key=") == 1  # the link once, and not lost
    # Without the field the link still goes along; empty is the app's own wording again.
    sent.clear()
    await client.put(f"/api/parties/{pid}", json={"mail_texts": {"confirm": {"subject": "", "text": "Bara tack"}}})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "email": "nils@example.com", "updates": True, "coming": True})
    assert "Bara tack" in sent[0][2] and "?key=" in sent[0][2]
    out = (await client.put(f"/api/parties/{pid}", json={"mail_texts": {"confirm": {"subject": "", "text": ""}}})).json()
    assert next(t for t in out["mail_templates"] if t["kind"] == "confirm")["text"] == ""


async def test_suppliers(client, monkeypatch):
    from app.services import recipe_search

    await _family(client)
    pid, _, _ = await _token_party(client)
    assert (await client.get(f"/api/parties/{pid}/vendors/search?q=catering")).json() == {"enabled": False, "hits": []}
    out = (await client.post(f"/api/parties/{pid}/vendors", json={"category": "dj", "name": "DJ Saga", "url": "https://dj.example", "price": 4000})).json()
    vid = out["vendors"][0]["id"]
    assert out["vendors"][0]["status"] == "idea"
    assert (await client.post(f"/api/parties/{pid}/vendors", json={"name": "x", "url": "javascript:alert(1)"})).status_code == 422
    booked = (await client.post(f"/api/parties/{pid}/vendors/{vid}/budget")).json()
    assert booked["vendors"][0]["status"] == "booked" and booked["vendors"][0]["in_budget"] and booked["spent"] == 4000
    assert (await client.post(f"/api/parties/{pid}/vendors/{vid}/budget")).json()["spent"] == 4000  # once
    other = (await client.post(f"/api/parties/{pid}/vendors", json={"name": "Utan pris"})).json()["vendors"][1]["id"]
    assert (await client.post(f"/api/parties/{pid}/vendors/{other}/budget")).status_code == 422
    # The search: only the words go out.
    seen = []

    async def fake(url, words, language="en", recipe=True):
        seen.append((words, recipe))
        return [recipe_search.Hit(title="Catering AB", url="https://c.example", site="c.example", snippet="Mat")]

    async def on(db):
        return "http://searxng:8080"

    monkeypatch.setattr(recipe_search, "get_url", on)
    monkeypatch.setattr(recipe_search, "search", fake)
    hits = (await client.get(f"/api/parties/{pid}/vendors/search?q=catering Spånga")).json()
    assert hits["enabled"] and hits["hits"][0]["site"] == "c.example" and seen == [("catering Spånga", False)]
    assert (await client.delete(f"/api/parties/{pid}/vendors/{vid}")).json()["spent"] == 4000


async def test_a_toastmaster_with_a_personal_link(client):
    await _family(client)
    me = (await client.get("/api/auth/me")).json()
    pid, _, _ = await _token_party(client)
    other, _, _ = await _token_party(client)
    made = (await client.post(f"/api/parties/{pid}/helpers", json={"name": "Lars", "role": "toastmaster", "days_after": 1})).json()
    assert made["mailed"] is False
    helper = made["party"]["helpers"][0]
    link = (await client.post(f"/api/parties/{pid}/helpers/{helper['id']}/link")).json()["link"]
    code = link.rsplit("/", 1)[1]

    # A browser with only the link: this party and nothing else.
    await client.post("/api/auth/logout")
    assert (await client.get(f"/api/parties/{pid}")).status_code == 401
    assert (await client.post("/api/party-help/fel/enter")).status_code == 404
    entered = (await client.post(f"/api/party-help/{code}/enter")).json()
    assert entered["party_id"] == pid and entered["name"] == "Lars"
    seen = (await client.get(f"/api/parties/{pid}")).json()
    assert seen["you"]["helper"] is True and seen["id"] == pid
    assert (await client.get(f"/api/parties/{other}")).status_code == 404
    assert (await client.get("/api/parties")).status_code == 401
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/birthdays/people")).status_code == 401
    # Everything for the party – but not removing it – and more helpers.
    assert (await client.put(f"/api/parties/{pid}", json={"place": "Folkets hus"})).json()["place"] == "Folkets hus"
    assert (await client.delete(f"/api/parties/{pid}")).status_code == 401
    assert (await client.post(f"/api/parties/{pid}/helpers", json={"name": "Eva", "role": "toastmadame"})).status_code == 201
    # The plan, kept from the one being celebrated.
    assert (await client.post(f"/api/parties/{pid}/plan", json={"kind": "speech", "at": "19:30", "minutes": 5, "title": "Överraskningstal", "who": "Mamma"})).status_code == 201
    assert (await client.post(f"/api/parties/{pid}/plan", json={"title": "x", "at": "25:00"})).status_code == 422
    out = (await client.put(f"/api/parties/{pid}/plan/hidden", json={"user_ids": [me["id"]]})).json()
    assert out["plan_hidden"] == [me["id"]] and out["plan"][0]["title"] == "Överraskningstal" and out["adults"][0]["id"] == me["id"]
    item = out["plan"][0]["id"]

    # The host: in the app, the plan is greyed out; nothing of it comes.
    client.cookies.clear()
    await _as(client, "admin", "secret123")
    mine = (await client.get(f"/api/parties/{pid}")).json()
    assert mine["plan_kept"] is True and mine["plan"] == [] and mine["speeches"] == [] and mine["plan_hidden"] == [] and "Överraskningstal" not in str(mine)
    assert (await client.post(f"/api/parties/{pid}/plan", json={"title": "kika"})).status_code == 403
    assert (await client.put(f"/api/parties/{pid}/plan/{item}", json={"title": "kika"})).status_code == 403
    assert (await client.delete(f"/api/parties/{pid}/plan/{item}")).status_code == 403
    assert (await client.put(f"/api/parties/{pid}/plan/hidden", json={"user_ids": []})).status_code == 403

    # In a browser signed in to the app, the helper's page still acts as the helper.
    await client.post(f"/api/party-help/{code}/enter")
    as_helper = (await client.get(f"/api/parties/{pid}", headers={"X-Party-Helper": "1"})).json()
    assert as_helper["you"]["helper"] is True and as_helper["plan"][0]["title"] == "Överraskningstal"
    assert (await client.get(f"/api/parties/{pid}")).json()["you"]["helper"] is False

    # Removed: the link stops at once.
    await client.delete(f"/api/parties/{pid}/helpers/{helper['id']}")
    assert (await client.get(f"/api/parties/{pid}", headers={"X-Party-Helper": "1"})).status_code == 401
    assert (await client.post(f"/api/party-help/{code}/enter")).status_code == 404


async def test_a_helpers_link_ends_after_the_party(client, db_session):
    from app.models import Party

    await _family(client)
    pid, _, _ = await _token_party(client)
    made = (await client.post(f"/api/parties/{pid}/helpers", json={"name": "Lars", "days_after": 1})).json()
    code = (await client.post(f"/api/parties/{pid}/helpers/{made['party']['helpers'][0]['id']}/link")).json()["link"].rsplit("/", 1)[1]
    assert (await client.post(f"/api/parties/{pid}/helpers", json={"name": "x", "days_after": 2})).status_code == 422
    assert (await client.post(f"/api/party-help/{code}/enter")).status_code == 200
    party = await db_session.get(Party, uuid.UUID(pid))
    party.starts_at = datetime.now(timezone.utc) - timedelta(days=3)
    party.ends_at = datetime.now(timezone.utc) - timedelta(days=2)
    await db_session.commit()
    assert (await client.post(f"/api/party-help/{code}/enter")).status_code == 410
    assert (await client.get(f"/api/parties/{pid}", headers={"X-Party-Helper": "1"})).status_code == 401


async def test_a_task_for_someone(client):
    await _family(client)
    pid, _, _ = await _token_party(client)
    me = (await client.get("/api/auth/me")).json()
    made = (await client.post(f"/api/parties/{pid}/helpers", json={"name": "Lars"})).json()["party"]
    task = made["tasks"][0]["id"]
    out = (await client.put(f"/api/parties/{pid}/tasks/{task}", json={"who": me["id"]})).json()
    assert next(t for t in out["tasks"] if t["id"] == task)["who"] == me["id"]
    out = (await client.put(f"/api/parties/{pid}/tasks/{task}", json={"who": None, "helper_id": made["helpers"][0]["id"]})).json()
    row = next(t for t in out["tasks"] if t["id"] == task)
    assert row["who"] is None and row["helper_id"] == made["helpers"][0]["id"]


async def test_guests_who_belong_together(client):
    await _family(client)
    pid, token, _ = await _token_party(client)
    await client.put(f"/api/parties/{pid}", json={"bring": "one", "tables": [{"id": "a", "name": "Bord 1", "seats": 8}]})
    # Saga brings Nils as her +1; Nils also replies by himself; Maja hasn't answered.
    saga_key = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "last_name": "Berg", "coming": True, "companions": [{"first_name": "Nils"}]})).json()["key"]
    nils_key = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "last_name": "Ek", "coming": True})).json()["key"]
    detail = (await client.post(f"/api/parties/{pid}/guests", json={"first_name": "Maja", "invited": True})).json()
    by = {g["first_name"]: g for g in detail["guests"]}
    assert detail["coming"] == 3  # Nils twice
    assert detail["capacity"] == {"coming": 3, "waiting": 1, "most": 2 + 2 + 2, "open": False}

    path = f"/api/parties/{pid}/guests"
    assert (await client.put(f"{path}/{by['Saga']['id']}/table", json={"table_id": "a"})).status_code == 200
    linked = (await client.put(f"{path}/{by['Saga']['id']}/group", json={"with_id": by["Nils"]["id"]})).json()
    by = {g["first_name"]: g for g in linked["guests"]}
    assert by["Saga"]["group_id"] and by["Saga"]["group_id"] == by["Nils"]["group_id"]
    assert by["Saga"]["companions"] == [] and linked["coming"] == 2  # counted once now
    assert linked["capacity"] == {"coming": 2, "waiting": 1, "most": 1 + 1 + 2, "open": False}
    assert by["Nils"]["table_id"] == "a"  # they sit together
    assert (await client.put(f"{path}/{by['Saga']['id']}/table", json={"table_id": None})).json()["guests"][1]["table_id"] is None
    assert (await client.put(f"{path}/{by['Saga']['id']}/group", json={"with_id": by["Saga"]["id"]})).status_code == 404

    # Each keeps their own link, and sees who they're with; no other +1 comes in.
    page = (await client.get(f"/api/party/{token}?key={saga_key}")).json()
    assert page["together"] == [{"name": "Nils", "pending": False}] and page["mine"]["first_name"] == "Saga"
    assert (await client.get(f"/api/party/{token}")).json()["together"] == []
    await client.post(f"/api/party/{token}/reply?key={saga_key}", json={"first_name": "Saga", "last_name": "Berg", "coming": True, "companions": [{"first_name": "Ella"}]})
    assert (await client.get(f"/api/party/{token}?key={saga_key}")).json()["mine"]["companions"] == []
    assert (await client.get(f"/api/party/{token}?key={nils_key}")).json()["mine"]["first_name"] == "Nils"

    # One answers for the other who hasn't: only then, and not over their own answer.
    with_maja = (await client.put(f"{path}/{by['Maja']['id']}/group", json={"with_id": by["Nils"]["id"]})).json()
    assert len({g["group_id"] for g in with_maja["guests"]}) == 1
    await client.post(f"/api/party/{token}/reply?key={nils_key}", json={"first_name": "Nils", "last_name": "Ek", "coming": False, "for_group": True})
    after = {g["first_name"]: g for g in (await client.get(f"/api/parties/{pid}")).json()["guests"]}
    assert after["Maja"]["coming"] is False and after["Maja"]["pending"] is False
    assert after["Saga"]["coming"] is True  # she'd answered herself

    # Apart again, and the last one left isn't together with anyone.
    await client.put(f"{path}/{by['Maja']['id']}/group", json={"with_id": None})
    await client.put(f"{path}/{by['Nils']['id']}/group", json={"with_id": None})
    assert all(g["group_id"] is None for g in (await client.get(f"/api/parties/{pid}")).json()["guests"])
    await client.put(f"{path}/{by['Saga']['id']}/group", json={"with_id": by["Nils"]["id"]})
    out = (await client.delete(f"{path}/{by['Saga']['id']}")).json()
    assert all(g["group_id"] is None for g in out["guests"])


async def test_the_mails_are_html_in_the_partys_theme(client, db_session, monkeypatch):
    from app.models import AppSetting
    from app.services import mailer, party_mail

    sent = []
    monkeypatch.setattr(mailer, "_send", lambda conf, to, subject, text, html, reply_to: sent.append({"to": to, "subject": subject, "text": text, "html": html}))
    await _family(client)
    await client.put("/api/admin/integrations/email/smtp", json={"host": "smtp.example.com", "port": 587, "sender": "fest@example.com"})
    db_session.add(AppSetting(key="external_url", value="https://fest.example"))
    await db_session.commit()
    pid, token, _ = await _token_party(client, page_theme="glamour", title="Galan <b>2027</b>")
    await client.put(f"/api/parties/{pid}", json={"mail_texts": {"confirm": {"text": "Tack {name}! <script>alert(1)</script>\nVi ses."}}})
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga<img>", "email": "saga@example.com", "updates": True, "coming": True})
    mail = sent[0]
    gold = party_mail.THEMES["glamour"]["accent"]
    assert gold in mail["html"] and party_mail.THEMES["glamour"]["bg"] in mail["html"]
    # Nothing from the hosts or the guests is markup, and the plain text is still there.
    assert "<script>" not in mail["html"] and "&lt;script&gt;" in mail["html"] and "Saga<img>" not in mail["html"] and "<b>2027" not in mail["html"]
    assert "<script>alert(1)</script>" in mail["text"]
    # The guest's own link as the button, the stop link, and the theme's picture from the server.
    key = mail["text"].split("?key=")[1].split()[0]
    assert f"{token}?key={key}" in mail["html"] and "?unsubscribe=" in mail["html"] and "https://fest.example/party-assets/" in mail["html"]

    # An own theme: its colours.
    theme = (await client.post("/api/parties/themes", json={"name": "Lila", "bg": "#220033", "bg2": "#330044", "accent": "#ff00aa", "ink": "#ffffff"})).json()
    await client.put(f"/api/parties/{pid}", json={"page_theme": "custom", "page_custom_id": theme["id"]})
    sent.clear()
    await client.post(f"/api/party/{token}/reply", json={"first_name": "Nils", "email": "nils@example.com", "updates": True, "coming": True})
    assert "#ff00aa" in sent[0]["html"] and gold not in sent[0]["html"]

    # The preview is what's sent, with a made-up guest.
    preview = (await client.post(f"/api/parties/{pid}/mail-preview", json={"subject": "Hej {name}", "text": "<b>Kom</b> {name}", "name": "Anna"})).json()
    assert preview["subject"] == "Hej Anna" and "&lt;b&gt;Kom&lt;/b&gt; Anna" in preview["html"] and "#ff00aa" in preview["html"]


async def test_the_shared_message_is_the_hosts_own(client):
    await _family(client)
    pid, _, _ = await _token_party(client)
    assert (await client.get(f"/api/parties/{pid}")).json()["share_texts"] == {"save": "", "invite": ""}
    out = (await client.put(f"/api/parties/{pid}", json={"mail_texts": {"share_save": {"text": "Boka {when}! {link}"}}})).json()
    assert out["share_texts"]["save"] == "Boka {when}! {link}"
    assert not [m for m in out["mail_templates"] if m["kind"].startswith("share")]
    assert (await client.put(f"/api/parties/{pid}", json={"mail_texts": {"share_save": {"text": ""}}})).json()["share_texts"]["save"] == ""


async def test_the_guests_chat_is_in_the_chat_app_too(client):
    await _family(client)
    pid, token, _ = await _token_party(client, title="Fyrtio")
    key = (await client.post(f"/api/party/{token}/reply", json={"first_name": "Saga", "last_name": "Berg", "coming": True})).json()["key"]
    # Not chosen: nothing there.
    assert (await client.get(f"/api/party/{token}/chat?key={key}")).status_code == 404
    assert (await client.put(f"/api/parties/{pid}", json={"guest_chat": True})).json()["guest_chat"] is True
    assert (await client.get(f"/api/party/{token}")).json()["guest_chat"] is True

    # A guest needs their own key; the link alone isn't enough.
    assert (await client.get(f"/api/party/{token}/chat?key=fel")).status_code == 404
    assert (await client.post(f"/api/party/{token}/chat?key={key}", json={"body": "Så taggad!"})).status_code == 201
    assert (await client.post(f"/api/party/{token}/chat?key={key}", json={"body": "   "})).status_code == 422
    seen = (await client.get(f"/api/party/{token}/chat?key={key}")).json()["messages"]
    assert [(m["name"], m["body"], m["mine"], m["host"]) for m in seen] == [("Saga Berg", "Så taggad!", True, False)]

    # In the family's chat app, unread, under the party's name, and the hosts answer from there.
    conv = next(c for c in (await client.get("/api/chat/conversations")).json() if c["conversation_name"] and c["conversation_name"].startswith("Fyrtio"))
    assert conv["unread_count"] == 1 and conv["peer_type"] == "group" and conv["is_creator"] is False and conv["last_message_snippet"] == "Så taggad!"
    page = (await client.get(f"/api/chat/messages?peer={conv['peer_key']}")).json()["items"]
    assert page[0]["sender_id"] is None and page[0]["sender_name"] == "Saga Berg"
    await client.post("/api/chat/messages", json={"peer": conv["peer_key"], "body": "Välkommen!"})
    seen = (await client.get(f"/api/party/{token}/chat?key={key}")).json()["messages"]
    assert seen[1]["body"] == "Välkommen!" and seen[1]["host"] is True and seen[1]["mine"] is False
    # Who's in it is the party's to say.
    assert (await client.patch(f"/api/chat/conversations/{conv['peer_key']}", json={"member_ids": []})).status_code == 403

    # In the portal during the party, under a name.
    now = datetime.now(timezone.utc)
    code = (await client.put(f"/api/parties/{pid}", json={"portal_at": (now - timedelta(minutes=1)).isoformat()})).json()["portal"]["link"].rsplit("/", 1)[1]
    assert (await client.post(f"/api/party-portal/{code}/chat", json={"body": "Hej"})).status_code == 422
    assert (await client.post(f"/api/party-portal/{code}/chat", json={"body": "Skål!", "name": "Nils"})).status_code == 201
    assert [m["name"] for m in (await client.get(f"/api/party-portal/{code}/chat?me=Nils")).json()["messages"]][-1] == "Nils"
    # The portal closed: no way in by the code.
    await client.delete(f"/api/parties/{pid}/portal")
    assert (await client.post(f"/api/party-portal/{code}/chat", json={"body": "x", "name": "y"})).status_code == 404

    # The hosts can take a message away; not too many at once; off removes it.
    messages = (await client.get(f"/api/parties/{pid}/chat/guests")).json()["messages"]
    assert (await client.delete(f"/api/parties/{pid}/chat/guests/{messages[0]['id']}")).status_code == 204
    assert len((await client.get(f"/api/parties/{pid}/chat/guests")).json()["messages"]) == len(messages) - 1
    statuses = [(await client.post(f"/api/party/{token}/chat?key={key}", json={"body": f"{i}"})).status_code for i in range(14)]
    assert statuses[-1] == 429
    await client.put(f"/api/parties/{pid}", json={"guest_chat": False})
    assert (await client.get(f"/api/party/{token}/chat?key={key}")).status_code == 404
    assert not [c for c in (await client.get("/api/chat/conversations")).json() if (c["conversation_name"] or "").startswith("Fyrtio")]


async def test_the_planners_chat_with_a_toastmaster(client):
    await _family(client)
    me = (await client.get("/api/auth/me")).json()
    pid, token, _ = await _token_party(client, title="Fyrtio")
    made = (await client.post(f"/api/parties/{pid}/helpers", json={"name": "Lars"})).json()
    assert made["party"]["planner_chat"] is True  # it comes with the first helper
    code = (await client.post(f"/api/parties/{pid}/helpers/{made['party']['helpers'][0]['id']}/link")).json()["link"].rsplit("/", 1)[1]
    await client.post(f"/api/parties/{pid}/chat/planners", json={"body": "Hej Lars"})

    # The toastmaster, by their link: reads and writes; the family has it in the chat app.
    await client.post(f"/api/party-help/{code}/enter")
    helper = {"X-Party-Helper": "1"}
    assert (await client.post(f"/api/parties/{pid}/chat/planners", json={"body": "Hej! Vilka ska tala?"}, headers=helper)).status_code == 201
    seen = (await client.get(f"/api/parties/{pid}/chat/planners", headers=helper)).json()["messages"]
    assert [(m["name"], m["mine"]) for m in seen] == [("Anna", False), ("Lars", True)]
    chats = [c for c in (await client.get("/api/chat/conversations")).json() if (c["conversation_name"] or "").startswith("Fyrtio")]
    assert len(chats) == 1 and chats[0]["conversation_name"] == "Fyrtio – planering"

    # Kept from the host: they're out of the chat too, and can't read it.
    await client.put(f"/api/parties/{pid}/plan/hidden", json={"user_ids": [me["id"]]}, headers=helper)
    assert not [c for c in (await client.get("/api/chat/conversations")).json() if (c["conversation_name"] or "").startswith("Fyrtio")]
    assert (await client.get(f"/api/parties/{pid}/chat/planners")).status_code == 403
    assert (await client.get(f"/api/chat/messages?peer={chats[0]['peer_key']}")).status_code == 404
    assert (await client.get(f"/api/parties/{pid}")).json()["planner_chat"] is False
    # Shown again: back in. And removing the party takes the chats with it.
    await client.put(f"/api/parties/{pid}/plan/hidden", json={"user_ids": []}, headers=helper)
    assert [c for c in (await client.get("/api/chat/conversations")).json() if (c["conversation_name"] or "").startswith("Fyrtio")]
    assert (await client.delete(f"/api/parties/{pid}")).status_code == 204
    assert not [c for c in (await client.get("/api/chat/conversations")).json() if (c["conversation_name"] or "").startswith("Fyrtio")]
