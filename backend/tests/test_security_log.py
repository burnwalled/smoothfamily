"""The security log (3.4.1): what's noted, who's told, and the day's summary."""

from datetime import datetime, timedelta, timezone

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.models import Notification, SecurityEvent, User
from app.services import security_log


async def _family(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    for name, role in [("eva", "adult"), ("maja", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


def _other():
    from app.main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _events(client):
    return (await client.get("/api/server/security")).json()


async def _told(db, username: str, kind: str = "security") -> list[tuple[str, str]]:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one()
    rows = (await db.execute(select(Notification).where(Notification.user_id == user.id, Notification.kind == kind).order_by(Notification.created_at))).scalars().all()
    return [(n.title, n.body) for n in rows]


async def test_failed_sign_ins_and_the_brake_are_noted_and_the_admin_told(client, db_session):
    await _family(client)
    for _ in range(3):
        await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})
    await client.post("/api/auth/login", json={"username": "nobody-here", "password": "wrong"})
    view = await _events(client)
    assert view["day"]["login_failed"] == 4, [(e["kind"], e["username"], e["detail"]) for e in view["events"]]
    noted = [(e["kind"], e["username"], e["name"]) for e in view["events"]]
    assert ("login_failed", "eva", "Eva") in noted and ("login_failed", "nobody-here", None) in noted
    assert all(e["ip"] for e in view["events"])

    # The brake: eight wrong tries, then the ninth is stopped – and the server's admin told once.
    for _ in range(5):
        await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})
    assert (await client.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 429
    assert (await client.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 429
    view = await _events(client)
    assert view["day"]["throttled"] == 2
    told = await _told(db_session, "admin")
    assert len(told) == 1 and told[0][0] == "Inloggningsbromsen" and "(eva)" in told[0][1]


async def test_a_members_new_device_and_changed_password_are_told(client, db_session):
    ids = await _family(client)
    eva = _other()
    assert (await eva.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200
    # The first device ever is just noted; the second one is told.
    assert (await eva.post("/api/devices/hello", json={}, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0"})).status_code == 204
    assert await _told(db_session, "eva") == []
    again = _other()
    assert (await again.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200
    assert (await again.post("/api/devices/hello", json={}, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1"})).status_code == 204
    told = await _told(db_session, "eva")
    assert len(told) == 1 and told[0][0] == "Ny enhet inloggad"
    assert (await _events(client))["day"]["new_device"] == 2

    assert (await eva.post("/api/auth/me/password", json={"current_password": "pass1234", "new_password": "fresh-pass-1"})).status_code == 204
    assert [t for t, _ in await _told(db_session, "eva")][-1] == "Ditt lösenord byttes"
    # The admin's reset is noted with their name, and told to nobody.
    assert (await client.post(f"/api/family/members/{ids['eva']}/password", json={"password": "set-by-admin-1"})).status_code == 204
    kinds = [(e["kind"], e["detail"]) for e in (await _events(client))["events"]]
    assert ("password_changed", "") in kinds and ("password_reset", "Anna") in kinds
    assert len(await _told(db_session, "eva")) == 2


async def test_links_that_do_not_exist_are_noted(client):
    await _family(client)
    assert (await client.get("/api/guest/not-a-token")).status_code == 404
    assert (await client.get("/api/party/not-a-token")).status_code == 404
    details = sorted(e["detail"] for e in (await _events(client))["events"] if e["kind"] == "link_invalid")
    assert details == ["guest", "party"]


async def test_the_days_summary_comes_once_when_there_was_something(client, db_session):
    await _family(client)
    # "Now" a minute ago, so that what happens below is after it; after 07:00 so the summary may run.
    morning = datetime.now(timezone.utc) - timedelta(minutes=1)
    if morning.hour < 7:
        morning = morning.replace(hour=7, minute=0)
    # Nothing happened: no summary, and the day is still used up.
    assert await security_log.run_security_summary(db_session, morning) == 0
    assert await security_log.run_security_summary(db_session, morning + timedelta(hours=1)) == 0
    await client.post("/api/auth/login", json={"username": "eva", "password": "wrong"})
    assert (await client.get("/api/guest/nope")).status_code == 404
    tomorrow = morning + timedelta(days=1)
    assert await security_log.run_security_summary(db_session, tomorrow.replace(hour=6, minute=30)) == 0  # not before 07:00
    assert await security_log.run_security_summary(db_session, tomorrow) == 1
    assert await security_log.run_security_summary(db_session, tomorrow + timedelta(hours=2)) == 0
    told = await _told(db_session, "admin")
    assert told[-1] == ("Säkerhet, senaste dygnet", "1 misslyckade inloggningar, 1 försök med länkar som inte finns")

    # Only the server's admin reads the log; old entries go after 30 days.
    other = _other()
    assert (await other.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200
    assert (await other.get("/api/server/security")).status_code == 403
    for row in (await db_session.execute(select(SecurityEvent))).scalars().all():
        row.created_at = morning - timedelta(days=40)
    await db_session.commit()
    await security_log.prune(db_session, tomorrow)
    assert (await db_session.execute(select(SecurityEvent))).scalars().all() == []
