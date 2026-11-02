import pytest

pytestmark = pytest.mark.asyncio


async def _setup_family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Event Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201
    child = await client.post(
        "/api/family/members",
        json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"},
    )
    assert child.status_code == 201
    return child.json()["id"]


async def _login(client, username, password):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_family_event_crud_and_listing(client):
    await _setup_family(client)

    created = await client.post(
        "/api/calendar/family-events",
        json={
            "title": "Kalas hos mormor",
            "start": "2026-11-07T14:00:00+01:00",
            "end": "2026-11-07T17:00:00+01:00",
            "location": "Åkersberga",
        },
    )
    assert created.status_code == 201
    event_id = created.json()["id"]

    listed = await client.get("/api/calendar/events?start=2026-11-02&end=2026-11-09")
    assert listed.status_code == 200
    events = listed.json()
    assert len(events) == 1
    assert events[0]["event_id"] == event_id
    assert events[0]["feed_id"] is None
    assert events[0]["title"] == "Kalas hos mormor"
    assert events[0]["location"] == "Åkersberga"
    assert events[0]["feed_name"] == "Event Family"

    # Outside the range: not listed.
    assert (await client.get("/api/calendar/events?start=2026-11-09&end=2026-11-15")).json() == []

    updated = await client.put(
        f"/api/calendar/family-events/{event_id}",
        json={"title": "Kalas", "start": "2026-11-08T00:00:00Z", "end": "2026-11-08T00:00:00Z", "all_day": True},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["all_day"] is True
    assert body["location"] is None
    # An all-day event is at least one whole day long (exclusive end).
    assert body["end"].startswith("2026-11-09")

    assert (await client.delete(f"/api/calendar/family-events/{event_id}")).status_code == 204
    assert (await client.get("/api/calendar/events?start=2026-11-02&end=2026-11-09")).json() == []


async def test_family_event_rejects_end_before_start(client):
    await _setup_family(client)
    resp = await client.post(
        "/api/calendar/family-events",
        json={"title": "Oops", "start": "2026-11-07T14:00:00Z", "end": "2026-11-07T13:00:00Z"},
    )
    assert resp.status_code == 422


async def test_child_can_add_but_not_edit_others_events(client):
    await _setup_family(client)
    admin_event = (
        await client.post(
            "/api/calendar/family-events",
            json={"title": "Föräldramöte", "start": "2026-11-10T18:00:00Z", "end": "2026-11-10T19:00:00Z"},
        )
    ).json()

    await _login(client, "kid", "1234")
    # The whole family sees app events.
    seen = (await client.get("/api/calendar/events?start=2026-11-09&end=2026-11-11")).json()
    assert [e["title"] for e in seen] == ["Föräldramöte"]

    own = await client.post(
        "/api/calendar/family-events",
        json={"title": "Fotboll", "start": "2026-11-11T17:00:00Z", "end": "2026-11-11T18:00:00Z"},
    )
    assert own.status_code == 201
    assert (await client.delete(f"/api/calendar/family-events/{own.json()['id']}")).status_code == 204

    forbidden = await client.put(
        f"/api/calendar/family-events/{admin_event['id']}",
        json={"title": "Hacked", "start": "2026-11-10T18:00:00Z", "end": "2026-11-10T19:00:00Z"},
    )
    assert forbidden.status_code == 403
    assert (await client.delete(f"/api/calendar/family-events/{admin_event['id']}")).status_code == 403


async def test_family_event_in_ical_export(client):
    from datetime import date, timedelta

    await _setup_family(client)
    day = date.today() + timedelta(days=3)
    await client.post(
        "/api/calendar/family-events",
        json={"title": "Tandläkare", "start": f"{day}T09:00:00Z", "end": f"{day}T10:00:00Z"},
    )
    token = (await client.get("/api/calendar/ical/token")).json()["token"]
    ics = await client.get(f"/api/calendar/ical/{token}.ics")
    assert ics.status_code == 200
    assert "SUMMARY:Tandläkare" in ics.text


async def test_task_edit_can_clear_assignee_so_anyone_can_complete(client):
    child_id = await _setup_family(client)
    task = await client.post(
        "/api/tasks",
        json={"title": "Dammsuga", "points": 10, "recurrence": "daily", "assignee_id": child_id},
    )
    task_id = task.json()["id"]

    # Assigned to the child: the admin cannot complete it.
    assert (await client.post(f"/api/tasks/{task_id}/complete")).status_code == 403

    edited = await client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "Dammsuga vardagsrum", "points": 15, "assignee_id": None, "recurrence": "weekly", "weekday": 2},
    )
    assert edited.status_code == 200
    body = edited.json()
    assert body["assignee_id"] is None
    assert body["title"] == "Dammsuga vardagsrum"
    assert body["points"] == 15
    assert body["weekday"] == 2


async def test_task_edit_rejects_foreign_assignee(client):
    await _setup_family(client)
    task_id = (await client.post("/api/tasks", json={"title": "Diska", "recurrence": "daily"})).json()["id"]
    resp = await client.patch(
        f"/api/tasks/{task_id}", json={"assignee_id": "00000000-0000-0000-0000-000000000001"}
    )
    assert resp.status_code == 422


async def test_family_event_member_tags(client):
    child_id = await _setup_family(client)
    me = (await client.get("/api/auth/me")).json()["id"]

    everyone = await client.post(
        "/api/calendar/family-events",
        json={"title": "Middag", "start": "2026-11-12T17:00:00Z", "end": "2026-11-12T18:00:00Z"},
    )
    assert everyone.json()["member_ids"] == []

    tagged = await client.post(
        "/api/calendar/family-events",
        json={
            "title": "Tandläkare",
            "start": "2026-11-13T09:00:00Z",
            "end": "2026-11-13T10:00:00Z",
            "member_ids": [child_id, me, child_id],
        },
    )
    assert tagged.status_code == 201
    assert tagged.json()["member_ids"] == [child_id, me]

    listed = (await client.get("/api/calendar/events?start=2026-11-13&end=2026-11-14")).json()
    assert listed[0]["member_ids"] == [child_id, me]

    foreign = await client.put(
        f"/api/calendar/family-events/{tagged.json()['id']}",
        json={
            "title": "Tandläkare",
            "start": "2026-11-13T09:00:00Z",
            "end": "2026-11-13T10:00:00Z",
            "member_ids": ["00000000-0000-0000-0000-000000000001"],
        },
    )
    assert foreign.status_code == 422


async def test_range_end_is_exclusive_like_feeds(client):
    await _setup_family(client)
    await client.post(
        "/api/calendar/family-events",
        json={"title": "Imorgon", "start": "2026-11-21T00:00:00Z", "end": "2026-11-21T00:00:00Z", "all_day": True},
    )
    await client.post(
        "/api/calendar/family-events",
        json={"title": "Idag", "start": "2026-11-20T15:00:00Z", "end": "2026-11-20T16:00:00Z"},
    )
    today_only = (await client.get("/api/calendar/events?start=2026-11-20&end=2026-11-21")).json()
    assert [e["title"] for e in today_only] == ["Idag"]
    tomorrow = (await client.get("/api/calendar/events?start=2026-11-21&end=2026-11-22")).json()
    assert [e["title"] for e in tomorrow] == ["Imorgon"]
    # The all-day event ends (exclusively) at midnight on the 22nd: not part of that day.
    assert (await client.get("/api/calendar/events?start=2026-11-22&end=2026-11-23")).json() == []
