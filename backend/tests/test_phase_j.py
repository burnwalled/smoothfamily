"""Phase J tests: recipes, plan-from-recipe, shopping list/task generation, fallback categories, text export."""

import json
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Recipes Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201


def _next_monday() -> date:
    today = date.today()
    return today + timedelta(days=(7 - today.weekday()) % 7 or 7)


async def _import_plan(client, monday: date):
    raw = json.dumps(
        {
            "meals": [
                {
                    "weekday": 0,
                    "name": "Pasta pesto",
                    "description": "Quick",
                    "servings": 4,
                    "ingredients": [
                        {"name": "pasta", "amount": 400, "unit": "g", "category": "pantry"},
                        {"name": "tomato", "amount": 2, "unit": "pcs", "category": "produce"},
                        {"name": "mystery powder", "amount": 1, "unit": "pack"},
                    ],
                }
            ]
        }
    )
    resp = await client.post(
        f"/api/meals/import?week_start={monday.isoformat()}",
        content=raw,
        headers={"Content-Type": "text/plain"},
    )
    assert resp.status_code == 200
    return resp.json()


async def test_save_as_recipe_and_plan_from_recipe(client):
    await _setup(client)
    monday = _next_monday()
    plan = await _import_plan(client, monday)
    meal_id = plan["meals"][0]["id"]

    created = await client.post(f"/api/meals/recipes/from-meal/{meal_id}")
    assert created.status_code == 201
    recipe = created.json()
    assert recipe["name"] == "Pasta pesto"
    assert len(recipe["ingredients"]) == 3

    # Place the recipe on another weekday.
    planned = await client.post(
        f"/api/meals/plan/from-recipe/{recipe['id']}",
        json={"week_start": monday.isoformat(), "weekday": 3},
    )
    assert planned.status_code == 200
    names = [m["name"] for m in planned.json()["meals"]]
    assert names.count("Pasta pesto") >= 2


async def test_list_and_task_created_with_name_points_and_regenerate_reuses(client):
    await _setup(client)
    monday = _next_monday()
    await _import_plan(client, monday)

    # Set custom shopping-task points from family admin settings.
    patched = await client.patch("/api/allowance/settings", json={"shopping_task_points": 42})
    assert patched.status_code == 200

    generated = await client.post(f"/api/meals/plan/shopping-list?week_start={monday.isoformat()}")
    assert generated.status_code == 200
    assert generated.json()["imported"] >= 1

    week = monday.isocalendar()[1]
    expected_name = f"Shopping list wk {week}"

    lists = (await client.get("/api/lists")).json()
    week_lists = [lst for lst in lists if lst["name"] == expected_name]
    assert len(week_lists) == 1
    lst = week_lists[0]
    assert lst["linked_task_id"]

    tasks = (await client.get("/api/tasks/manage")).json()
    linked = next(t for t in tasks if t["id"] == lst["linked_task_id"])
    assert linked["title"] == expected_name
    assert linked["points"] == 42
    assert linked["recurrence"] == "none"

    # Regenerate must reuse same list and linked task id.
    again = await client.post(f"/api/meals/plan/shopping-list?week_start={monday.isoformat()}")
    assert again.status_code == 200
    lists2 = (await client.get("/api/lists")).json()
    week_lists2 = [x for x in lists2 if x["name"] == expected_name]
    assert len(week_lists2) == 1
    assert week_lists2[0]["id"] == lst["id"]
    assert week_lists2[0]["linked_task_id"] == lst["linked_task_id"]


async def test_category_fallback_and_text_export_format(client):
    await _setup(client)
    monday = _next_monday()
    await _import_plan(client, monday)

    generated = await client.post(f"/api/meals/plan/shopping-list?week_start={monday.isoformat()}")
    assert generated.status_code == 200

    week = monday.isocalendar()[1]
    expected_name = f"Shopping list wk {week}"
    lists = (await client.get("/api/lists")).json()
    lst = next(x for x in lists if x["name"] == expected_name)

    items = (await client.get(f"/api/lists/{lst['id']}/items")).json()
    # Known pantry ingredient from category.
    pasta = next(i for i in items if i["name"].startswith("pasta"))
    assert pasta["category"] == "pantry"
    # Unknown ingredient should fall back to other.
    mystery = next(i for i in items if i["name"].startswith("mystery powder"))
    assert mystery["category"] == "other"

    exported = await client.get(f"/api/lists/{lst['id']}/export-text")
    assert exported.status_code == 200
    text = exported.json()["text"]
    assert "[pantry]" in text
    assert "[other]" in text
    assert "pasta" in text
    assert "mystery powder" in text
