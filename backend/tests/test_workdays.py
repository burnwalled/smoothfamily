"""3.4.0: a task every workday or every weekend day – the family's red days count as weekend."""
from datetime import date

import pytest

from app.services.schedule import due_on

pytestmark = pytest.mark.asyncio


class T:
    def __init__(self, recurrence, country="SE"):
        self.recurrence, self.holiday_country = recurrence, country
        self.until_date = self.medication_id = None
        self.active = True


def test_workdays_skip_weekends_and_red_days():
    work, rest = T("workdays"), T("weekends")
    # Christmas 2026 in Sweden: julafton (Thu 24), juldagen (Fri 25), annandag (Sat 26).
    assert due_on(work, date(2026, 12, 23)) and not due_on(rest, date(2026, 12, 23))
    for d in (date(2026, 12, 24), date(2026, 12, 25), date(2026, 12, 26), date(2026, 12, 27)):
        assert not due_on(work, d) and due_on(rest, d), d
    assert due_on(work, date(2026, 12, 28))
    # Without a country only the weekend counts.
    assert due_on(T("workdays", None), date(2026, 12, 24))
    # Midsummer's eve 2027 (Fri 25 June) in Sweden; an ordinary Friday in Norway.
    assert not due_on(work, date(2027, 6, 25)) and due_on(T("workdays", "NO"), date(2027, 6, 25))


async def test_a_pet_task_every_weekend_day(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})
    made = await client.post("/api/tasks", json={"title": "Långpromenad med Molly", "recurrence": "weekends", "points": 10})
    assert made.status_code == 201 and made.json()["recurrence"] == "weekends"
    assert (await client.post("/api/tasks", json={"title": "x", "recurrence": "fortnightly"})).status_code == 422
