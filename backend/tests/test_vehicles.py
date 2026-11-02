"""Vehicles (2.6.0): reminders by date and mileage, the odometer, consumption, the overview, the
calendar, changing costs, and a receipt read by the local AI."""
import io
from datetime import date, datetime, timedelta, timezone

import pytest

from tests.test_local_ai import _configure, ollama  # noqa: F401 – the fixture

pytestmark = pytest.mark.asyncio


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    await client.post("/api/family/members", json={"display_name": "Erik", "username": "erik", "password": "pass1234", "role": "adult"})
    car = (await client.post("/api/vehicles", json={"name": "Volvo", "registration": "ABC123", "mileage": 50000, "fuel": "petrol"})).json()
    return car


async def test_reminders_by_date_and_mileage(client, db_session):
    from app.routers.vehicles import add_months, run_vehicle_reminders

    car = await _setup(client)
    today = date.today()
    inspection = (
        await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "inspection", "due_date": str(today + timedelta(days=10)), "repeat_months": 14})
    ).json()
    assert inspection["status"] == "soon" and inspection["days_left"] == 10
    service = (
        await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "service", "due_mileage": 60000, "repeat_km": 15000, "repeat_months": 12})
    ).json()
    assert service["status"] == "ok" and service["km_left"] == 10000
    assert (await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "tyres"})).status_code == 422

    # Told once, from 07 UTC, to the adults who see the car.
    morning = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=8)
    assert await run_vehicle_reminders(db_session, morning) == 2
    assert await run_vehicle_reminders(db_session, morning) == 0
    titles = sorted(n["title"] for n in (await client.get("/api/notifications")).json() if n["kind"] == "vehicle_reminder")
    assert titles == ["Inspection for Volvo"]

    # In the calendar.
    day = today + timedelta(days=10)
    events = (await client.get(f"/api/calendar/events?start={day}&end={day + timedelta(days=1)}")).json()
    assert [e["title"] for e in events if e.get("vehicle_id")] == ["Inspection – Volvo"]

    # Driving: close to the service mileage it's "soon" and told once.
    await client.post(f"/api/vehicles/{car['id']}/mileage", json={"reading_date": str(today), "mileage": 59500})
    rows = {r["kind"]: r for r in (await client.get(f"/api/vehicles/reminders?vehicle_id={car['id']}")).json()}
    assert rows["service"]["status"] == "soon" and rows["service"]["km_left"] == 500
    # The most urgent first: 10 days before 500 km (≈ 15 days of driving).
    assert [r["kind"] for r in (await client.get("/api/vehicles/reminders")).json()] == ["inspection", "service"]

    # Done: the next one counts from when it was done.
    nxt = (await client.post(f"/api/vehicles/reminders/{service['id']}/done", json={"done_date": str(today), "mileage": 59800})).json()
    assert nxt["due_mileage"] == 74800 and nxt["due_date"] == str(add_months(today, 12)) and nxt["last_done"] == str(today)
    nxt = (await client.post(f"/api/vehicles/reminders/{inspection['id']}/done", json={})).json()
    assert nxt["due_date"] == str(add_months(today, 14))
    # A one-off goes once done.
    once = (await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "other", "title": "Recall: airbag", "due_date": str(today)})).json()
    assert (await client.post(f"/api/vehicles/reminders/{once['id']}/done", json={})).json() is None
    assert len((await client.get("/api/vehicles/reminders")).json()) == 2
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


