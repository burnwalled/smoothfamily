"""Pantry (#69): stock with best-before dates, use soon, from and back to the shopping list."""
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    for username, role in [("erik", "adult"), ("leo", "child")]:
        await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_stock_and_use_soon(client):
    await _family(client)
    today = date.today()
    milk = (await client.post("/api/pantry", json={"place": "fridge", "name": "Milk", "amount": 1, "unit": "l", "best_before": str(today + timedelta(days=2))})).json()
    peas = (await client.post("/api/pantry", json={"place": "freezer", "name": "Peas", "best_before": str(today + timedelta(days=90))})).json()
    yoghurt = (await client.post("/api/pantry", json={"place": "fridge", "name": "Yoghurt", "best_before": str(today - timedelta(days=1))})).json()
    rice = (await client.post("/api/pantry", json={"name": "Rice", "amount": 2, "unit": "kg"})).json()
    assert [milk["status"], peas["status"], yoghurt["status"], rice["status"]] == ["soon", "ok", "expired", "ok"]
    assert rice["place"] == "pantry"
    assert (await client.post("/api/pantry", json={"place": "garage", "name": "x"})).status_code == 422

    # Soonest first, without a date last; by place; what to use first.
    assert [i["name"] for i in (await client.get("/api/pantry")).json()] == ["Yoghurt", "Milk", "Peas", "Rice"]
    assert [i["name"] for i in (await client.get("/api/pantry?place=fridge")).json()] == ["Yoghurt", "Milk"]
    assert [i["name"] for i in (await client.get("/api/pantry/soon")).json()] == ["Yoghurt", "Milk"]

    changed = (await client.put(f"/api/pantry/{peas['id']}", json={"place": "freezer", "name": "Green peas", "best_before": str(today + timedelta(days=1))})).json()
    assert changed["name"] == "Green peas" and changed["status"] == "soon"

    # Children use things up too.
    await _login(client, "leo")
    assert (await client.delete(f"/api/pantry/{rice['id']}")).status_code == 204
    assert len((await client.get("/api/pantry")).json()) == 3


async def test_shopping_list_both_ways(client):
    await _family(client)
    shop = (await client.post("/api/lists", json={"name": "Shopping"})).json()
    bread = (await client.post(f"/api/lists/{shop['id']}/items", json={"name": "Bread"})).json()
    butter = (await client.post(f"/api/lists/{shop['id']}/items", json={"name": "Butter"})).json()

    # Only bought (ticked) items move in.
    assert (await client.post(f"/api/pantry/from-list/{shop['id']}", json={"item_ids": [bread["id"]]})).status_code == 422
    for item in (bread, butter):
        await client.patch(f"/api/lists/{shop['id']}/items/{item['id']}", json={"done": True})
    moved = (await client.post(f"/api/pantry/from-list/{shop['id']}", json={"item_ids": [bread["id"], butter["id"]], "place": "fridge"})).json()
    assert sorted(i["name"] for i in moved) == ["Bread", "Butter"] and {i["place"] for i in moved} == {"fridge"}
    assert (await client.get(f"/api/lists/{shop['id']}/items")).json() == []

    # Used up and back on the list – or nothing changes when the list is wrong.
    first = moved[0]
    assert (await client.post(f"/api/pantry/{first['id']}/finished", json={"to_list": "00000000-0000-0000-0000-000000000000"})).status_code == 404
    assert len((await client.get("/api/pantry")).json()) == 2
    assert (await client.post(f"/api/pantry/{first['id']}/finished", json={"to_list": shop["id"]})).status_code == 204
    assert [i["name"] for i in (await client.get(f"/api/lists/{shop['id']}/items")).json()] == [first["name"]]
    assert (await client.post(f"/api/pantry/{moved[1]['id']}/finished", json={})).status_code == 204
    assert (await client.get("/api/pantry")).json() == []


