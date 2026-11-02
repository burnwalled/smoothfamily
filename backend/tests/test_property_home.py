"""Homes (2.6.5): the overview, maintenance that comes back (and becomes a task), things in the
home with warranty and service, energy per month (also from Home Assistant), documents, a receipt
read by the local AI, and removing a home with all that belongs to it."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from tests.test_local_ai import _configure, ollama  # noqa: F401 – the fixture
from tests.test_vehicles import _pdf

pytestmark = pytest.mark.asyncio


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    erik = (await client.post("/api/family/members", json={"display_name": "Erik", "username": "erik", "password": "pass1234", "role": "adult"})).json()
    home = (await client.post("/api/property/properties", json={"name": "Villan", "dwelling": "villa", "built_year": 1978, "area_m2": 142, "purchase_price": 3_000_000})).json()
    return home, erik


async def test_overview_costs_and_projects(client):
    home, _ = await _setup(client)
    assert (home["dwelling"], home["built_year"]) == ("villa", 1978)
    roof = (await client.post("/api/property/projects", json={"property_id": home["id"], "name": "New roof", "status": "active", "budget": 150_000})).json()
    today = str(date.today())
    paint = (await client.post("/api/property/expenses", json={"property_id": home["id"], "project_id": roof["id"], "name": "Roof tiles", "amount": 60_000, "expense_date": today, "category": "renovation"})).json()
    await client.post("/api/property/expenses", json={"property_id": home["id"], "name": "Electricity", "amount": 1_500, "expense_date": today, "category": "utility"})
    await client.post("/api/property/recurring-costs", json={"property_id": home["id"], "kind": "Insurance", "amount": 6_000, "period": "yearly"})

    card = (await client.get("/api/property/overview")).json()[0]
    assert card["cost_this_year"] == 61_500 and card["by_category"] == {"renovation": 60_000, "utility": 1_500}
    assert card["recurring_monthly"] == 500 and card["ownership_cost"] == 3_061_500
    assert [(p["name"], p["budget"], p["spent"]) for p in card["projects"]] == [("New roof", 150_000, 60_000)]

    # Change and remove.
    changed = (await client.patch(f"/api/property/expenses/{paint['id']}", json={**paint, "amount": 65_000})).json()
    assert changed["amount"] == 65_000
    done = (await client.patch(f"/api/property/projects/{roof['id']}", json={**roof, "status": "done"})).json()
    assert done["finished_at"] == today and done["spent"] == 65_000
    assert (await client.get("/api/property/overview")).json()[0]["projects"] == []
    assert (await client.delete(f"/api/property/projects/{roof['id']}")).status_code == 204
    # The cost stays with the home.
    assert [e["project_id"] for e in (await client.get(f"/api/property/expenses?property_id={home['id']}")).json() if e["name"] == "Roof tiles"] == [None]


async def test_maintenance_becomes_a_task(client, db_session):
    from app.routers.property import add_months, run_property_reminders

    home, erik = await _setup(client)
    today = date.today()
    gutters = (
        await client.post(
            "/api/property/reminders",
            json={"property_id": home["id"], "title": "Clear the gutters", "due_date": str(today + timedelta(days=5)), "repeat_months": 12, "assignee_id": erik["id"], "task_points": 20},
        )
    ).json()
    # Due within its remind days: a task for Erik at once.
    assert gutters["status"] == "soon" and gutters["task_id"]
    task = next(t for t in (await client.get("/api/tasks")).json() if t["id"] == gutters["task_id"])
    assert (task["title"], task["points"], task["assignee_id"], task["property_id"]) == ("Maintenance: Clear the gutters", 20, erik["id"], home["id"])

    # In the calendar, and told once.
    day = today + timedelta(days=5)
    events = (await client.get(f"/api/calendar/events?start={day}&end={day + timedelta(days=1)}")).json()
    assert [e["title"] for e in events if e.get("property_id")] == ["Clear the gutters – Villan"]
    morning = datetime.now(timezone.utc).replace(hour=8)
    assert await run_property_reminders(db_session, morning) == 2
    assert await run_property_reminders(db_session, morning) == 0

    # Erik does the task: the maintenance is done and the next one is a year on.
    assert (await client.post("/api/auth/login", json={"username": "erik", "password": "pass1234"})).status_code == 200
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 200
    await run_property_reminders(db_session, morning)
    nxt = (await client.get(f"/api/property/reminders?property_id={home['id']}")).json()[0]
    assert nxt["due_date"] == str(add_months(today, 12)) and nxt["last_done"] == str(today) and nxt["task_id"] is None

    # By hand too; a one-off goes once done.
    once = (await client.post("/api/property/reminders", json={"property_id": home["id"], "title": "Fix the fence", "due_date": str(today)})).json()
    assert (await client.post(f"/api/property/reminders/{once['id']}/done", json={})).json() is None


async def test_things_in_the_home(client):
    home, _ = await _setup(client)
    today = date.today()
    pump = (
        await client.post(
            "/api/property/items",
            json={"property_id": home["id"], "name": "Heat pump", "room": "Utility room", "brand": "Nibe", "bought": str(today - timedelta(days=300)), "warranty_until": str(today + timedelta(days=30)), "service_months": 12, "manual_url": "https://nibe.eu/manual"},
        )
    ).json()
    assert pump["warranty"] == "ending" and pump["service_months"] == 12
    assert (await client.post("/api/property/items", json={"property_id": home["id"], "name": "x", "manual_url": "javascript:alert(1)"})).status_code == 422
    kinds = sorted(r["kind"] for r in (await client.get(f"/api/property/reminders?property_id={home['id']}")).json())
    assert kinds == ["maintenance", "warranty"]
    assert (await client.get("/api/property/overview")).json()[0]["warranties_ending"] == 1

    # No service any more: its reminder goes; the item goes with its reminders.
    await client.patch(f"/api/property/items/{pump['id']}", json={**pump, "service_months": None})
    assert [r["kind"] for r in (await client.get("/api/property/reminders")).json()] == ["warranty"]
    assert (await client.delete(f"/api/property/items/{pump['id']}")).status_code == 204
    assert (await client.get("/api/property/reminders")).json() == []


async def test_energy_per_month_and_from_home_assistant(client, db_session, monkeypatch):
    from app.models import SmarthomeConnection
    from app.routers import property as homes
    from app.services.crypto import encrypt_token

    home, _ = await _setup(client)
    # Totals on 1 Jan, 1 Feb and 1 Mar: 310 kWh in January, 280 in February.
    year = date.today().year - 1
    for day, value in [(date(year, 1, 1), 1000), (date(year, 2, 1), 1310), (date(year, 3, 1), 1590)]:
        await client.post("/api/property/utility-readings", json={"property_id": home["id"], "kind": "electricity", "reading_date": str(day), "value": value, "unit": "kWh"})
    energy = (await client.get(f"/api/property/{home['id']}/energy")).json()[0]
    months = {m["month"]: m["use"] for m in energy["months"]}
    assert months[f"{year}-01"] == 310 and months[f"{year}-02"] == 280 and energy["unit"] == "kWh"
    assert homes.monthly_use([(date(2026, 1, 1), 5), (date(2026, 1, 1), 9)]) == {}

    me = (await client.get("/api/auth/me")).json()
    db_session.add(SmarthomeConnection(family_id=uuid.UUID(me["family_id"]), provider="home_assistant", base_url="http://ha.local:8123", token_encrypted=encrypt_token("x")))
    await db_session.commit()

    async def get_state(base_url, token, entity_id):
        return {"state": "1600500", "attributes": {"unit_of_measurement": "Wh"}}

    monkeypatch.setattr(homes.ha, "get_state", get_state)
    assert (await client.post("/api/property/meters", json={"property_id": home["id"], "kind": "electricity", "unit": "kWh", "ha_entity": "bad entity"})).status_code == 422
    meter = (await client.post("/api/property/meters", json={"property_id": home["id"], "kind": "electricity", "unit": "kWh", "ha_entity": "sensor.house_energy"})).json()
    read = (await client.post(f"/api/property/meters/{meter['id']}/read")).json()
    # Wh to kWh; one reading a day.
    assert read[0]["last_reading"] == 1600.5
    await client.post(f"/api/property/meters/{meter['id']}/read")
    readings = (await client.get(f"/api/property/utility-readings?property_id={home['id']}")).json()
    assert len([r for r in readings if r["reading_date"] == str(date.today())]) == 1


async def test_documents_receipts_and_removing_a_home(client, db_session, ollama):  # noqa: F811
    from app.services import ai

    home, _ = await _setup(client)
    doc = (await client.post("/api/documents", json={"kind": "contract", "title": "Purchase contract"})).json()
    assert [d["title"] for d in (await client.put(f"/api/property/{home['id']}/documents/{doc['id']}")).json()] == ["Purchase contract"]

    await _configure(client)
    ollama.online = True
    job = (await client.post(f"/api/ai/jobs/property-pdf?property_id={home['id']}", files={"file": ("invoice.pdf", _pdf("Faktura Vattenfall 2026-10-01 Att betala 1 234 kr"), "application/pdf")})).json()
    assert job["kind"] == "property_receipt" and "Vattenfall" in job["input"]["text"]
    ollama.answers["property_receipt"] = {"expenses": [{"name": "Elräkning oktober", "amount": 1234, "expense_date": "2026-10-01", "category": "utility"}]}
    assert await ai.tick(db_session, datetime.now(timezone.utc)) == 1
    done = (await client.get(f"/api/ai/jobs/{job['id']}")).json()
    line = {**done["result"]["expenses"][0], "property_id": home["id"]}
    rows = (await client.post(f"/api/ai/jobs/{job['id']}/apply/property", json={"property_id": home["id"], "expenses": [line]})).json()
    assert rows[0]["name"] == "Elräkning oktober" and rows[0]["category"] == "utility"

    # Removing the home takes everything along; the document stays in Documents.
    await client.post("/api/property/reminders", json={"property_id": home["id"], "title": "Sweep the chimney", "due_date": str(date.today())})
    await client.post("/api/property/items", json={"property_id": home["id"], "name": "Fridge"})
    assert (await client.delete(f"/api/property/properties/{home['id']}")).status_code == 204
    assert (await client.get("/api/property/overview")).json() == []
    assert [d["title"] for d in (await client.get("/api/documents")).json()] == ["Purchase contract"]


async def test_coming_up_on_today(client):
    home, _ = await _setup(client)
    car = (await client.post("/api/vehicles", json={"name": "Volvo", "registration": "ABC123", "mileage": 50000})).json()
    today = date.today()
    await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "inspection", "due_date": str(today + timedelta(days=12))})
    await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "service", "due_mileage": 50200})
    await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "tax", "due_date": str(today + timedelta(days=200))})
    await client.post("/api/property/reminders", json={"property_id": home["id"], "title": "Clear the gutters", "due_date": str(today - timedelta(days=2))})
    await client.post("/api/property/reminders", json={"property_id": home["id"], "title": "Oil the decking", "due_date": str(today + timedelta(days=90))})
    rows = (await client.get("/api/dashboard/upcoming")).json()
    assert [(r["title"], r["where"]) for r in rows] == [("Clear the gutters", "Villan"), ("Service", "Volvo"), ("Inspection", "Volvo")]
    assert rows[0]["status"] == "overdue" and rows[1]["left"] == 200 and rows[1]["unit"] == "km"
    assert (await client.post("/api/dashboard/widgets", json={"type": "upcoming"})).status_code == 201