async def test_odometer_costs_and_overview(client):
    car = await _setup(client)
    today = date.today()

    def day(n):
        return str(today - timedelta(days=n))

    # Full-tank fills: 40 l after 500 km and 35 l after 500 km more → 7.5 l per 100 km.
    first = (await client.post("/api/vehicles/expenses", json={"vehicle_id": car["id"], "name": "Fuel", "amount": 800, "expense_date": day(20), "category": "fuel", "mileage_at": 50000, "volume": 45, "volume_unit": "l"})).json()
    await client.post("/api/vehicles/expenses", json={"vehicle_id": car["id"], "name": "Fuel", "amount": 760, "expense_date": day(10), "category": "fuel", "mileage_at": 50500, "volume": 40, "volume_unit": "l"})
    last = (await client.post("/api/vehicles/expenses", json={"vehicle_id": car["id"], "name": "Fuel", "amount": 700, "expense_date": day(1), "category": "fuel", "mileage_at": 51000, "volume": 35, "volume_unit": "l"})).json()
    assert (await client.get("/api/vehicles")).json()[0]["mileage"] == 51000
    log = (await client.get(f"/api/vehicles/{car['id']}/mileage")).json()
    assert [r["mileage"] for r in log] == [51000, 50500, 50000] and all(r["from_expense"] for r in log)
    assert (await client.delete(f"/api/vehicles/mileage/{log[0]['id']}")).status_code == 409

    card = (await client.get("/api/vehicles/overview")).json()[0]
    assert card["consumption"] == 7.5 and card["consumption_unit"] == "l"
    assert card["vehicle"]["fuel"] == "petrol"
    if date.fromisoformat(day(20)).year == today.year:
        assert card["cost_this_year"] == 2260 and card["by_category"] == {"fuel": 2260}

    # Change a cost (and its reading) or remove it.
    changed = (await client.patch(f"/api/vehicles/expenses/{last['id']}", json={**last, "amount": 650, "mileage_at": 51100})).json()
    assert changed["amount"] == 650
    assert [r["mileage"] for r in (await client.get(f"/api/vehicles/{car['id']}/mileage")).json()][0] == 51100
    assert (await client.delete(f"/api/vehicles/expenses/{first['id']}")).status_code == 204
    assert len((await client.get(f"/api/vehicles/{car['id']}/mileage")).json()) == 2

    # A reading typed in by hand can be removed.
    typed = (await client.post(f"/api/vehicles/{car['id']}/mileage", json={"reading_date": str(today), "mileage": 51300})).json()
    assert typed["from_expense"] is False and (await client.get("/api/vehicles")).json()[0]["mileage"] == 51300
    assert (await client.delete(f"/api/vehicles/mileage/{typed['id']}")).status_code == 204
    assert (await client.get("/api/vehicles")).json()[0]["mileage"] == 51100


async def test_only_who_may_see_the_vehicle(client):
    car = await _setup(client)
    erik = next(m for m in (await client.get("/api/family/members")).json() if m["username"] == "erik")
    admin = next(m for m in (await client.get("/api/family/members")).json() if m["username"] == "admin")
    reminder = (await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "tax", "due_date": str(date.today())})).json()
    await client.put(f"/api/vehicles/{car['id']}/access", json={"allowed_user_ids": [admin["id"]]})
    assert (await client.post("/api/auth/login", json={"username": "erik", "password": "pass1234"})).status_code == 200
    assert (await client.get("/api/vehicles/reminders")).json() == []
    assert (await client.get("/api/vehicles/overview")).json() == []
    assert (await client.post(f"/api/vehicles/reminders/{reminder['id']}/done", json={})).status_code == 404
    assert erik["role"] == "adult"


async def test_receipt_read_by_the_local_ai(client, db_session, ollama):  # noqa: F811
    from PIL import Image

    from app.services import ai

    car = await _setup(client)
    await _configure(client)
    ollama.online = True
    album = (await client.post("/api/albums", json={"name": "Receipts"})).json()
    png = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(png, format="PNG")
    media = (await client.post(f"/api/albums/{album['id']}/media", files={"file": ("receipt.png", png.getvalue(), "image/png")})).json()

    assert (await client.post("/api/ai/jobs", json={"kind": "vehicle_receipt"})).status_code == 422
    job = (await client.post("/api/ai/jobs", json={"kind": "vehicle_receipt", "vehicle_id": car["id"], "media_id": media["id"]})).json()
    ollama.answers["vehicle_receipt"] = {
        "expenses": [{"name": "Tankning Circle K", "amount": 812.5, "expense_date": "2026-10-20", "category": "fuel", "mileage_at": 50420, "volume": 42.3, "volume_unit": "l"}]
    }
    assert await ai.tick(db_session, datetime.now(timezone.utc)) == 1
    done = (await client.get(f"/api/ai/jobs/{job['id']}")).json()
    assert done["status"] == "done" and done["result"]["expenses"][0]["amount"] == 812.5
    # Read in two steps from the photo – which stays, as the receipt.
    assert ollama.calls[0]["images"] == 1
    import uuid

    from app.models import MediaItem
    from app.services.storage import get_storage

    row = await db_session.get(MediaItem, uuid.UUID(media["id"]))
    assert get_storage().open(row.family_id, row.storage_key).exists()

    line = {**done["result"]["expenses"][0], "vehicle_id": car["id"]}
    rows = (await client.post(f"/api/ai/jobs/{job['id']}/apply/vehicle", json={"vehicle_id": car["id"], "expenses": [line]})).json()
    assert rows[0]["receipt_media_id"] == media["id"] and rows[0]["volume"] == 42.3
    assert (await client.get("/api/vehicles")).json()[0]["mileage"] == 50420
    assert (await client.get(f"/api/ai/jobs/{job['id']}")).json()["status"] == "applied"

    # Pasted text (a service history) works too.
    text = (await client.post("/api/ai/jobs", json={"kind": "vehicle_receipt", "vehicle_id": car["id"], "text": "2025-05-02 Service 1 balans 4 200 kr mätarställning 4 800 mil"})).json()
    assert text["status"] == "queued"