async def test_another_family_cannot_see_it(client):
    from app.main import app

    await _family(client)
    item = (await client.post("/api/pantry", json={"name": "Coffee"})).json()
    shop = (await client.post("/api/lists", json={"name": "Shopping"})).json()

    # A second family on the same server (invited by the server admin).
    invite = (await client.post("/api/server/invitations", json={"label": "Guests", "days": 7})).json()
    token = invite["url"].rsplit("/", 1)[1]
    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    resp = await other.post(
        f"/api/invite/{token}/family",
        json={"family_name": "Other", "display_name": "Olle", "username": "olle", "password": "guestpass1", "email": "o@example.com"},
    )
    assert resp.status_code == 201
    assert (await other.get("/api/pantry")).json() == []
    assert (await other.put(f"/api/pantry/{item['id']}", json={"name": "Mine now"})).status_code == 404
    assert (await other.delete(f"/api/pantry/{item['id']}")).status_code == 404
    assert (await other.post(f"/api/pantry/{item['id']}/finished", json={})).status_code == 404
    mine = (await other.post("/api/pantry", json={"name": "Tea"})).json()
    assert (await other.post(f"/api/pantry/{mine['id']}/finished", json={"to_list": shop["id"]})).status_code == 404
    await other.aclose()


async def test_reminder_the_evening_before(client, db_session):
    from app.routers.pantry import run_pantry_reminders

    await _family(client)
    today = date.today()
    await client.post("/api/pantry", json={"place": "fridge", "name": "Milk", "best_before": str(today + timedelta(days=1))})
    await client.post("/api/pantry", json={"place": "fridge", "name": "Cream", "best_before": str(today + timedelta(days=1))})
    await client.post("/api/pantry", json={"name": "Rice", "best_before": str(today + timedelta(days=30))})
    evening = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=18)
    assert await run_pantry_reminders(db_session, evening.replace(hour=12)) == 0
    assert await run_pantry_reminders(db_session, evening) == 2  # both adults, not the child
    assert await run_pantry_reminders(db_session, evening + timedelta(minutes=1)) == 0
    [note] = (await client.get("/api/notifications")).json()
    assert note["kind"] == "pantry" and note["body"] == "Keeps until tomorrow: Cream, Milk"
    await _login(client, "leo")
    assert (await client.get("/api/notifications")).json() == []


async def test_scan_groceries_in_and_take_stock(client):
    await _family(client)
    today = date.today()
    # Unknown barcode: nothing to fill in (and no lookup – it is off by default).
    assert (await client.get("/api/pantry/settings")).json() == {"barcode_lookup": False}
    assert (await client.get("/api/pantry/barcode/7310865004703")).json()["source"] == "none"
    assert (await client.get("/api/pantry/barcode/not a code")).status_code == 422

    bag = {
        "mode": "add",
        "lines": [
            {"barcode": "7310865004703", "name": "Milk 1.5 l", "amount": 2, "place": "fridge", "keeps_days": 7},
            {"barcode": "7311070347272", "name": "Pasta", "amount": 1, "unit": "pkt"},
            {"name": "Bananas", "amount": 6},
        ],
    }
    saved = (await client.post("/api/pantry/scan", json=bag)).json()
    assert sorted(i["name"] for i in saved["items"]) == ["Bananas", "Milk 1.5 l", "Pasta"] and saved["missing"] == []
    milk = next(i for i in saved["items"] if i["barcode"] == "7310865004703")
    assert milk["amount"] == 2 and milk["best_before"] == str(today + timedelta(days=7))

    # The family remembers the barcode now.
    known = (await client.get("/api/pantry/barcode/7310865004703")).json()
    assert known == {"barcode": "7310865004703", "name": "Milk 1.5 l", "unit": "", "place": "fridge", "keeps_days": 7, "source": "family"}

    # The same product, place and date again: one item with a bigger amount.
    again = (await client.post("/api/pantry/scan", json={"lines": [{"barcode": "7311070347272", "name": "Pasta", "unit": "pkt"}]})).json()
    assert again["items"][0]["amount"] == 2
    assert len((await client.get("/api/pantry")).json()) == 3

    # Stocktaking the pantry: one pasta left, the bananas weren't scanned, a new jar was found.
    await client.post("/api/pantry", json={"place": "fridge", "name": "Jam"})
    stock = {
        "mode": "count",
        "place": "pantry",
        "lines": [
            {"barcode": "7311070347272", "name": "Pasta", "amount": 1},
            {"barcode": "7340011493256", "name": "Lentils", "amount": 3},
        ],
    }
    assert (await client.post("/api/pantry/scan", json={**stock, "place": None})).status_code == 422
    counted = (await client.post("/api/pantry/scan", json=stock)).json()
    assert sorted((i["name"], i["amount"]) for i in counted["items"]) == [("Lentils", 3), ("Pasta", 1)]
    # Only the counted place: the jam in the fridge isn't asked about.
    assert [i["name"] for i in counted["missing"]] == ["Bananas"]

    # Counted to zero: gone.
    await client.post("/api/pantry/scan", json={"mode": "count", "place": "pantry", "lines": [{"barcode": "7311070347272", "name": "Pasta", "amount": 0}]})
    assert "Pasta" not in [i["name"] for i in (await client.get("/api/pantry?place=pantry")).json()]

    # Only the family admin turns the lookup on.
    await _login(client, "erik")
    assert (await client.put("/api/pantry/settings", json={"barcode_lookup": True})).status_code == 403


