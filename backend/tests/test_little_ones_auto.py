"""3.0.1: a child's birthday when the child is added – kept in Birthdays, and a child of 6 or younger
starts in the little ones' mode (changed under Tasks → Little ones' mode)."""
from datetime import date

import pytest

pytestmark = pytest.mark.asyncio


def _years_ago(years: int, days: int = 0) -> str:
    today = date.today()
    born = date(today.year - years, today.month, min(today.day, 28))
    return str(date.fromordinal(born.toordinal() - days))


async def test_a_young_child_starts_in_the_little_ones_mode(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    child = {"password": "1234", "role": "child"}
    four = (await client.post("/api/family/members", json={**child, "display_name": "Lo", "username": "lo", "birth_date": _years_ago(4)})).json()
    six = (await client.post("/api/family/members", json={**child, "display_name": "Mo", "username": "mo", "birth_date": _years_ago(6, days=1)})).json()
    seven = (await client.post("/api/family/members", json={**child, "display_name": "Bo", "username": "bo", "birth_date": _years_ago(7, days=1)})).json()
    unknown = (await client.post("/api/family/members", json={**child, "display_name": "Jo", "username": "jo"})).json()
    assert [four["easy_mode"], six["easy_mode"], seven["easy_mode"], unknown["easy_mode"]] == [True, True, False, False]

    # The birthday is in Birthdays, linked to the child.
    people = (await client.get("/api/birthdays/people")).json()
    lo = next(p for p in people if p["name"] == "Lo")
    assert lo["user_id"] == four["id"] and lo["birth_year"] == date.today().year - 4

    # Changed by hand afterwards, as before.
    off = (await client.put(f"/api/easy/children/{four['id']}", json={"easy_mode": False})).json()
    assert off["easy_mode"] is False
    future = str(date(date.today().year + 1, 1, 1))
    assert (await client.post("/api/family/members", json={**child, "display_name": "X", "username": "x", "birth_date": future})).status_code == 422
