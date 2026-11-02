"""Phase L tests (on the phase Q conversation API): chat authorization, unread counts,
family visibility, pagination."""

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Chat Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201

    bob = await client.post(
        "/api/family/members",
        json={
            "display_name": "Bob",
            "username": "bob",
            "password": "1234",
            "role": "adult",
        },
    )
    assert bob.status_code == 201

    carol = await client.post(
        "/api/family/members",
        json={
            "display_name": "Carol",
            "username": "carol",
            "password": "1234",
            "role": "adult",
        },
    )
    assert carol.status_code == 201

    return bob.json(), carol.json()


async def _login(client, username: str, password: str):
    await client.post("/api/auth/logout")
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200


async def _dm(client, peer_id: str) -> str:
    """Create a two-person conversation with the logged-in user and return its id."""
    resp = await client.post("/api/chat/conversations", json={"member_ids": [peer_id]})
    assert resp.status_code == 201, resp.text
    return resp.json()["peer_key"]


async def test_third_member_cannot_read_foreign_dm_cursor(client):
    bob, _ = await _setup(client)
    dm = await _dm(client, bob["id"])

    created = await client.post("/api/chat/messages", json={"peer": dm, "body": "Hey Bob, private DM"})
    assert created.status_code == 201
    dm_message_id = created.json()["id"]

    # Carol is not a member: the conversation must not even appear to exist.
    await _login(client, "carol", "1234")
    assert (await client.get(f"/api/chat/messages?peer={dm}")).status_code == 404
    forbidden = await client.get(f"/api/chat/messages?peer={dm}&before={dm_message_id}")
    assert forbidden.status_code == 404
    assert (await client.post("/api/chat/messages", json={"peer": dm, "body": "sneaky"})).status_code == 404


async def test_unread_math_and_mark_read(client):
    bob, _ = await _setup(client)
    dm = await _dm(client, bob["id"])

    await client.post("/api/chat/messages", json={"peer": dm, "body": "DM one"})
    await client.post("/api/chat/messages", json={"peer": dm, "body": "DM two"})
    await client.post("/api/chat/messages", json={"peer": "family", "body": "Family ping"})

    await _login(client, "bob", "1234")

    def find(convs):
        family = next(c for c in convs if c["conversation_name"] == "Family")
        admin_dm = next(c for c in convs if c["peer_key"] == dm)
        return family, admin_dm

    family, admin_dm = find((await client.get("/api/chat/conversations")).json())
    assert admin_dm["peer_type"] == "dm" and admin_dm["peer_name"] == "Admin"
    assert family["unread_count"] == 1
    assert admin_dm["unread_count"] == 2

    assert (await client.post("/api/chat/read", json={"peer": dm})).status_code == 200
    family2, admin_dm2 = find((await client.get("/api/chat/conversations")).json())
    assert family2["unread_count"] == 1
    assert admin_dm2["unread_count"] == 0

    assert (await client.post("/api/chat/read", json={"peer": family["peer_key"]})).status_code == 200
    family3, _ = find((await client.get("/api/chat/conversations")).json())
    assert family3["unread_count"] == 0


async def test_family_channel_visible_to_all(client):
    _, _ = await _setup(client)

    posted = await client.post("/api/chat/messages", json={"peer": "family", "body": "Hello whole family"})
    assert posted.status_code == 201

    await _login(client, "bob", "1234")
    bob_messages = (await client.get("/api/chat/messages?peer=family")).json()["items"]
    assert any(m["body"] == "Hello whole family" for m in bob_messages)

    await _login(client, "carol", "1234")
    carol_messages = (await client.get("/api/chat/messages?peer=family")).json()["items"]
    assert any(m["body"] == "Hello whole family" for m in carol_messages)


async def test_pagination_cursor(client):
    bob, _ = await _setup(client)

    # Create one DM to also prove family paging stays scoped.
    dm = await _dm(client, bob["id"])
    assert (await client.post("/api/chat/messages", json={"peer": dm, "body": "Scoped DM"})).status_code == 201

    for i in range(35):
        resp = await client.post("/api/chat/messages", json={"peer": "family", "body": f"family-{i:02d}"})
        assert resp.status_code == 201

    page1 = await client.get("/api/chat/messages?peer=family")
    assert page1.status_code == 200
    payload1 = page1.json()
    assert len(payload1["items"]) == 30
    assert payload1["next_before"]

    page2 = await client.get(f"/api/chat/messages?peer=family&before={payload1['next_before']}")
    assert page2.status_code == 200
    payload2 = page2.json()
    assert len(payload2["items"]) == 5

    ids1 = {m["id"] for m in payload1["items"]}
    ids2 = {m["id"] for m in payload2["items"]}
    assert ids1.isdisjoint(ids2)
