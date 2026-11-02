"""2.9.0: the setup guides – the server's first, then the family's; each shown once."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_server_first_then_the_family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    assert (await client.get("/api/guide")).json() == {"pending": ["server", "family"]}

    # An adult who isn't the admin gets neither.
    await client.post("/api/family/members", json={"display_name": "Erik", "username": "erik", "password": "pass1234", "role": "adult"})
    await client.post("/api/auth/login", json={"username": "erik", "password": "pass1234"})
    assert (await client.get("/api/guide")).json() == {"pending": []}
    assert (await client.post("/api/guide/server/done")).status_code == 403
    assert (await client.post("/api/guide/family/done")).status_code == 403

    await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})
    assert (await client.post("/api/guide/server/done")).json() == {"pending": ["family"]}
    assert (await client.post("/api/guide/family/done")).json() == {"pending": []}
    # Done is done.
    assert (await client.post("/api/guide/family/done")).json() == {"pending": []}
    assert (await client.get("/api/guide")).json() == {"pending": []}
    assert (await client.post("/api/guide/other/done")).status_code == 422
