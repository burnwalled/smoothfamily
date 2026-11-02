"""Savings jars (#55), waste collection and school lunch cards (#65)."""
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    kid = await client.post("/api/family/members", json={"display_name": "Kid", "username": "kid", "password": "pass1234", "role": "child"})
    return kid.json()["id"]


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def _earn(client, kid_id, points):
    """The child completes a task worth `points` and the admin approves it (10 points = 1 kr)."""
    _earn.count = getattr(_earn, "count", 0) + 1
    task = (await client.post("/api/tasks", json={"title": f"Job {_earn.count}", "points": points, "assignee_id": kid_id, "recurrence": "daily"})).json()
    await _login(client, "kid")
    await client.post(f"/api/tasks/{task['id']}/complete")
    await _login(client, "admin", "secret123")
    approval = next(a for a in (await client.get("/api/tasks/approvals")).json() if a["task_title"] == task["title"])
    await client.post(f"/api/tasks/approvals/{approval['completion_id']}", json={"action": "approve"})


# --- Savings jars ----------------------------------------------------------------------------


def _by_name(jars):
    return {j["name"]: j["balance"] for j in jars["jars"]} | {"Spend": jars["spend"]}


async def test_parents_add_jars_and_later_changes_dont_rewrite_history(client):
    kid = await _family(client)
    await client.put(f"/api/allowance/children/{kid}/rate", json={"points_per_unit": 10})
    await _earn(client, kid, 1000)  # 100 kr earned before the jars
    jars = (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "Skateboard", "pct": 50, "target": 900})).json()
    jars = (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "Give", "pct": 10})).json()
    assert (jars["enabled"], jars["spend_pct"]) == (True, 40)
    # What was earned before the jars existed is split as soon as the first jar is added.
    assert _by_name(jars) == {"Skateboard": 50.0, "Give": 0.0, "Spend": 50.0}
    assert (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "Too much", "pct": 41})).status_code == 422

    # A new share only applies to new earnings.
    skate = next(j for j in jars["jars"] if j["name"] == "Skateboard")
    await client.patch(f"/api/allowance/jars/{skate['id']}", json={"name": "Skateboard", "pct": 0, "target": 900})
    await _earn(client, kid, 100)  # +10 kr: 1 to Give, 9 to Spend
    jars = (await client.get(f"/api/allowance/jars?user_id={kid}")).json()
    assert _by_name(jars) == {"Skateboard": 50.0, "Give": 1.0, "Spend": 59.0}
    overview = (await client.get("/api/allowance/overview")).json()
    assert next(m for m in overview if m["user_id"] == kid)["balance"] == 110.0

    # Removing a jar puts its money back in Spend.
    jars = (await client.delete(f"/api/allowance/jars/{skate['id']}")).json()
    assert _by_name(jars) == {"Give": 1.0, "Spend": 109.0}


async def test_payouts_come_from_a_jar_and_children_only_put_money_aside(client):
    kid = await _family(client)
    await client.put(f"/api/allowance/children/{kid}/rate", json={"points_per_unit": 10})
    jars = (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "Game", "pct": 50})).json()
    game = jars["jars"][0]["id"]
    await _earn(client, kid, 400)  # 40 kr: 20 Game, 20 Spend

    assert (await client.post("/api/allowance/payouts", json={"user_id": kid, "amount": 25})).status_code == 409  # Spend has 20
    assert (await client.post("/api/allowance/payouts", json={"user_id": kid, "amount": 15})).status_code == 201
    jars = (await client.post("/api/allowance/jars/bonus", json={"user_id": kid, "jar_id": game, "amount": 2, "note": "Interest"})).json()
    assert _by_name(jars) == {"Game": 22.0, "Spend": 5.0}
    assert jars["entries"][0]["kind"] == "bonus" and jars["entries"][0]["jar_name"] == "Game"

    await _login(client, "kid")
    assert (await client.post("/api/allowance/jars/move", json={"user_id": kid, "from_jar_id": game, "amount": 5})).status_code == 403
    assert (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "Mine", "pct": 10})).status_code == 403
    jars = (await client.post("/api/allowance/jars/move", json={"user_id": kid, "to_jar_id": game, "amount": 5})).json()
    assert _by_name(jars) == {"Game": 27.0, "Spend": 0.0}
    # The bonus is kept apart from earnings: looking again doesn't re-split it.
    assert _by_name((await client.get("/api/allowance/jars")).json()) == {"Game": 27.0, "Spend": 0.0}