async def test_every_kind_of_vehicle(client):
    await _setup(client)
    # A mower counts engine hours and has no registration.
    mower = (await client.post("/api/vehicles", json={"name": "Husqvarna", "kind": "mower", "meter": "hours", "mileage": 120})).json()
    assert (mower["kind"], mower["meter"], mower["registration"]) == ("mower", "hours", "")
    service = (await client.post("/api/vehicles/reminders", json={"vehicle_id": mower["id"], "kind": "service", "due_mileage": 128, "repeat_km": 100})).json()
    # Within 10 hours is "soon" (for km it would be 1 000 km).
    assert service["status"] == "soon" and service["km_left"] == 8
    bike = (await client.post("/api/vehicles", json={"name": "Bike", "kind": "bicycle", "meter": "none"})).json()
    later = str(date.today() + timedelta(days=200))
    by_meter = (await client.post("/api/vehicles/reminders", json={"vehicle_id": bike["id"], "kind": "service", "due_mileage": 500, "due_date": later})).json()
    assert by_meter["status"] == "ok" and by_meter["km_left"] is None
    assert (await client.post("/api/vehicles", json={"name": "X", "kind": "spaceship"})).status_code == 422


async def test_tyres_and_the_tyre_change(client):
    car = await _setup(client)
    today = date.today()
    summer = (await client.post(f"/api/vehicles/{car['id']}/tyres", json={"name": "Michelin", "season": "summer", "size": "205/55 R16", "tread_mm": 5.5})).json()
    winter = (await client.post(f"/api/vehicles/{car['id']}/tyres", json={"name": "Nokian", "season": "winter", "storage": "Garage"})).json()
    due = today + timedelta(days=5)
    change = (await client.post("/api/vehicles/reminders", json={"vehicle_id": car["id"], "kind": "tyres", "title": "Winter tyres", "due_date": str(due), "repeat_months": 12})).json()

    await client.post(f"/api/vehicles/tyres/{summer['id']}/mount", json={})
    sets = (await client.post(f"/api/vehicles/tyres/{winter['id']}/mount", json={"mileage": 50500, "storage": "Tyre hotel"})).json()
    on = {t["season"]: t for t in sets}
    assert on["winter"]["mounted"] and not on["summer"]["mounted"] and on["summer"]["storage"] == "Tyre hotel"
    # The tyre change counts as done: the same time next year (seasonal), and the odometer noted.
    from app.routers.vehicles import add_months

    nxt = next(r for r in (await client.get("/api/vehicles/reminders")).json() if r["id"] == change["id"])
    assert nxt["due_date"] == str(add_months(due, 12)) and nxt["last_done"] == str(today)
    assert (await client.get("/api/vehicles/overview")).json()[0]["tyres_on"] == "winter"
    assert (await client.get("/api/vehicles")).json()[0]["mileage"] == 50500


