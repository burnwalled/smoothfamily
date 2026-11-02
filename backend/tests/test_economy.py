"""2.8.5: the household's economy – gathered from receipts, homes, vehicles and trips, plus incomes and
costs of its own (each adult adds their own income), private entries, budgets and the bank import."""
from datetime import date

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    for name, role in (("bo", "adult"), ("leo", "child")):
        assert (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).status_code == 201
    members = {m["username"]: m["id"] for m in (await client.get("/api/family/members")).json()}
    assert (await client.put(f"/api/family/members/{members['bo']}/apps", json={"apps": ["property", "lists"]})).status_code == 200


async def _login(client, username, password="pass1234"):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_everything_in_one_place_by_category(client):
    await _family(client)
    year = date.today().year
    house = (await client.post("/api/property/properties", json={"name": "Villan"})).json()
    cabin = (await client.post("/api/property/properties", json={"name": "Stugan"})).json()
    car = (await client.post("/api/vehicles", json={"name": "Volvo"})).json()
    await client.post("/api/property/expenses", json={"property_id": cabin["id"], "name": "Sotning", "amount": 900, "expense_date": f"{year}-01-15", "category": "maintenance"})
    await client.post("/api/vehicles/expenses", json={"vehicle_id": car["id"], "name": "Tankning", "amount": 700, "expense_date": f"{year}-01-20", "category": "fuel"})
    await client.post("/api/receipts", json={"store": "ICA", "amount": 1200, "category": "food", "purchased_on": f"{year}-01-05"})
    await client.post("/api/receipts", json={"store": "Bauhaus", "amount": 300, "category": "home", "property_id": house["id"], "purchased_on": f"{year}-01-06"})
    assert (await client.post("/api/economy/entries", json={"kind": "out", "category": "subscriptions", "amount": 129, "day": f"{year}-01-01", "note": "Spotify"})).status_code == 201
    assert (await client.post("/api/economy/entries", json={"kind": "out", "category": "nonsense", "amount": 1, "day": f"{year}-01-01"})).status_code == 422

    view = (await client.get(f"/api/economy?year={year}")).json()
    totals = {r["key"]: r["total"] for r in view["out"]}
    assert totals == {f"home:{cabin['id']}": 900, f"vehicle:{car['id']}": 700, "food": 1200, f"home:{house['id']}": 300, "subscriptions": 129}
    labels = {r["key"]: r["label"] for r in view["out"]}
    assert labels[f"home:{cabin['id']}"] == "Stugan" and labels[f"vehicle:{car['id']}"] == "Volvo"
    assert view["months"][0]["out"] == 3229


async def test_each_adult_adds_their_own_income_and_private_stays_private(client):
    await _family(client)
    year = date.today().year
    assert (await client.post("/api/economy/entries", json={"kind": "in", "category": "salary", "amount": 30000, "day": f"{year}-01-25", "recurring": "monthly"})).status_code == 201
    assert (await client.post("/api/economy/entries", json={"kind": "out", "category": "gifts", "amount": 500, "day": f"{year}-01-10", "private": True})).status_code == 201
    await _login(client, "bo")
    assert (await client.post("/api/economy/entries", json={"kind": "in", "category": "salary", "amount": 28000, "day": f"{year}-01-25"})).status_code == 201
    view = (await client.get(f"/api/economy?year={year}")).json()
    # Anna's salary every month so far this year, Bo's once; Anna's private gift is not here.
    months_so_far = date.today().month
    assert view["total_in"] == 30000 * months_so_far + 28000
    assert {e["name"] for e in view["earners"]} == {"Anna", "Bo"}
    assert "gifts" not in {r["key"] for r in view["out"]}
    assert all(not e["private"] for e in (await client.get("/api/economy/entries")).json())

    # Children have no economy.
    await _login(client, "leo")
    assert (await client.get("/api/economy")).status_code == 403


async def test_budgets_and_the_bank_import(client):
    from tests.test_bank import SWEDBANK

    await _family(client)
    assert (await client.put("/api/economy/budgets", json={"budgets": {"food": 6000, "bogus": 1}})).status_code == 422
    assert (await client.put("/api/economy/budgets", json={"budgets": {"food": 6000}})).status_code == 200
    rows = (await client.post("/api/bank/parse", files={"file": ("export.csv", SWEDBANK, "text/csv")})).json()
    ica = next(r for r in rows if r["text"] == "ICA NARA SOLNA")
    assert ica["suggestion"] == {"target": "economy", "target_id": None, "category": "food", "source": "known"}
    done = await client.post("/api/bank/import", json={"rows": [{"day": ica["day"], "text": ica["text"], "amount": ica["amount"], "digest": ica["digest"], "target": "economy", "category": "food", "name": "ICA"}]})
    assert done.json()["imported"] == 1
    view = (await client.get("/api/economy?year=2026")).json()
    food = next(r for r in view["out"] if r["key"] == "food")
    assert food["total"] == 345.9 and food["budget"] == 6000
    assert [e["source"] for e in (await client.get("/api/economy/entries?year=2026")).json()] == ["bank"]
