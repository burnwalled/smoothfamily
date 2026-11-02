"""Reports of problems and wishes go to the server admin (3.1.0): kept on the server with their
screenshot, a status the reporter is told about, and an anonymous export to the public repository."""
import base64
from urllib.parse import parse_qs, urlparse

import pytest

pytestmark = pytest.mark.asyncio

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n fake").decode()


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Svensson", "display_name": "Anna Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    kid = (await client.post("/api/family/members", json={"display_name": "Kim", "username": "kim", "password": "pass1234", "role": "child"})).json()
    return resp.json(), kid


async def _login(client, username, password):
    client.cookies.clear()
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_a_report_goes_to_the_server_admin(client):
    await _setup(client)
    assert (await client.get("/api/feedback/status")).json() == {"enabled": True}
    await _login(client, "kim", "pass1234")
    report = (await client.post("/api/feedback", json={
        "type": "bug", "title": "The button is stuck", "description": "I tap Done and nothing happens",
        "page": "/tasks", "user_agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
        "viewport": "412×915", "screenshot": PNG,
    })).json()
    assert report["status"] == "new" and report["issue_number"] == 1 and report["has_screenshot"] is True
    second = (await client.post("/api/feedback", json={"type": "idea", "title": "Dark kiosk", "description": "Please"})).json()
    assert second["issue_number"] == 2
    # The reporter sees their own, and their screenshot.
    assert [r["title"] for r in (await client.get("/api/feedback")).json()] == ["Dark kiosk", "The button is stuck"]
    assert (await client.get(f"/api/feedback/{report['id']}/screenshot")).status_code == 200
    # Not a server admin: nothing of the server's.
    assert (await client.get("/api/feedback/all")).status_code == 403

    # The server admin is told of each.
    await _login(client, "admin", "secret123")
    told = [n["title"] for n in (await client.get("/api/notifications")).json() if n["kind"] == "feedback"]
    assert sorted(told) == ["New report: Dark kiosk", "New report: The button is stuck"]
    every = {r["title"]: r for r in (await client.get("/api/feedback/all")).json()}
    stuck = every["The button is stuck"]
    assert stuck["family_name"] == "Svensson" and stuck["reporter_role"] == "child" and stuck["browser"] == "Chrome on Android"


async def test_the_reporter_is_told_when_the_status_changes(client):
    await _setup(client)
    await _login(client, "kim", "pass1234")
    report = (await client.post("/api/feedback", json={"type": "idea", "title": "Bigger buttons", "description": "On the kitchen display"})).json()
    await _login(client, "admin", "secret123")
    changed = (await client.patch(f"/api/feedback/{report['id']}", json={"status": "planned", "admin_note": "In the next version"})).json()
    assert changed["status"] == "planned" and changed["admin_note"] == "In the next version"
    assert (await client.patch(f"/api/feedback/{report['id']}", json={"status": "maybe"})).status_code == 422

    await _login(client, "kim", "pass1234")
    mine = (await client.get("/api/feedback")).json()[0]
    assert mine["status"] == "planned" and mine["admin_note"] == "In the next version"
    titles = [n["title"] for n in (await client.get("/api/notifications")).json()]
    assert "Planned: Bigger buttons" in titles


async def test_the_export_is_anonymous_and_fills_in_the_public_form(client):
    await _setup(client)
    await _login(client, "kim", "pass1234")
    one = (await client.post("/api/feedback", json={"type": "bug", "title": "Kim's list is gone", "description": "Kim Svensson lost the list", "page": "/lists", "screenshot": PNG})).json()
    two = (await client.post("/api/feedback", json={"type": "idea", "title": "Weekly menu", "description": "On the kitchen display"})).json()
    await _login(client, "admin", "secret123")
    out = (await client.post("/api/feedback/export", json={"ids": [one["id"], two["id"]]})).json()
    assert out["title"] == "2 reports from a Smooth Family server" and out["body_in_url"] is True
    # The family's name and the reporter's never go along on their own (only if written in the report).
    assert "Svensson" not in out["body"].replace("Kim Svensson lost the list", "") and "Anna" not in out["body"]
    assert "### 1. [Bug] Kim's list is gone" in out["body"] and "A screenshot is kept on the server" in out["body"]
    url = urlparse(out["url"])
    assert url.netloc == "github.com" and url.path == "/burnwalled/smoothfamily/issues/new"
    query = parse_qs(url.query)
    assert query["template"] == ["server-admin-report.yml"] and query["reports"] == [out["body"]]
    assert all(r["exported_at"] for r in (await client.get("/api/feedback/all")).json())

    # A long text is pasted by hand: the address keeps only the title.
    long = (await client.post("/api/feedback", json={"type": "idea", "title": "Long", "description": "x" * 4900})).json()
    longer = (await client.post("/api/feedback", json={"type": "idea", "title": "Longer", "description": "y" * 4900})).json()
    out = (await client.post("/api/feedback/export", json={"ids": [long["id"], longer["id"]]})).json()
    assert out["body_in_url"] is False and "reports" not in parse_qs(urlparse(out["url"]).query)

    assert (await client.delete(f"/api/feedback/{one['id']}")).status_code == 204
    assert len((await client.get("/api/feedback/all")).json()) == 3
