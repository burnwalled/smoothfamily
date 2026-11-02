"""Phase I list privacy and compatibility tests."""

import json
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Lists Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201

    child = await client.post(
        "/api/family/members",
        json={
            "display_name": "Kid",
            "username": "kid",
            "password": "1234",
            "role": "child",
        },
    )
    assert child.status_code == 201


async def test_secret_list_hidden_as_404(client):
    await _setup(client)

    me = (await client.get("/api/auth/me")).json()
    private = await client.post(
        "/api/lists",
        json={"name": "Secret", "allowed_user_ids": [me["id"]]},
    )
    assert private.status_code == 201
    list_id = private.json()["id"]

    add_item = await client.post(
        f"/api/lists/{list_id}/items",
        json={"name": "Hidden thing", "category": "other"},
    )
    assert add_item.status_code == 201

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})).status_code == 200

    visible = (await client.get("/api/lists")).json()
    assert all(lst["id"] != list_id for lst in visible)

    direct = await client.get(f"/api/lists/{list_id}")
    assert direct.status_code == 404

    direct_items = await client.get(f"/api/lists/{list_id}/items")
    assert direct_items.status_code == 404


async def test_legacy_shopping_route_is_gone(client):
    await _setup(client)
    legacy = await client.get("/api/shopping")
    assert legacy.status_code == 404


async def test_generate_shopping_populates_lists_api(client):
    await _setup(client)

    today = date.today()
    monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)

    ai_answer = {
        "meals": [
            {
                "weekday": 0,
                "name": "Pasta",
                "servings": 4,
                "ingredients": [
                    {"name": "Pasta", "amount": 400, "unit": "g"},
                    {"name": "Tomato"},
                ],
            }
        ]
    }

    imported = await client.post(
        f"/api/meals/import?week_start={monday.isoformat()}",
        content=json.dumps(ai_answer),
        headers={"Content-Type": "text/plain"},
    )
    assert imported.status_code == 200, imported.text

    generated = await client.post(f"/api/meals/plan/shopping-list?week_start={monday.isoformat()}")
    assert generated.status_code == 200

    lists = (await client.get("/api/lists")).json()
    week = monday.isocalendar()[1]
    shopping = next(lst for lst in lists if str(week) in lst["name"])
    items = (await client.get(f"/api/lists/{shopping['id']}/items")).json()
    names = [item["name"] for item in items]
    assert "pasta 400 g" in names
    assert "tomato" in names


async def test_lists_show_how_many_items_are_left(client):
    await _setup(client)
    shop = (await client.post("/api/lists", json={"name": "Shopping"})).json()
    other = (await client.post("/api/lists", json={"name": "Hardware"})).json()
    for name in ("Bread", "Butter", "Milk"):
        await client.post(f"/api/lists/{shop['id']}/items", json={"name": name})
    bread = (await client.get(f"/api/lists/{shop['id']}/items")).json()[0]
    await client.patch(f"/api/lists/{shop['id']}/items/{bread['id']}", json={"done": True})
    counts = {lst["name"]: lst["open_items"] for lst in (await client.get("/api/lists")).json()}
    assert counts == {"Shopping": 2, "Hardware": 0}