async def test_home_charging_at_the_spot_price(client, monkeypatch):
    from app.services import electricity

    await _setup(client)
    ev = (await client.post("/api/vehicles", json={"name": "Kia", "registration": "EV1", "fuel": "electric", "charge_extra": 0.5})).json()

    async def prices(area, when):
        return [{"start": None, "ore": 80.0}, {"start": None, "ore": 120.0}] if area == "SE3" else None

    monkeypatch.setattr(electricity, "prices", prices)
    charge = {"vehicle_id": ev["id"], "name": "Home", "expense_date": str(date.today()), "category": "charging", "charge_place": "home", "volume": 20, "volume_unit": "kWh"}
    # Without an electricity area there is no price to go by.
    assert (await client.post("/api/vehicles/expenses", json=charge)).status_code == 422
    assert (await client.put("/api/dashboard/sources/electricity", json={"area": "SE3"})).status_code == 200
    # 1.00 kr/kWh spot × 1.25 VAT + 0.50 extra = 1.75 kr/kWh × 20 kWh.
    assert (await client.post("/api/vehicles/expenses", json=charge)).json()["amount"] == 35.0
    fixed = (await client.patch(f"/api/vehicles/{ev['id']}", json={"name": "Kia", "registration": "EV1", "fuel": "electric", "charge_price_mode": "fixed", "charge_fixed_price": 1.2})).json()
    assert fixed["charge_price_mode"] == "fixed"
    assert (await client.post("/api/vehicles/expenses", json=charge)).json()["amount"] == 24.0
    # Public charging: the amount from the receipt.
    assert (await client.post("/api/vehicles/expenses", json={**charge, "charge_place": "public"})).status_code == 422


async def test_documents_and_the_meter_from_home_assistant(client, db_session, monkeypatch):
    import uuid

    from app.models import SmarthomeConnection
    from app.routers import vehicles
    from app.services.crypto import encrypt_token

    car = await _setup(client)
    doc = (await client.post("/api/documents", json={"kind": "insurance", "title": "Insurance letter"})).json()
    linked = (await client.put(f"/api/vehicles/{car['id']}/documents/{doc['id']}")).json()
    assert [d["title"] for d in linked] == ["Insurance letter"]
    assert (await client.delete(f"/api/vehicles/{car['id']}/documents/{doc['id']}")).json() == []

    me = (await client.get("/api/auth/me")).json()
    db_session.add(SmarthomeConnection(family_id=uuid.UUID(me["family_id"]), provider="home_assistant", base_url="http://ha.local:8123", token_encrypted=encrypt_token("x")))
    await db_session.commit()
    read = []

    async def get_state(base_url, token, entity_id):
        read.append(entity_id)
        return {"state": "31337.4", "attributes": {"unit_of_measurement": "mi"}}

    monkeypatch.setattr(vehicles.ha, "get_state", get_state)
    body = {"name": "Volvo", "registration": "ABC123", "mileage": 50000}
    assert (await client.patch(f"/api/vehicles/{car['id']}", json={**body, "ha_meter_entity": "Not valid"})).status_code == 422
    await client.patch(f"/api/vehicles/{car['id']}", json={**body, "ha_meter_entity": "sensor.volvo_odometer"})
    now = (await client.post(f"/api/vehicles/{car['id']}/meter/read")).json()
    # Miles to km.
    assert now["mileage"] == 50433 and read == ["sensor.volvo_odometer"]
    assert vehicles.meter_value({"state": "90", "attributes": {"unit_of_measurement": "min"}}, "hours") == 2
    assert vehicles.meter_value({"state": "unavailable"}, "km") is None
    # The worker every half hour; the same value again adds nothing.
    half_past = datetime.now(timezone.utc).replace(minute=30)
    assert await vehicles.run_vehicle_meters(db_session, half_past) == 0
    assert len([r for r in (await client.get(f"/api/vehicles/{car['id']}/mileage")).json() if not r["from_expense"]]) == 1


async def test_service_history_as_a_pdf(client, ollama):  # noqa: F811
    from app.routers.ai import pdf_text

    car = await _setup(client)
    await _configure(client)
    pdf = _pdf("Service 2025-05-02 4 200 kr 4 800 mil Oljebyte")
    assert "Oljebyte" in pdf_text(pdf)
    job = (await client.post(f"/api/ai/jobs/vehicle-pdf?vehicle_id={car['id']}", files={"file": ("history.pdf", pdf, "application/pdf")})).json()
    assert job["kind"] == "vehicle_receipt" and "Oljebyte" in job["input"]["text"]
    bad = await client.post(f"/api/ai/jobs/vehicle-pdf?vehicle_id={car['id']}", files={"file": ("x.pdf", b"not a pdf", "application/pdf")})
    assert bad.status_code == 415


def _pdf(text: str) -> bytes:
    """A one-page PDF with a line of text (enough for pypdf to read back)."""
    stream = f"BT /F1 12 Tf 40 700 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n0000000000 65535 f \n"
    out += b"".join(str(o).zfill(10).encode() + b" 00000 n \n" for o in offsets)
    out += b"trailer\n<< /Size " + str(len(objects) + 1).encode() + b" /Root 1 0 R >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF\n"
    return out
