"""2.8.4: receipts in the vault – linked to a home, a vehicle or a category, with warranty, returns,
search, the year in numbers, an export and reminders. Seen by the one who added it and the adults."""
import io
from datetime import date, datetime, timedelta, timezone

import pytest
from PIL import Image

pytestmark = pytest.mark.asyncio


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (200, 200, 200)).save(buf, "PNG")
    return buf.getvalue()


async def _login(client, username: str, password: str = "pass1234"):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for name, role in (("bo", "adult"), ("leo", "child")):
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    assert (await client.put(f"/api/family/members/{ids['leo']}/apps", json={"apps": ["photos"]})).status_code == 200
    return ids


async def test_a_receipt_linked_to_the_cabin_with_returns_and_warranty(client):
    await _family(client)
    # The time to complain follows the country (by the language): three years in Sweden.
    assert (await client.patch("/api/auth/me", json={"language": "sv"})).status_code == 200
    cabin = (await client.post("/api/property/properties", json={"name": "Stugan"})).json()
    photo = (await client.post("/api/vault/receipts", files={"file": ("k.png", _png(), "image/png")})).json()
    today = date.today()
    body = {
        "media_id": photo["id"], "store": "Clas Ohlson", "amount": 1299, "purchased_on": str(today), "category": "home",
        "property_id": cabin["id"], "return_until": str(today + timedelta(days=30)), "note": "Kaffebryggare",
    }
    created = await client.post("/api/receipts", json=body)
    assert created.status_code == 201, created.text
    receipt = created.json()["receipt"]
    assert created.json()["duplicates"] == []
    assert receipt["property_name"] == "Stugan" and receipt["complaint_until"] == str(today.replace(year=today.year + 3))

    # The same again: a warning that it may be a double.
    again = (await client.post("/api/receipts", json={**body, "media_id": None})).json()
    assert [d["id"] for d in again["duplicates"]] == [receipt["id"]]
    await client.delete(f"/api/receipts/{again['receipt']['id']}")

    assert [r["id"] for r in (await client.get(f"/api/receipts?property_id={cabin['id']}")).json()] == [receipt["id"]]
    assert [r["id"] for r in (await client.get("/api/receipts?show=returns")).json()] == [receipt["id"]]
    assert [r["id"] for r in (await client.get("/api/receipts?show=warranty")).json()] == [receipt["id"]]
    # Returned: out of the returns and the warranty.
    assert (await client.post(f"/api/receipts/{receipt['id']}/returned", json={"returned": True})).json()["returned_at"]
    assert (await client.get("/api/receipts?show=returns")).json() == []
    assert (await client.get("/api/receipts?show=warranty")).json() == []

    # The receipt's own lines are searchable.
    assert (await client.patch(f"/api/receipts/{receipt['id']}", json={"text": "MOCCAMASTER KBG SELECT 1299,00"})).status_code == 200
    assert len((await client.get("/api/receipts?q=moccamaster")).json()) == 1
    assert (await client.get("/api/receipts?q=dammsugare")).json() == []


async def test_who_sees_a_receipt(client):
    ids = await _family(client)
    photo = (await client.post("/api/vault/receipts", files={"file": ("a.png", _png(), "image/png")})).json()
    anna = (await client.post("/api/receipts", json={"media_id": photo["id"], "store": "ICA", "amount": 312.5, "category": "food"})).json()["receipt"]

    await _login(client, "leo")
    assert (await client.get("/api/receipts")).json() == []
    assert (await client.get(f"/api/media/{photo['id']}/thumb")).status_code == 404
    # Someone else's photo can't be put on one's own receipt.
    assert (await client.post("/api/receipts", json={"media_id": photo["id"], "store": "x"})).status_code == 422
    leo = (await client.post("/api/receipts", json={"store": "Lekia", "amount": 199, "category": "children"})).json()["receipt"]
    assert [r["id"] for r in (await client.get("/api/receipts")).json()] == [leo["id"]]

    await _login(client, "bo")
    assert {r["id"] for r in (await client.get("/api/receipts")).json()} == {anna["id"], leo["id"]}
    assert (await client.get(f"/api/media/{photo['id']}/thumb")).status_code == 200
    assert ids


