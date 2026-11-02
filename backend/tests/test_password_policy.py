"""2.9.0: adults' passwords are 12 characters unless the server admin chooses fewer."""
from app.services import security_policy

SETUP = {"family_name": "Tolvan", "display_name": "Ada", "username": "ada", "email": "ada@example.com"}


async def test_twelve_characters_by_default(client, monkeypatch):
    monkeypatch.setitem(security_policy.DEFAULTS, "password_min_adult", security_policy.ADULT_MIN)
    status = (await client.get("/api/auth/setup")).json()
    assert status["password_min"] == 12

    # The first admin too.
    short = await client.post("/api/auth/setup", json={**SETUP, "password": "elevenchars"})
    assert short.status_code == 422
    assert (await client.post("/api/auth/setup", json={**SETUP, "password": "twelve-chars"})).status_code == 201

    rules = (await client.get("/api/admin/security-policy")).json()
    assert rules["password_min_adult"] == 12 and rules["password_min_child"] == 4
    adult = {"display_name": "Bo", "username": "bo", "role": "adult"}
    assert (await client.post("/api/family/members", json={**adult, "password": "secret123"})).status_code == 422
    assert (await client.post("/api/family/members", json={**adult, "password": "a-long-secret"})).status_code == 201
    kid = {"display_name": "Kim", "username": "kim", "role": "child", "password": "1234"}
    assert (await client.post("/api/family/members", json=kid)).status_code == 201

    # The server admin may choose fewer.
    changed = await client.put("/api/admin/security-policy", json={**rules, "password_min_adult": 8})
    assert changed.json()["password_min_adult"] == 8
    assert (await client.get("/api/auth/setup")).json()["password_min"] == 8
    adult2 = {"display_name": "Cy", "username": "cy", "role": "adult", "password": "secret12"}
    assert (await client.post("/api/family/members", json=adult2)).status_code == 201