async def test_a_jar_reaching_its_target_is_celebrated_once(client):
    kid = await _family(client)
    await client.put(f"/api/allowance/children/{kid}/rate", json={"points_per_unit": 10})
    jars = (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "LEGO", "pct": 100, "target": 30})).json()
    assert jars["jars"][0]["progress"] == 0

    await _earn(client, kid, 150)
    assert (await client.get(f"/api/allowance/jars?user_id={kid}")).json()["jars"][0]["progress"] == 0.5
    await _earn(client, kid, 150)
    jar = (await client.get(f"/api/allowance/jars?user_id={kid}")).json()["jars"][0]
    assert jar["progress"] == 1 and jar["reached_at"] is not None
    await client.get(f"/api/allowance/jars?user_id={kid}")
    kinds = [n["kind"] for n in (await client.get("/api/notifications")).json()]
    assert kinds.count("savings_goal") == 1
    await _login(client, "kid")
    assert "savings_goal" in [n["kind"] for n in (await client.get("/api/notifications")).json()]


# --- Waste collection and school lunch -------------------------------------------------------

ICS = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1
DTSTART;VALUE=DATE:{tomorrow}
SUMMARY:Restavfall
END:VEVENT
BEGIN:VEVENT
UID:2
DTSTART;VALUE=DATE:{later}
SUMMARY:Matavfall
END:VEVENT
END:VCALENDAR
"""


async def test_waste_card_and_evening_reminder(client, db_session, monkeypatch):
    from app.services import today_cards

    today = datetime.now(timezone.utc).date()
    tomorrow, later = today + timedelta(days=1), today + timedelta(days=5)
    ics = ICS.format(tomorrow=tomorrow.strftime("%Y%m%d"), later=later.strftime("%Y%m%d")).replace("\n", "\r\n").encode()

    async def fake_fetch(url):
        return ics

    monkeypatch.setattr(today_cards, "fetch_ical_raw", fake_fetch)
    await _family(client)
    assert (await client.put("/api/dashboard/sources/waste", json={"url": "https://example.com/sopor.ics"})).status_code == 200
    assert (await client.get("/api/dashboard/waste")).json() == [
        {"date": tomorrow.isoformat(), "title": "Restavfall"},
        {"date": later.isoformat(), "title": "Matavfall"},
    ]
    evening = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=18)
    assert await today_cards.run_waste_reminders(db_session, evening) == 1  # the admin; the child isn't reminded
    assert await today_cards.run_waste_reminders(db_session, evening) == 0
    assert (await client.get("/api/notifications")).json()[0]["body"].startswith("Restavfall")


RSS = """<rss version="2.0"><channel><title>Skolmaten - Östra Real</title>
<item><title>Vecka 44</title><description>Ingen meny tillgänglig</description></item>
<item><title>Måndag - Vecka 45</title><description><![CDATA[Köttbullar med potatis<br/>Vegetariska bullar]]></description>
<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate></item>
<item><title>Tisdag - Vecka 45</title><description><![CDATA[Studiedag]]></description>
<pubDate>Tue, 03 Nov 2026 00:00:00 GMT</pubDate></item>
<item><title>Torsdag - Vecka 45</title><description><![CDATA[Ingen meny tillgänglig]]></description>
<pubDate>Thu, 05 Nov 2026 00:00:00 GMT</pubDate></item>
<item><title>Onsdag - Vecka 45</title><description><![CDATA[  ]]></description>
<pubDate>Wed, 04 Nov 2026 00:00:00 GMT</pubDate></item>
</channel></rss>"""


def test_school_lunch_feed_and_names():
    from app.services.today_cards import parse_lunch_rss, school_name_from

    menu = parse_lunch_rss(RSS)
    assert menu["school"] == "Östra Real"
    assert menu["days"] == [
        {"date": date(2026, 11, 2), "dishes": ["Köttbullar med potatis", "Vegetariska bullar"]},
        {"date": date(2026, 11, 3), "dishes": ["Studiedag"]},
    ]
    assert school_name_from("https://skolmaten.se/ostra-real/") == "ostra-real"
    assert school_name_from("https://skolmaten.se/api/4/rss/week/ostra-real?locale=sv") == "ostra-real"
    assert school_name_from("Ostra-Real") == "ostra-real"
    assert school_name_from("https://evil.example.com/ostra-real") is None


async def test_school_lunch_per_child(client, monkeypatch):
    from app.routers import dashboard

    async def fake_lunch(school, today):
        return {"school": "Östra Real", "days": [{"date": date(2026, 11, 2), "dishes": ["Köttbullar"]}]}

    monkeypatch.setattr(dashboard, "school_lunch", fake_lunch)
    kid = await _family(client)
    assert (await client.put(f"/api/dashboard/sources/school/{kid}", json={"school": "https://skolmaten.se/ostra-real/"})).status_code == 200
    rows = (await client.get("/api/dashboard/school-lunch")).json()
    assert [(r["name"], r["school"], r["days"][0]["dishes"]) for r in rows] == [("Kid", "ostra-real", ["Köttbullar"])]
    await _login(client, "kid")
    assert len((await client.get("/api/dashboard/school-lunch")).json()) == 1
    assert (await client.put(f"/api/dashboard/sources/school/{kid}", json={"school": ""})).status_code == 403


async def test_a_child_proposes_a_goal_and_an_adult_approves(client):
    kid = await _family(client)
    await client.put(f"/api/allowance/children/{kid}/rate", json={"points_per_unit": 10})
    await _earn(client, kid, 1000)  # 100 kr before the goal

    await _login(client, "kid")
    jars = (await client.post("/api/allowance/jars/request", json={"name": "LEGO", "target": 600, "pct": 50})).json()
    # Waiting: no money goes in yet.
    assert jars["enabled"] is False and [(r["name"], r["pct"], r["target"]) for r in jars["requests"]] == [("LEGO", 50, 600.0)]
    request_id = jars["requests"][0]["id"]
    assert (await client.post(f"/api/allowance/jars/{request_id}/approve", json={"pct": 40})).status_code == 403
    assert (await client.post("/api/allowance/jars", json={"user_id": kid, "name": "x"})).status_code == 403

    await _login(client, "admin", "secret123")
    assert any(n["kind"] == "savings_request" for n in (await client.get("/api/notifications")).json())
    approved = (await client.post(f"/api/allowance/jars/{request_id}/approve", json={"pct": 40})).json()
    assert approved["requests"] == [] and [(j["name"], j["pct"], j["target"]) for j in approved["jars"]] == [("LEGO", 40, 600.0)]
    # Earnings from before are split when it opens, like a jar the adults add.
    assert _by_name(approved) == {"LEGO": 40.0, "Spend": 60.0}

    # A goal turned down disappears, and the child is told both times.
    await _login(client, "kid")
    other = (await client.post("/api/allowance/jars/request", json={"name": "Phone", "target": 9000})).json()["requests"][0]["id"]
    await _login(client, "admin", "secret123")
    assert (await client.delete(f"/api/allowance/jars/{other}")).json()["requests"] == []
    await _login(client, "kid")
    kinds = [n["kind"] for n in (await client.get("/api/notifications")).json()]
    assert kinds.count("savings_answer") == 2