async def test_lookup_sends_only_the_barcode(client, monkeypatch):
    from app.services import pantry_scan

    asked = []

    async def fake(code, language):
        asked.append((code, language))
        return "Arla Mjölk 1.5 l", "fridge", 7

    monkeypatch.setattr(pantry_scan, "lookup", fake)
    await _family(client)
    assert (await client.get("/api/pantry/barcode/7310865004703")).json()["source"] == "none"
    assert asked == []
    assert (await client.put("/api/pantry/settings", json={"barcode_lookup": True})).json() == {"barcode_lookup": True}
    found = (await client.get("/api/pantry/barcode/7310865004703")).json()
    assert found["name"] == "Arla Mjölk 1.5 l" and found["source"] == "lookup"
    assert (found["place"], found["keeps_days"]) == ("fridge", 7)
    # Only food barcodes (EAN/UPC) are looked up.
    await client.get("/api/pantry/barcode/ABC-123")
    assert asked == [("7310865004703", "en")]

    # The family's own choice wins over the guess next time: kept in the pantry, 10 days on the pack.
    best = date.today() + timedelta(days=10)
    line = {"barcode": "7310865004703", "name": "Mjölk", "place": "pantry", "best_before": str(best), "keeps_days": 7}
    await client.post("/api/pantry/scan", json={"lines": [line]})
    mine = (await client.get("/api/pantry/barcode/7310865004703")).json()
    assert (mine["name"], mine["place"], mine["keeps_days"], mine["source"]) == ("Mjölk", "pantry", 10, "family")
    assert len(asked) == 1


def test_category_guesses():
    from app.services.pantry_scan import guess_from_categories

    # Milk wrongly also tagged as a soda is still milk in the fridge.
    assert guess_from_categories(["en:beverages", "en:dairies", "en:sodas"]) == ("fridge", 10)
    assert guess_from_categories(["en:frozen-foods", "en:fresh-vegetables"]) == ("freezer", 180)
    assert guess_from_categories(["en:breads", "en:crispbreads"]) == ("pantry", 180)
    assert guess_from_categories(["en:meats", "en:minced-meats"]) == ("fridge", 2)
    assert guess_from_categories(["en:something-else"]) == (None, None)


async def test_kitchen_screen_scans_only_when_allowed(client):
    await _family(client)
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    token = screen["url"].rsplit("/", 1)[1]
    line = {"lines": [{"barcode": "7310865004703", "name": "Milk", "place": "fridge"}]}
    assert (await client.get(f"/api/kiosk/{token}")).json()["pantry_scan"] is False
    assert (await client.post(f"/api/kiosk/{token}/pantry/scan", json=line)).status_code == 403

    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"pantry_scan": True})).json()["pantry_scan"] is True
    assert (await client.get(f"/api/kiosk/{token}")).json()["pantry_scan"] is True
    saved = (await client.post(f"/api/kiosk/{token}/pantry/scan", json=line)).json()
    assert saved["items"][0]["name"] == "Milk"
    assert (await client.get(f"/api/kiosk/{token}/pantry/barcode/7310865004703")).json()["source"] == "family"
    item = (await client.get("/api/pantry")).json()[0]
    assert (await client.delete(f"/api/kiosk/{token}/pantry/{item['id']}")).status_code == 204
    assert (await client.get("/api/pantry")).json() == []

    # Disconnected: nothing more.
    await client.delete(f"/api/kiosks/{screen['id']}")
    assert (await client.post(f"/api/kiosk/{token}/pantry/scan", json=line)).status_code == 404

