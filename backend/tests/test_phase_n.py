"""Phase N tests: property domain and exports."""

import io
import json
import zipfile

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Property Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201


async def test_property_summary_and_task_project_link(client):
    await _setup(client)

    prop = await client.post(
        "/api/property/properties",
        json={"name": "Main House", "kind": "primary", "address": None, "notes": None},
    )
    assert prop.status_code == 201
    property_id = prop.json()["id"]

    project = await client.post(
        "/api/property/projects",
        json={
            "property_id": property_id,
            "name": "Kitchen refresh",
            "status": "planned",
            "budget": 12000,
            "started_at": None,
            "finished_at": None,
        },
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    expense = await client.post(
        "/api/property/expenses",
        json={
            "property_id": property_id,
            "project_id": project_id,
            "name": "Cabinets",
            "amount": 3500,
            "expense_date": "2026-06-10",
            "category": "renovation",
            "receipt_media_id": None,
        },
    )
    assert expense.status_code == 201

    recurring = await client.post(
        "/api/property/recurring-costs",
        json={
            "property_id": property_id,
            "kind": "Insurance",
            "amount": 1200,
            "period": "yearly",
            "note": None,
        },
    )
    assert recurring.status_code == 201

    task = await client.post(
        "/api/tasks",
        json={
            "title": "Inspect roof",
            "points": 30,
            "recurrence": "none",
            "due_date": "2026-06-20",
            "property_id": property_id,
            "project_id": project_id,
        },
    )
    assert task.status_code == 201
    assert task.json()["property_id"] == property_id
    assert task.json()["project_id"] == project_id

    summary = await client.get(f"/api/property/summary?property_id={property_id}")
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_expenses"] == 3500
    assert body["project_budget_total"] == 12000
    assert body["recurring_monthly_estimate"] == 100
    assert body["open_projects"] == 1


async def test_property_export_contains_json_and_csv(client):
    await _setup(client)

    prop = await client.post(
        "/api/property/properties",
        json={"name": "Cabin", "kind": "cabin", "address": None, "notes": None},
    )
    assert prop.status_code == 201
    property_id = prop.json()["id"]

    expense = await client.post(
        "/api/property/expenses",
        json={
            "property_id": property_id,
            "project_id": None,
            "name": "Paint",
            "amount": 899,
            "expense_date": "2026-06-11",
            "category": "maintenance",
            "receipt_media_id": None,
        },
    )
    assert expense.status_code == 201

    export = await client.get(f"/api/property/export?property_id={property_id}")
    assert export.status_code == 200

    zf = zipfile.ZipFile(io.BytesIO(export.content))
    names = set(zf.namelist())
    assert "property/data.json" in names
    assert "property/expenses.csv" in names

    payload = json.loads(zf.read("property/data.json"))
    assert len(payload["properties"]) == 1
    assert len(payload["expenses"]) == 1


async def test_property_expense_keeps_swedish_characters(client):
    await _setup(client)
    prop = await client.post(
        "/api/property/properties",
        json={"name": "Gräsö", "kind": "cabin", "address": "Östra vägen 1", "notes": None},
    )
    property_id = prop.json()["id"]
    name = "Färg & lösningsmedel till förrådet"

    created = await client.post(
        "/api/property/expenses",
        json={
            "property_id": property_id,
            "project_id": None,
            "name": name,
            "amount": 249,
            "expense_date": "2026-10-24",
            "category": "maintenance",
            "receipt_media_id": None,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["name"] == name

    listed = await client.get(f"/api/property/expenses?property_id={property_id}")
    assert [row["name"] for row in listed.json()] == [name]

    export = await client.get(f"/api/property/export?property_id={property_id}")
    zf = zipfile.ZipFile(io.BytesIO(export.content))
    raw = zf.read("property/expenses.csv")
    assert raw.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM for Excel
    assert name in raw.decode("utf-8-sig")
    assert json.loads(zf.read("property/data.json"))["properties"][0]["name"] == "Gräsö"
