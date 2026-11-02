"""Phase O tests: vehicles, yearly recurrence and exports."""

import io
import json
import zipfile
from datetime import date

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Vehicle Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201


async def test_yearly_due_window_in_today_tasks(client):
    await _setup(client)

    vehicle = await client.post(
        "/api/vehicles",
        json={
            "name": "Family Car",
            "registration": "ABC123",
            "make": "Volvo",
            "model": "V70",
            "year": 2018,
            "mileage": 85000,
            "notes": None,
        },
    )
    assert vehicle.status_code == 201
    vehicle_id = vehicle.json()["id"]

    today = date.today()

    due_today = await client.post(
        "/api/tasks",
        json={
            "title": "Vehicle annual inspection",
            "points": 25,
            "recurrence": "yearly",
            "month": today.month,
            "day_of_month": today.day,
            "vehicle_id": vehicle_id,
        },
    )
    assert due_today.status_code == 201

    not_today = await client.post(
        "/api/tasks",
        json={
            "title": "Vehicle insurance renew",
            "points": 20,
            "recurrence": "yearly",
            "month": 1 if today.month != 1 else 2,
            "day_of_month": 1,
            "vehicle_id": vehicle_id,
        },
    )
    assert not_today.status_code == 201

    rows = await client.get("/api/tasks/today")
    assert rows.status_code == 200
    titles = {row["task"]["title"] for row in rows.json()}
    assert "Vehicle annual inspection" in titles
    assert "Vehicle insurance renew" not in titles


async def test_export_zip(client):
    await _setup(client)

    vehicle = await client.post(
        "/api/vehicles",
        json={
            "name": "Family Car",
            "registration": "XYZ789",
            "make": None,
            "model": None,
            "year": None,
            "mileage": 120000,
            "notes": None,
        },
    )
    assert vehicle.status_code == 201
    vehicle_id = vehicle.json()["id"]

    expense = await client.post(
        "/api/vehicles/expenses",
        json={"vehicle_id": vehicle_id, "name": "Oil change", "amount": 1299, "expense_date": "2026-03-20", "category": "service", "mileage_at": 121000},
    )
    assert expense.status_code == 201

    export = await client.get(f"/api/vehicles/export?vehicle_id={vehicle_id}")
    assert export.status_code == 200

    zf = zipfile.ZipFile(io.BytesIO(export.content))
    names = set(zf.namelist())
    assert "vehicles/data.json" in names
    assert "vehicles/expenses.csv" in names
    data = json.loads(zf.read("vehicles/data.json"))
    assert data["mileage"] == [{"vehicle_id": vehicle_id, "date": "2026-03-20", "km": 121000}] and data["reminders"] == []
