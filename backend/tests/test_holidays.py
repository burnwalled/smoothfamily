"""3.4.0: public holidays worked out on the server – checked against the official lists."""
from datetime import date

import pytest

from app.services import holidays as h


def _days(country, year, eves=False):
    return {d: n for d, n, eve in h.holidays(country, year) if eve == eves}


def test_easter():
    assert [h.easter(y) for y in (2024, 2025, 2026, 2027, 2038)] == [date(2024, 3, 31), date(2025, 4, 20), date(2026, 4, 5), date(2027, 3, 28), date(2038, 4, 25)]


def test_sweden_2026():
    days = _days("SE", 2026)
    assert days[date(2026, 4, 3)] == "Långfredagen" and days[date(2026, 4, 6)] == "Annandag påsk"
    assert days[date(2026, 5, 14)] == "Kristi himmelsfärdsdag" and days[date(2026, 5, 24)] == "Pingstdagen"
    assert days[date(2026, 6, 20)] == "Midsommardagen" and days[date(2026, 10, 31)] == "Alla helgons dag"
    assert len(days) == 13
    assert _days("SE", 2026, eves=True) == {date(2026, 6, 19): "Midsommarafton", date(2026, 12, 24): "Julafton", date(2026, 12, 31): "Nyårsafton"}
    # Midsommar and All Saints' move: 2025.
    assert date(2025, 6, 21) in _days("SE", 2025) and date(2025, 11, 1) in _days("SE", 2025)


def test_norway_denmark_finland():
    no = _days("NO", 2026)
    assert no[date(2026, 5, 17)] == "Grunnlovsdag" and no[date(2026, 4, 2)] == "Skjærtorsdag" and no[date(2026, 5, 25)] == "Andre pinsedag"
    dk = _days("DK", 2026)
    assert date(2026, 5, 1) not in dk and len(dk) == 10  # no Store bededag since 2024
    assert "Store bededag" in _days("DK", 2023).values()
    fi = _days("FI", 2026)
    assert fi[date(2026, 12, 6)] == "Itsenäisyyspäivä" and fi[date(2026, 6, 20)] == "Juhannuspäivä"


@pytest.mark.parametrize(
    "country, expected",
    [
        # gov.uk: England and Wales 2026
        ("GB-ENG", [date(2026, 1, 1), date(2026, 4, 3), date(2026, 4, 6), date(2026, 5, 4), date(2026, 5, 25), date(2026, 8, 31), date(2026, 12, 25), date(2026, 12, 28)]),
        # Scotland 2026: 2 January, the first Monday of August, St Andrew's Day (a Monday)
        ("GB-SCT", [date(2026, 1, 1), date(2026, 1, 2), date(2026, 4, 3), date(2026, 5, 4), date(2026, 5, 25), date(2026, 8, 3), date(2026, 11, 30), date(2026, 12, 25), date(2026, 12, 28)]),
    ],
)
def test_uk_2026(country, expected):
    assert sorted(_days(country, 2026)) == expected


def test_uk_substitute_days():
    # 2027: Christmas on a Saturday, Boxing Day on a Sunday → Monday 27th and Tuesday 28th.
    eng = _days("GB-ENG", 2027)
    assert date(2027, 12, 27) in eng and date(2027, 12, 28) in eng and date(2027, 12, 25) not in eng
    # Northern Ireland 2026: St Patrick's Day (Tuesday), the Twelfth (a Sunday → Monday 13th).
    nir = _days("GB-NIR", 2026)
    assert date(2026, 3, 17) in nir and date(2026, 7, 13) in nir


def test_between_and_off():
    assert h.between(None, date(2026, 1, 1), date(2027, 1, 1)) == []
    span = h.between("SE", date(2026, 12, 20), date(2027, 1, 7))
    assert [d for d, _, _ in span] == [date(2026, 12, 24), date(2026, 12, 25), date(2026, 12, 26), date(2026, 12, 31), date(2027, 1, 1), date(2027, 1, 6)]


@pytest.mark.asyncio
async def test_the_red_days_in_the_calendar(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})
    assert (await client.get("/api/dashboard/sources")).json()["holiday_country"] == "SE"
    events = (await client.get("/api/calendar/events?start=2026-12-20&end=2027-01-02")).json()
    red = {e["title"]: (e["holiday"], e["holiday_eve"]) for e in events if e["holiday"]}
    assert red == {"Julafton": (True, True), "Juldagen": (True, False), "Annandag jul": (True, False), "Nyårsafton": (True, True), "Nyårsdagen": (True, False)}
    # Another country, then off – the family's own events stay.
    assert (await client.put("/api/dashboard/sources/holidays", json={"country": "GB-SCT"})).json()["holiday_country"] == "GB-SCT"
    events = (await client.get("/api/calendar/events?start=2026-11-29&end=2026-12-01")).json()
    assert [e["title"] for e in events if e["holiday"]] == ["St Andrew's Day"]
    assert (await client.put("/api/dashboard/sources/holidays", json={"country": "US"})).status_code == 422
    await client.put("/api/dashboard/sources/holidays", json={"country": None})
    assert not [e for e in (await client.get("/api/calendar/events?start=2026-12-20&end=2027-01-02")).json() if e["holiday"]]
