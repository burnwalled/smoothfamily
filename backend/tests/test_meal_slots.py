"""3.2.0: lunchboxes and weekend lunches in the meal plan, and a meal set by hand (the Sunday check-in)."""
import json
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )


def _monday() -> str:
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


async def test_the_prompt_asks_for_lunchboxes_from_batch_cooked_dinners(client):
    await _setup(client)
    week = _monday()
    plain = (await client.get(f"/api/meals/prompt?week_start={week}")).json()["prompt"]
    assert "lunchbox" not in plain and '"slot": "dinner"' in plain
    assert (await client.get("/api/meals/settings")).json() == {"lunchboxes": 0, "weekend_lunch": False}
    assert (await client.put("/api/meals/settings", json={"lunchboxes": 2, "weekend_lunch": True})).status_code == 200
    assert (await client.get("/api/meals/settings")).json() == {"lunchboxes": 2, "weekend_lunch": True}
    prompt = (await client.get(f"/api/meals/prompt?week_start={week}")).json()["prompt"]
    assert "Lunchboxes: 2 per weekday" in prompt and "big batch" in prompt and "servings + 2" in prompt
    assert "Lunch on Saturday and Sunday" in prompt


async def test_imported_slots_and_the_shopping_list(client):
    await _setup(client)
    week = _monday()
    answer = {
        "meals": [
            {"weekday": 0, "slot": "dinner", "name": "Chilli", "servings": 6, "ingredients": [{"name": "beans", "amount": 2, "unit": "can", "category": "pantry"}], "steps": ["Cook"]},
            {"weekday": 1, "slot": "lunchbox", "name": "Chilli", "servings": 2, "ingredients": [], "steps": ["Pack"]},
            {"weekday": 5, "slot": "lunch", "name": "Pancakes", "servings": 4, "ingredients": [{"name": "eggs", "amount": 3, "unit": "pcs", "category": "dairy"}], "steps": ["Fry"]},
        ]
    }
    plan = (await client.post(f"/api/meals/import?week_start={week}", content=json.dumps(answer), headers={"Content-Type": "text/plain"})).json()
    assert sorted((m["weekday"], m["slot"]) for m in plan["meals"]) == [(0, "dinner"), (1, "lunchbox"), (5, "lunch")]
    # The Sunday check-in shows the day's dinner and its lunch apart.
    days = (await client.get(f"/api/week?start={week}")).json()["days"]
    assert days[0]["meal"] == "Chilli" and days[0]["lunch"] is None
    assert days[1]["meal"] is None and days[1]["lunch"] == "Chilli"
    assert days[5]["lunch"] == "Pancakes"


async def test_a_meal_set_by_hand(client):
    await _setup(client)
    week = _monday()
    plan = (await client.put("/api/meals/plan/meal", json={"week_start": week, "weekday": 4, "name": "Tacos"})).json()
    assert [(m["weekday"], m["slot"], m["name"]) for m in plan["meals"]] == [(4, "dinner", "Tacos")]
    # A recipe in the book with the same name brings its ingredients and steps.
    await client.post("/api/meals/recipes", json={"name": "Fish soup", "servings": 4, "ingredients": [{"name": "cod", "amount": 400, "unit": "g"}], "steps": ["Simmer"]})
    plan = (await client.put("/api/meals/plan/meal", json={"week_start": week, "weekday": 4, "name": "fish soup"})).json()
    friday = [m for m in plan["meals"] if m["weekday"] == 4]
    assert len(friday) == 1 and friday[0]["name"] == "Fish soup" and friday[0]["ingredients"][0]["name"] == "cod"
    # A lunch beside the dinner; then the dinner taken away.
    plan = (await client.put("/api/meals/plan/meal", json={"week_start": week, "weekday": 4, "slot": "lunchbox", "name": "Leftover soup"})).json()
    assert len(plan["meals"]) == 2
    plan = (await client.put("/api/meals/plan/meal", json={"week_start": week, "weekday": 4, "name": ""})).json()
    assert [(m["slot"], m["name"]) for m in plan["meals"]] == [("lunchbox", "Leftover soup")]
