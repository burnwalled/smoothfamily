"""3.0.4: everything about a kitchen display set centrally – its theme, the smart home devices it may
control (never a lock, never another family's), the week's meals and the recipe book with the cooking
mode."""
import json
import uuid
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    return screen, screen["url"].rsplit("/", 1)[1]


async def test_the_screens_theme_and_its_new_widgets_are_chosen(client):
    screen, token = await _setup(client)
    # A screen that never chose doesn't get the week's meals or the recipe book on its own.
    assert "week" not in screen["widgets"] and "recipes" not in screen["widgets"]
    assert screen["theme"] == ""
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"theme": "ocean"})).json()["theme"] == "ocean"
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"theme": "pink"})).status_code == 422
    view = (await client.get(f"/api/kiosk/{token}")).json()
    assert view["theme"] == "ocean" and view["week"] == [] and view["devices"] == []
    # Not shown, not reachable.
    assert (await client.get(f"/api/kiosk/{token}/recipes")).status_code == 404


async def test_the_fox_gets_the_weather_even_with_the_widget_off(client, monkeypatch):
    """3.5.1: the screensavers that play out the weather need the family's place, not the widget."""
    from app.routers import kiosk as kiosk_router

    screen, token = await _setup(client)
    await client.put(f"/api/kiosks/{screen['id']}", json={"widgets": ["calendar"], "screensaver": "fox"})

    async def fake_forecast(lat, lon):
        return [{"time": __import__("datetime").datetime.now(__import__("datetime").timezone.utc), "temp": 6.0, "kind": "rain", "precip": 0.4, "wind": 5.0}]

    monkeypatch.setattr(kiosk_router, "forecast", fake_forecast)
    # No place: nothing, whatever the screensaver.
    assert (await client.get(f"/api/kiosk/{token}")).json()["weather"] is None
    assert (await client.put("/api/dashboard/sources/weather", json={"lat": 59.33, "lon": 18.06, "place": "Home"})).status_code == 200
    view = (await client.get(f"/api/kiosk/{token}")).json()
    assert view["weather"]["now"]["kind"] == "rain" and "weather" not in view["widgets"]
    # A screen with photos and no widget doesn't read it.
    await client.put(f"/api/kiosks/{screen['id']}", json={"screensaver": "photos"})
    assert (await client.get(f"/api/kiosk/{token}")).json()["weather"] is None


async def test_the_weeks_meals_and_the_recipe_book_in_the_cooking_mode(client):
    screen, token = await _setup(client)
    await client.put(f"/api/kiosks/{screen['id']}", json={"widgets": ["calendar", "week", "recipes"]})
    monday = date.today() - timedelta(days=date.today().weekday())
    meals = {"meals": [{"weekday": d, "name": f"Dinner {d}", "steps": ["Boil", "Eat"], "ingredients": [{"name": "Pasta", "amount": 500, "unit": "g"}]} for d in range(7)]}
    assert (await client.post(f"/api/meals/import?week_start={monday}", content=json.dumps(meals), headers={"Content-Type": "text/plain"})).status_code == 200
    recipe = (await client.post("/api/meals/recipes", json={"name": "Pancakes", "steps": ["Whisk", "Fry"], "ingredients": [{"name": "Milk", "amount": 6, "unit": "dl"}]})).json()

    view = (await client.get(f"/api/kiosk/{token}")).json()
    assert [m["name"] for m in view["week"]] == [f"Dinner {d}" for d in range(7)] and view["week"][0]["cook"] is True
    cook = (await client.get(f"/api/kiosk/{token}/meals/{view['week'][2]['meal_id']}")).json()
    assert cook["name"] == "Dinner 2" and cook["steps"] == ["Boil", "Eat"] and cook["ingredients"][0]["name"] == "Pasta"

    book = (await client.get(f"/api/kiosk/{token}/recipes")).json()
    assert [r["name"] for r in book] == ["Pancakes"] and book[0]["photo"] is False
    pancakes = (await client.get(f"/api/kiosk/{token}/recipes/{recipe['id']}")).json()
    assert pancakes["steps"] == ["Whisk", "Fry"] and pancakes["ingredients"][0]["unit"] == "dl"
    assert (await client.get(f"/api/kiosk/{token}/recipes/{uuid.uuid4()}")).status_code == 404
    assert (await client.get(f"/api/kiosk/{token}/recipes/{recipe['id']}/photo")).status_code == 404


async def test_the_screen_controls_only_the_devices_chosen_for_it(client):
    screen, token = await _setup(client)
    await client.post("/api/smarthome/connection/simulated")
    devices = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    kitchen, hall = devices["light.kitchen"], devices["light.hall"]

    # Only the family's own devices are kept.
    chosen = (await client.put(f"/api/kiosks/{screen['id']}", json={"devices": [kitchen["id"], str(uuid.uuid4())]})).json()
    assert chosen["devices"] == [kitchen["id"]]

    view = (await client.get(f"/api/kiosk/{token}")).json()
    assert [d["entity_id"] for d in view["devices"]] == ["light.kitchen"] and view["devices"][0]["state"] == "on"

    client.cookies.clear()  # the screen has no account
    assert (await client.post(f"/api/kiosk/{token}/devices/{kitchen['id']}/action", json={"action": "toggle"})).status_code == 200
    states = {d["entity_id"]: d["state"] for d in (await client.get(f"/api/kiosk/{token}/devices")).json()}
    assert states == {"light.kitchen": "off"}
    # A device that isn't on the screen can't be pressed from it.
    assert (await client.post(f"/api/kiosk/{token}/devices/{hall['id']}/action", json={"action": "toggle"})).status_code == 404