async def test_the_year_in_numbers_and_the_export(client):
    await _family(client)
    year = date.today().year
    for store, amount, category, month in (("ICA", 500, "food", 1), ("ICA", 250, "food", 2), ("=HYPERLINK(1)", 1000, "electronics", 2)):
        assert (await client.post("/api/receipts", json={"store": store, "amount": amount, "category": category, "purchased_on": f"{year}-{month:02d}-10"})).status_code == 201
    # Bought abroad: not added to the family's currency.
    await client.post("/api/receipts", json={"store": "Biltema Norge", "amount": 90, "currency": "NOK", "category": "vehicle", "purchased_on": f"{year}-03-01"})

    stats = (await client.get(f"/api/receipts/stats?year={year}")).json()
    assert stats["total"] == 1750
    assert stats["by_category"][0] == {"category": "electronics", "total": 1000, "count": 1}
    assert stats["by_month"][:3] == [500, 1250, 0]
    assert stats["by_store"][0]["store"] == "=HYPERLINK(1)"

    csv = await client.get(f"/api/receipts/export.csv?year={year}")
    assert csv.status_code == 200 and "attachment" in csv.headers["content-disposition"]
    assert "'=HYPERLINK(1)" in csv.text and ";500.00;" in csv.text


async def test_reminders_before_the_last_day_to_return_and_the_warranty(client, db_session):
    from app.models import Notification
    from app.routers.receipts import run_receipt_reminders
    from sqlalchemy import select

    await _family(client)
    today = datetime.now(timezone.utc).replace(hour=9)
    await client.post("/api/receipts", json={"store": "Elgiganten", "amount": 4990, "category": "electronics", "return_until": str(today.date() + timedelta(days=1)), "warranty_until": str(today.date() + timedelta(days=20))})
    await client.post("/api/receipts", json={"store": "Later", "amount": 10, "return_until": str(today.date() + timedelta(days=10))})
    assert await run_receipt_reminders(db_session, today) == 2
    assert await run_receipt_reminders(db_session, today) == 0  # once per date
    kinds = (await db_session.execute(select(Notification.kind))).scalars().all()
    assert sorted(k for k in kinds if k.startswith("receipt_")) == ["receipt_return", "receipt_warranty"]



async def test_a_childs_things_shared_with_the_other_home(client, db_session):
    from app.routers.receipts import coparent_costs

    await _family(client)
    members = {m["username"]: m for m in (await client.get("/api/family/members")).json()}
    leo = members["leo"]["id"]
    year = date.today().year
    assert (await client.post("/api/receipts", json={"store": "Lindex", "amount": 400, "category": "clothes", "purchased_on": f"{year}-03-02", "child_id": leo})).status_code == 201
    assert (await client.post("/api/receipts", json={"store": "Stadium", "amount": 1000, "category": "leisure", "purchased_on": f"{year}-03-20", "child_id": leo, "split_pct": 30})).status_code == 201
    # Only a child of the family can be chosen.
    assert (await client.post("/api/receipts", json={"store": "x", "amount": 1, "child_id": members["bo"]["id"]})).status_code == 422

    shared = (await client.get(f"/api/receipts/shared?year={year}")).json()
    assert shared == [{"child_id": leo, "month": 3, "total": 1400.0, "their_part": 500.0, "count": 2, "child_name": "Leo"}]
    # The other parent's page: amounts and shops, never photos or notes.
    me = (await client.get("/api/auth/me")).json()
    costs = await coparent_costs(db_session, __import__("uuid").UUID(me["family_id"]), [leo])
    assert [(c["store"], c["their_part"]) for c in costs] == [("Stadium", 300.0), ("Lindex", 200.0)]
    assert "note" not in costs[0] and "media_id" not in costs[0]
    assert await coparent_costs(db_session, __import__("uuid").UUID(me["family_id"]), []) == []
