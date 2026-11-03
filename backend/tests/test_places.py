"""3.4.0: address suggestions from OpenStreetMap (Photon), asked by the server."""
import pytest

pytestmark = pytest.mark.asyncio

PHOTON = {
    "features": [
        {"geometry": {"coordinates": [18.0686, 59.3293]}, "properties": {"name": "Storgatan 1", "street": "Storgatan", "housenumber": "1", "postcode": "114 51", "city": "Stockholm", "country": "Sverige"}},
        {"geometry": {"coordinates": [18.07, 59.33]}, "properties": {"name": "Storgatan 1", "street": "Storgatan", "housenumber": "1", "postcode": "114 51", "city": "Stockholm", "country": "Sverige"}},
        {"geometry": {"coordinates": [18.1, 59.3]}, "properties": {"name": "Fotografiska", "street": "Stadsgårdshamnen", "housenumber": "22", "city": "Stockholm", "state": "Stockholms län", "country": "Sverige"}},
    ]
}


class FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return PHOTON


async def test_suggestions_through_the_server(client, monkeypatch):
    from app.services import places

    asked = []

    class FakeClient:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

        async def get(self, url, params=None):
            asked.append((url, params))
            return FakeResponse()

    monkeypatch.setattr(places.httpx, "AsyncClient", FakeClient)
    places._cache.clear()
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})

    found = (await client.get("/api/places?q=Storgatan 1")).json()
    assert [f["label"] for f in found] == ["Storgatan 1, 114 51 Stockholm", "Fotografiska, Stadsgårdshamnen 22, Stockholm"]  # the same address once
    assert found[0]["lat"] == 59.3293 and found[1]["detail"] == "Stockholms län, Sverige"
    assert asked[0][0] == "https://photon.komoot.io/api" and "lang" not in asked[0][1]  # Swedish: Photon's local names
    await client.get("/api/places?q=Storgatan 1")
    assert len(asked) == 1  # answered from the cache
    assert (await client.get("/api/places?q=ab")).json() == []

    # The server admin points it at an own Photon, or turns it off.
    out = (await client.put("/api/admin/integrations/places", json={"enabled": True, "url": "https://photon.example.se/"})).json()
    assert out["url"] == "https://photon.example.se"
    await client.get("/api/places?q=Kungsgatan")
    assert asked[-1][0] == "https://photon.example.se/api"
    await client.put("/api/admin/integrations/places", json={"enabled": False})
    assert (await client.get("/api/places/status")).json() == {"enabled": False}
    assert (await client.get("/api/places?q=Kungsgatan")).status_code == 503
