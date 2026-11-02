"""Birthdays and wish lists (#57), the reward shop (#63) and recipes from a link (#58)."""
from datetime import date, datetime, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    ids = {"admin": resp.json()["id"]}
    for username, role in [("adult1", "adult"), ("kid1", "child"), ("kid2", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


# --- Birthdays ---------------------------------------------------------------------------


def test_next_birthday_handles_leap_days():
    from app.routers.birthdays import next_birthday

    assert next_birthday(3, 1, date(2026, 3, 1)) == date(2026, 3, 1)
    assert next_birthday(1, 5, date(2026, 10, 27)) == date(2027, 1, 5)
    assert next_birthday(2, 29, date(2026, 1, 1)) == date(2026, 2, 28)
    assert next_birthday(2, 29, date(2027, 3, 1)) == date(2028, 2, 29)


async def test_wishes_hide_reservations_and_ideas_from_the_person(client):
    ids = await _family(client)
    kid = (await client.post("/api/birthdays/people", json={"name": "Kid1", "user_id": ids["kid1"], "birth_month": 5, "birth_day": 4, "birth_year": 2016})).json()
    assert kid["turns"] is not None
    idea = await client.post(f"/api/birthdays/people/{kid['id']}/wishes", json={"kind": "idea", "title": "Bike helmet"})
    assert idea.status_code == 201

    await _login(client, "kid1")
    lego = (await client.post(f"/api/birthdays/people/{kid['id']}/wishes", json={"title": "LEGO", "url": "https://example.com/lego"})).json()
    assert (await client.post(f"/api/birthdays/people/{kid['id']}/wishes", json={"kind": "idea", "title": "x"})).status_code == 403
    assert (await client.post(f"/api/birthdays/wishes/{lego['id']}/reserve")).status_code == 403
    assert (await client.post("/api/birthdays/people", json={"name": "Friend"})).status_code == 403

    await _login(client, "kid2")
    reserved = (await client.post(f"/api/birthdays/wishes/{lego['id']}/reserve")).json()
    assert reserved["reserved_by_me"] is True
    # A child doesn't see gift ideas.
    assert [w["title"] for w in (await client.get(f"/api/birthdays/people/{kid['id']}/wishes")).json()] == ["LEGO"]

    await _login(client, "adult1")
    rows = (await client.get(f"/api/birthdays/people/{kid['id']}/wishes")).json()
    assert {w["title"]: w["reserved"] for w in rows} == {"Bike helmet": False, "LEGO": True}
    assert next(w for w in rows if w["title"] == "LEGO")["reserved_by_name"] == "Kid2"
    assert (await client.post(f"/api/birthdays/wishes/{lego['id']}/reserve")).status_code == 409

    await _login(client, "kid1")
    own = (await client.get(f"/api/birthdays/people/{kid['id']}/wishes")).json()
    assert own == [dict(own[0], reserved=None, reserved_by_me=False, reserved_by_name=None)]
    assert own[0]["title"] == "LEGO"


async def test_birthdays_in_the_calendar_and_reminders(client, db_session):
    from app.services.birthdays import run_birthday_reminders

    ids = await _family(client)
    today = date.today()  # the server's date, as the app uses
    in_a_week = date.fromordinal(today.toordinal() + 7)
    person = (await client.post("/api/birthdays/people", json={"name": "Kid1", "user_id": ids["kid1"], "birth_month": in_a_week.month, "birth_day": in_a_week.day})).json()
    assert person["days_until"] == 7

    events = (await client.get(f"/api/calendar/events?start={today}&end={date.fromordinal(today.toordinal() + 14)}")).json()
    birthday = [e for e in events if e["birthday_person_id"] == person["id"]]
    assert len(birthday) == 1 and birthday[0]["all_day"] is True

    noon = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=12)
    assert await run_birthday_reminders(db_session, noon) == 3  # everyone but Kid1 themself
    assert await run_birthday_reminders(db_session, noon) == 0  # once only
    await _login(client, "kid1")
    assert (await client.get("/api/notifications")).json() == []
    await _login(client, "adult1")
    assert [n["kind"] for n in (await client.get("/api/notifications")).json()] == ["birthday_soon"]


# --- Reward shop ---------------------------------------------------------------------------


async def _earn(client, ids, points):
    """Kid1 completes a task worth `points`, the admin approves it."""
    task = (await client.post("/api/tasks", json={"title": f"Job {points}", "points": points, "assignee_id": ids["kid1"], "recurrence": "daily"})).json()
    await _login(client, "kid1")
    await client.post(f"/api/tasks/{task['id']}/complete")
    await _login(client, "admin", "secret123")
    completion = next(a for a in (await client.get("/api/tasks/approvals")).json() if a["task_title"] == task["title"])
    await client.post(f"/api/tasks/approvals/{completion['completion_id']}", json={"action": "approve"})


async def test_buy_is_held_until_approved_and_limits_apply(client):
    ids = await _family(client)
    film = (await client.post("/api/shop/items", json={"title": "Choose the film", "price": 30, "limit_count": 1, "limit_period": "week"})).json()
    await _earn(client, ids, 50)

    await _login(client, "kid1")
    assert (await client.post("/api/shop/items", json={"title": "x", "price": 1})).status_code == 403
    assert (await client.get("/api/shop/me")).json()["balance"] == 50
    purchase = (await client.post(f"/api/shop/items/{film['id']}/buy")).json()
    assert purchase["status"] == "pending"
    wallet = (await client.get("/api/shop/me")).json()
    assert (wallet["balance"], wallet["held"]) == (20, 30)
    assert (await client.post(f"/api/shop/items/{film['id']}/buy")).json()["detail"] == "Limit reached for this period"
    assert (await client.get("/api/shop/items")).json()[0]["left_this_period"] == 0

    await _login(client, "admin", "secret123")
    assert (await client.get("/api/shop/attention")).json() == {"pending": 1}
    notes = (await client.get("/api/notifications")).json()
    assert notes[0]["kind"] == "shop_pending" and notes[0]["route"] == "/shop"
    reviewed = (await client.post(f"/api/shop/purchases/{purchase['id']}", json={"action": "approve"})).json()
    assert reviewed["status"] == "approved"

    await _login(client, "kid1")
    wallet = (await client.get("/api/shop/me")).json()
    assert (wallet["balance"], wallet["spent"], wallet["earned"]) == (20, 30, 50)
    # Spending doesn't lower the level, which counts earned points.
    assert (await client.get("/api/achievements")).json()["level"]["points"] == 50


async def test_not_enough_points_rejected_refunds_and_cancel(client):
    ids = await _family(client)
    big = (await client.post("/api/shop/items", json={"title": "Big", "price": 100})).json()
    small = (await client.post("/api/shop/items", json={"title": "Small", "price": 10})).json()
    await _earn(client, ids, 20)

    await _login(client, "kid1")
    assert (await client.post(f"/api/shop/items/{big['id']}/buy")).status_code == 409
    first = (await client.post(f"/api/shop/items/{small['id']}/buy")).json()
    second = (await client.post(f"/api/shop/items/{small['id']}/buy")).json()
    assert (await client.post(f"/api/shop/items/{small['id']}/buy")).status_code == 409  # 20 held
    assert (await client.post(f"/api/shop/purchases/{second['id']}/cancel")).status_code == 200

    await _login(client, "admin", "secret123")
    await client.post(f"/api/shop/purchases/{first['id']}", json={"action": "reject", "note": "Not today"})
    await _login(client, "kid1")
    assert (await client.get("/api/shop/me")).json()["balance"] == 20
    assert (await client.get("/api/notifications")).json()[0]["body"].endswith("Not today")


# --- Recipes from a link ---------------------------------------------------------------------


def test_swedish_ingredients():
    from app.services.recipe_import import parse_ingredient

    def parsed(line):
        i = parse_ingredient(line)
        return (i.amount, i.unit, i.name)

    assert parsed("2 dl vetemjöl") == (2, "dl", "vetemjöl")
    assert parsed("1 1/2 msk smör") == (1.5, "msk", "smör")
    assert parsed("½ tsk salt") == (0.5, "tsk", "salt")
    assert parsed("1½ krm kanel") == (1.5, "krm", "kanel")
    assert parsed("2–3 ägg") == (2, None, "ägg")
    assert parsed("400 g kycklingfilé") == (400, "g", "kycklingfilé")
    assert parsed("0,5 l mjölk") == (0.5, "l", "mjölk")
    assert parsed("Salt och peppar") == (None, None, "Salt och peppar")


def test_reads_schema_org_recipe():
    from app.services.recipe_import import parse_recipe_html

    html = """<html><head><script type="application/ld+json">
    {"@context": "https://schema.org", "@graph": [{"@type": "WebPage"}, {"@type": ["Recipe"],
      "name": "Pannkakor", "description": "<p>Klassiska &amp; goda</p>", "recipeYield": ["4 portioner"],
      "image": [{"@type": "ImageObject", "url": "/img/pannkakor.jpg"}],
      "recipeIngredient": ["2 1/2 dl vetemjöl", "6 dl mjölk", "3 ägg"],
      "recipeInstructions": [{"@type": "HowToSection", "itemListElement": [
        {"@type": "HowToStep", "text": "Vispa mjöl och mjölk."}, {"@type": "HowToStep", "text": "Vispa i äggen."}]}]}]}
    </script></head><body></body></html>"""
    recipe = parse_recipe_html(html, "https://example.com/recept/pannkakor")
    assert recipe.name == "Pannkakor"
    assert recipe.description == "Klassiska & goda"
    assert recipe.servings == 4
    assert [(i.amount, i.unit, i.name) for i in recipe.ingredients] == [(2.5, "dl", "vetemjöl"), (6, "dl", "mjölk"), (3, None, "ägg")]
    assert recipe.steps == ["Vispa mjöl och mjölk.", "Vispa i äggen."]
    assert recipe.image_url == "https://example.com/img/pannkakor.jpg"


async def test_private_addresses_are_refused(client):
    await _family(client)
    for url in ["http://127.0.0.1/recipe", "http://localhost:8000/api/health", "http://192.168.1.10/", "http://[::1]/", "ftp://example.com/x"]:
        resp = await client.post("/api/meals/recipes/from-url", json={"url": url})
        assert resp.status_code == 422, url


async def test_import_saves_the_recipe(client, monkeypatch):
    from app.routers import meals
    from app.services.recipe_import import ParsedIngredient, ParsedRecipe

    async def fake_import(url):
        return ParsedRecipe(name="Köttbullar", servings=4, ingredients=[ParsedIngredient("köttfärs", 500, "g")], steps=["Rulla", "Stek"])

    async def no_image(url):
        return None

    await _family(client)
    monkeypatch.setattr(meals, "import_recipe", fake_import)
    monkeypatch.setattr(meals, "fetch_image", no_image)
    recipe = (await client.post("/api/meals/recipes/from-url", json={"url": "https://example.com/kottbullar"})).json()
    assert recipe["name"] == "Köttbullar"
    assert recipe["ingredients"][0] == {"name": "köttfärs", "amount": 500, "unit": "g", "category": recipe["ingredients"][0]["category"]}
    assert recipe["steps"] == ["Rulla", "Stek"]


async def test_pasted_recipe_text(client):
    await _family(client)
    ingredients = """Ingredienser
500 g	nötfärs
1 dl ströbröd

Sås:
3 dl
grädde
Salt och peppar
"""
    steps = """Gör så här
1. Sätt ugnen på 200°.
2

Blanda färsen med ströbrödet.
Steg 3 Grädda i 45 minuter.
"""
    resp = await client.post(
        "/api/meals/recipes/from-text",
        json={"name": "Köttfärslimpa", "servings": 4, "ingredients": ingredients, "steps": steps, "source_url": "https://www.coop.se/recept/kottfarslimpa/"},
    )
    assert resp.status_code == 201
    recipe = resp.json()
    assert [(i["amount"], i["unit"], i["name"]) for i in recipe["ingredients"]] == [
        (500, "g", "nötfärs"), (1, "dl", "ströbröd"), (3, "dl", "grädde"), (None, None, "Salt och peppar"),
    ]
    assert recipe["steps"] == ["Sätt ugnen på 200°.", "Blanda färsen med ströbrödet.", "Grädda i 45 minuter."]
    assert recipe["source_url"] == "https://www.coop.se/recept/kottfarslimpa/" and recipe["description"] is None


async def test_wish_list_six_weeks_and_planning_a_month_before(client, db_session):
    from datetime import timedelta

    from app.services.birthdays import run_birthday_reminders

    ids = await _family(client)
    today = date.today()
    noon = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=12)
    six_weeks = today + timedelta(days=42)
    kid = (await client.post("/api/birthdays/people", json={"name": "Kid1", "user_id": ids["kid1"], "birth_month": six_weeks.month, "birth_day": six_weeks.day})).json()
    # Six weeks before: only the birthday child, to fill in the wish list.
    assert await run_birthday_reminders(db_session, noon) == 1
    await _login(client, "kid1")
    note = (await client.get("/api/notifications")).json()[0]
    assert note["kind"] == "birthday_wish_list" and note["route"] == f"/lists?wish={kid['id']}"

    # A month before: the others – adults to the planning, children to the wish list – not the child.
    await _login(client, "admin", "secret123")
    month = today + timedelta(days=30)
    granny = (await client.post("/api/birthdays/people", json={"name": "Granny", "birth_month": month.month, "birth_day": month.day})).json()
    assert await run_birthday_reminders(db_session, noon) == 4
    await _login(client, "adult1")
    plan = next(n for n in (await client.get("/api/notifications")).json() if n["kind"] == "birthday_plan")
    assert plan["route"] == f"/lists?plan={granny['id']}"
    await _login(client, "kid2")
    assert next(n for n in (await client.get("/api/notifications")).json() if n["kind"] == "birthday_plan")["route"] == f"/lists?wish={granny['id']}"

    # The register is the family's settings: an adult needs the admin's leave.
    assert (await client.post("/api/birthdays/people", json={"name": "Friend"})).status_code == 403
    await _login(client, "adult1")
    assert (await client.post("/api/birthdays/people", json={"name": "Friend"})).status_code == 403


