"""Tests for home profile, AI chore import, meal plans and shopping list."""
import json
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Familjen Test", "display_name": "Olle",
              "username": "olle", "password": "hemligt123"},
    )
    assert resp.status_code == 201
    return resp.json()


def _next_monday() -> str:
    today = date.today()
    return (today + timedelta(days=(7 - today.weekday()) % 7 or 7)).isoformat()


async def test_home_profile_and_prompt(client):
    await _setup(client)
    saved = await client.put(
        "/api/home/profile",
        json={"dwelling_type": "villa", "has_garden": True, "notes": "Stor häck mot gatan"},
    )
    assert saved.status_code == 200

    await client.post("/api/home/rooms", json={"name": "Kitchen", "category": "kitchen"})
    await client.post("/api/home/rooms", json={"name": "Garden", "category": "garden"})

    prompt = (await client.get("/api/home/chores/prompt")).json()["prompt"]
    assert "villa" in prompt
    assert "Garden" in prompt
    assert "Olle" in prompt
    assert '"chores"' in prompt


async def test_chore_import_from_messy_ai_answer(client):
    await _setup(client)
    await client.post(
        "/api/family/members",
        json={"display_name": "Barnet", "username": "barnet", "password": "1234", "role": "child"},
    )
    ai_answer = (
        "Sure! Here are the chores:\n```json\n"
        + json.dumps({
            "chores": [
                {"title": "Do the dishes", "points": 10, "recurrence": "daily", "assignee": None},
                {"title": "Vacuum", "points": 20, "recurrence": "weekly", "weekday": 5, "assignee": "barnet"},
                {"title": "Mow the lawn", "points": 30, "recurrence": "weekly", "assignee": "Unknown Person"},
            ]
        })
        + "\n```\nGood luck!"
    )
    resp = await client.post(
        "/api/home/chores/import", content=ai_answer, headers={"Content-Type": "text/plain"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["imported"] == 3
    assert len(body["skipped"]) == 1  # unknown member is flagged but the chore is still added

    tasks = (await client.get("/api/tasks")).json()
    assert len(tasks) == 3
    weekly = next(t for t in tasks if t["title"] == "Mow the lawn")
    assert weekly["weekday"] == 0  # weekly without weekday defaults to Monday


async def test_chore_import_rejects_garbage(client):
    await _setup(client)
    resp = await client.post(
        "/api/home/chores/import", content="This is not JSON at all",
        headers={"Content-Type": "text/plain"},
    )
    assert resp.status_code == 422


async def test_meal_plan_import_and_shopping(client):
    await _setup(client)
    monday = _next_monday()

    prompt = (await client.get(f"/api/meals/prompt?week_start={monday}&servings=4&preferences=vegetariskt")).json()
    assert "vegetariskt" in prompt["prompt"]

    ai_answer = json.dumps({
        "meals": [
            {"weekday": 0, "name": "Pasta pesto", "servings": 4,
             "ingredients": [
                 {"name": "Pasta", "amount": 400, "unit": "g"},
                 {"name": "pesto", "amount": 1, "unit": "can"}]},
            {"weekday": 1, "name": "Pasta bake", "servings": 4,
             "ingredients": [
                 {"name": "pasta", "amount": 300, "unit": "g"},
                 {"name": "grated cheese"}]},
        ]
    })
    imported = await client.post(
        f"/api/meals/import?week_start={monday}", content=ai_answer,
        headers={"Content-Type": "text/plain"},
    )
    assert imported.status_code == 200, imported.text
    plan = imported.json()
    assert len(plan["meals"]) == 2

    # Re-import replaces the plan
    again = await client.post(
        f"/api/meals/import?week_start={monday}", content=ai_answer,
        headers={"Content-Type": "text/plain"},
    )
    assert again.status_code == 200

    generated = await client.post(f"/api/meals/plan/shopping-list?week_start={monday}")
    assert generated.status_code == 200
    lists = (await client.get("/api/lists")).json()
    week = date.fromisoformat(monday).isocalendar()[1]
    shopping_list = next(lst for lst in lists if str(week) in lst["name"])
    items = (await client.get(f"/api/lists/{shopping_list['id']}/items")).json()
    names = [item["name"] for item in items]
    assert "pasta 700 g" in names      # 400 + 300 aggregated despite different casing
    assert "pesto 1 can" in names
    assert "grated cheese" in names       # ingredient without amount becomes its own row

    # Check off and clear completed
    first = items[0]
    toggled = await client.patch(f"/api/lists/{shopping_list['id']}/items/{first['id']}", json={"done": True})
    assert toggled.json()["done"] is True
    cleared = await client.delete(f"/api/lists/{shopping_list['id']}/done")
    assert cleared.status_code == 204
    assert len((await client.get(f"/api/lists/{shopping_list['id']}/items")).json()) == len(items) - 1


async def test_meal_plan_requires_monday(client):
    await _setup(client)
    tuesday = (date.fromisoformat(_next_monday()) + timedelta(days=1)).isoformat()
    resp = await client.get(f"/api/meals/plan?week_start={tuesday}")
    assert resp.status_code == 422
