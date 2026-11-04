"""3.4.0: departures from several providers – SL stays keyless and unchanged; the others' keys are
added by the server admin and kept encrypted."""
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.services import transit

pytestmark = pytest.mark.asyncio


class NoRedis:
    async def get(self, *_):
        return None

    async def set(self, *_, **__):
        return None


@pytest.fixture(autouse=True)
def no_redis(monkeypatch):
    monkeypatch.setattr(transit, "_get_redis", lambda: NoRedis())


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )


def soon(minutes: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def test_the_providers_answers_read_the_same_way():
    t = soon(5)
    local = t.astimezone(transit.ZoneInfo("Europe/Stockholm")).strftime("%Y-%m-%dT%H:%M:%S")
    tl = transit.parse_trafiklab_departures({"departures": [
        {"scheduled": local, "realtime": local, "canceled": False, "route": {"designation": "4", "transport_mode": "BUS", "direction": "Radiohuset"}},
        {"scheduled": local, "realtime": None, "canceled": True, "route": {"designation": "14", "transport_mode": "METRO", "direction": "Mörby"}},
    ]})
    assert tl[0]["line"] == "4" and tl[0]["destination"] == "Radiohuset" and tl[0]["expected"].endswith(("+01:00", "+02:00"))
    assert tl[1]["state"] == "CANCELLED" and tl[1]["transport_mode"] == "METRO"
    assert transit.parse_trafiklab_stops({"stop_groups": [{"id": "740000001", "name": "Stockholm Centralstation"}]}) == [{"id": "740000001", "name": "Stockholm Centralstation"}]

    en = transit.parse_entur_departures({"data": {"stopPlace": {"estimatedCalls": [
        {"aimedDepartureTime": "2026-11-03T12:00:00+01:00", "expectedDepartureTime": "2026-11-03T12:02:00+01:00", "cancellation": False,
         "destinationDisplay": {"frontText": "Majorstuen"}, "serviceJourney": {"line": {"publicCode": "1", "transportMode": "metro"}}}]}}})
    assert en == [{"line": "1", "destination": "Majorstuen", "transport_mode": "METRO", "scheduled": "2026-11-03T12:00:00+01:00", "expected": "2026-11-03T12:02:00+01:00", "state": "EXPECTED"}]
    assert transit.parse_entur_stops({"features": [{"properties": {"id": "NSR:StopPlace:58366", "label": "Jernbanetorget, Oslo"}}, {"properties": {"id": "KVE:x"}}]}) == [{"id": "NSR:StopPlace:58366", "name": "Jernbanetorget, Oslo"}]

    dt = transit.parse_digitransit_departures({"data": {"stop": {"stoptimesWithoutPatterns": [
        {"serviceDay": 1_793_000_000, "scheduledDeparture": 36000, "realtimeDeparture": 36120, "realtimeState": "UPDATED", "headsign": "Kamppi", "trip": {"route": {"shortName": "550", "mode": "BUS"}}}]}}})
    assert dt[0]["line"] == "550" and dt[0]["destination"] == "Kamppi"
    assert datetime.fromisoformat(dt[0]["expected"]) - datetime.fromisoformat(dt[0]["scheduled"]) == timedelta(minutes=2)
    assert transit.parse_digitransit_stops({"data": {"stops": [{"gtfsId": "HSL:1040129", "name": "Rautatientori", "code": "H2019"}]}}) == [{"id": "HSL:1040129", "name": "Rautatientori (H2019)"}]

    rp = transit.parse_hafas_departures({"Departure": [
        {"name": "Bus 5C", "direction": "Husum Torv", "date": "2026-11-03", "time": "12:00:00", "rtTime": "12:03:00", "ProductAtStop": {"displayNumber": "5C", "catOut": "Bus"}},
        {"name": "Re 1234", "direction": "Roskilde", "date": "2026-11-03", "time": "12:10:00", "cancelled": True, "ProductAtStop": {"displayNumber": "Re", "catOut": "Re"}},
    ]})
    assert rp[0]["line"] == "5C" and rp[0]["expected"] == "2026-11-03T12:03:00+01:00" and rp[0]["transport_mode"] == "BUS"
    assert rp[1]["state"] == "CANCELLED" and rp[1]["transport_mode"] == "TRAIN"
    assert transit.parse_hafas_stops({"stopLocationOrCoordLocation": [{"StopLocation": {"extId": "8600617", "name": "Roskilde St."}}, {"CoordLocation": {}}]}) == [{"id": "8600617", "name": "Roskilde St."}]

    tf = transit.parse_tfl_departures([
        {"lineName": "73", "destinationName": "Stoke Newington", "expectedArrival": "2026-11-03T12:09:00Z", "modeName": "bus"},
        {"lineName": "Victoria", "destinationName": "Brixton", "expectedArrival": "2026-11-03T12:04:00Z", "modeName": "tube"},
    ])
    assert [d["line"] for d in tf] == ["Victoria", "73"] and tf[0]["transport_mode"] == "METRO"


async def test_keys_from_the_server_admin(client, monkeypatch):
    await _setup(client)
    providers = {p["id"]: p for p in (await client.get("/api/transit/providers")).json()}
    # SL, Entur and TfL need no key; the others wait for one.
    assert providers["sl"]["available"] and providers["entur"]["available"] and providers["tfl"]["available"]
    assert not providers["trafiklab"]["available"] and providers["trafiklab"]["needs_key"]
    assert (await client.get("/api/transit/trafiklab/stops?q=Stockholm")).status_code == 409

    # The server admin adds Trafiklab's key; it's never sent back.
    keys = (await client.put("/api/admin/integrations/transit", json={"provider": "trafiklab", "api_key": "abcd1234efgh"})).json()
    row = next(k for k in keys if k["id"] == "trafiklab")
    assert row["configured"] and "abcd1234efgh" not in str(keys)
    assert (await client.put("/api/admin/integrations/transit", json={"provider": "sl", "api_key": "abcd1234efgh"})).status_code == 422

    asked = []

    async def fake_get(url, headers=None, params=None):
        asked.append((url, params))
        if "/stops/name/" in url:
            return {"stop_groups": [{"id": "740000001", "name": "Stockholm Centralstation"}]}
        local = soon(4).astimezone(transit.ZoneInfo("Europe/Stockholm")).strftime("%Y-%m-%dT%H:%M:%S")
        return {"departures": [{"scheduled": local, "realtime": local, "canceled": False, "route": {"designation": "43", "transport_mode": "TRAIN", "direction": "Bålsta"}}]}

    monkeypatch.setattr(transit, "_get", fake_get)
    assert (await client.get("/api/transit/trafiklab/stops?q=Stockholm")).json() == [{"id": "740000001", "name": "Stockholm Centralstation"}]
    deps = (await client.get("/api/transit/trafiklab/departures?stop=740000001")).json()
    assert deps[0]["line"] == "43" and deps[0]["stale"] is False
    assert asked[0][1]["key"] == "abcd1234efgh"

    # Removing the key makes it wait again.
    await client.put("/api/admin/integrations/transit", json={"provider": "trafiklab", "api_key": None})
    assert (await client.get("/api/transit/trafiklab/departures?stop=740000001")).status_code == 409


async def test_last_known_departures_while_a_provider_fails(client, monkeypatch):
    await _setup(client)
    store = {}

    class MemRedis:
        async def get(self, key):
            return store.get(key)

        async def set(self, key, value, ex=None):
            store[key] = value

    monkeypatch.setattr(transit, "_get_redis", lambda: MemRedis())
    calls = {"n": 0}

    async def flaky_post(url, body, headers):
        calls["n"] += 1
        if calls["n"] > 1:
            raise httpx.ConnectError("down")
        t = soon(8).isoformat()
        return {"data": {"stopPlace": {"estimatedCalls": [{"aimedDepartureTime": t, "expectedDepartureTime": t, "destinationDisplay": {"frontText": "Sentrum"}, "serviceJourney": {"line": {"publicCode": "31", "transportMode": "bus"}}}]}}}

    monkeypatch.setattr(transit, "_post", flaky_post)
    first = (await client.get("/api/transit/entur/departures?stop=NSR:StopPlace:58366")).json()
    assert first[0]["line"] == "31" and first[0]["stale"] is False
    # The answer is cached for 30 s; past that, Entur fails and the last known ones are shown.
    store.pop("transit:departures:entur:NSR:StopPlace:58366")
    again = (await client.get("/api/transit/entur/departures?stop=NSR:StopPlace:58366")).json()
    assert again[0]["line"] == "31" and again[0]["stale"] is True


async def test_sl_needs_no_key_and_works_as_before(client, monkeypatch):
    from app.services import sl

    await _setup(client)

    async def fake_search(q):
        return [{"id": 9001, "name": "T-Centralen"}]

    async def fake_departures(site_id, forecast=60):
        return [{"line": "17", "destination": "Åkeshov", "transport_mode": "METRO", "scheduled": soon(3).isoformat(), "expected": soon(3).isoformat(), "state": "EXPECTED"}]

    monkeypatch.setattr(sl, "search_sites", fake_search)
    monkeypatch.setattr(sl, "departures", fake_departures)
    monkeypatch.setattr("app.routers.transit.search_sites", fake_search)
    monkeypatch.setattr("app.routers.transit.departures", fake_departures)
    # The old addresses, as the existing widgets use them …
    assert (await client.get("/api/transit/sl/sites?q=T-Cen")).json() == [{"id": 9001, "name": "T-Centralen"}]
    assert (await client.get("/api/transit/sl/departures?site_id=9001")).json()[0]["line"] == "17"
    # … and the new ones, with no key anywhere.
    assert (await client.get("/api/transit/sl/stops?q=T-Cen")).json() == [{"id": "9001", "name": "T-Centralen"}]
    assert (await client.get("/api/transit/sl/departures?stop=9001")).json()[0]["destination"] == "Åkeshov"
    # An old SL widget (site_id only) can still be added; a new one names its provider and stop.
    assert (await client.post("/api/dashboard/widgets", json={"type": "sl_departures", "config": {"site_id": 9001, "site_name": "T-Centralen"}})).status_code == 201
    assert (await client.post("/api/dashboard/widgets", json={"type": "sl_departures", "config": {"provider": "entur", "stop_id": "NSR:StopPlace:58366", "stop_name": "Jernbanetorget"}})).status_code == 201
    assert (await client.post("/api/dashboard/widgets", json={"type": "sl_departures", "config": {}})).status_code == 422