async def test_recipe_search_through_the_servers_searxng(client, monkeypatch):
    import httpx

    from app.services import recipe_search

    ids = await _family(client)
    sent: list[dict] = []

    def answer(request: httpx.Request) -> httpx.Response:
        sent.append(dict(request.url.params))
        return httpx.Response(200, json={"results": [
            {"url": "https://www.koket.se/pannkakor", "title": "Pannkakor", "content": "Klassiska pannkakor"},
            {"url": "javascript:alert(1)", "title": "Bad"},
            {"url": "https://www.koket.se/pannkakor", "title": "Again"},
        ]})

    real = httpx.AsyncClient
    monkeypatch.setattr(recipe_search.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(answer), **kw))

    # Off until the server admin sets it up – the bundled SearXNG is offered, not used (2.8.4).
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "searxng_url", "http://searxng:8080")
    assert (await client.get("/api/admin/integrations/recipe-search")).json() == {"url": None, "bundled": "http://searxng:8080"}
    assert (await client.get("/api/meals/recipes/search/status")).json()["enabled"] is False
    assert (await client.get("/api/meals/recipes/search?q=pannkakor")).status_code == 404
    assert (await client.put("/api/admin/integrations/recipe-search", json={"url": "http://192.168.1.10:8888"})).json()["url"] == "http://192.168.1.10:8888"
    assert (await client.get("/api/meals/recipes/search/status")).json()["enabled"] is True
    health = (await client.get("/api/admin/integrations/recipe-search/health")).json()
    assert health["ok"] and health["hits"] == 3 and health["unresponsive"] == []

    await _login(client, "kid1")
    hits = (await client.get("/api/meals/recipes/search?q=pannkakor")).json()
    assert hits == [{"title": "Pannkakor", "url": "https://www.koket.se/pannkakor", "site": "koket.se", "snippet": "Klassiska pannkakor", "importable": True}]
    # Only the words (and "recipe" in the member's language) are sent.
    assert sent[-1]["q"] == "pannkakor recipe" and sent[-1]["format"] == "json"
    # A wish is looked up with the words alone (2.8.4).
    assert (await client.get("/api/search/status")).json()["enabled"] is True
    wishes = (await client.get("/api/search/web?q=lego technic")).json()
    assert wishes[0]["url"] == "https://www.koket.se/pannkakor" and sent[-1]["q"] == "lego technic"
    assert (await client.put("/api/admin/integrations/recipe-search", json={"url": None})).status_code == 403
    assert ids
