"""The household's subscriptions: the overview, vault logins and suggestions from a bank file."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Notification, User
from app.services import bank_csv
from app.services.subscription_reminders import run_subscription_reminders
from app.services.bank_csv import Txn


async def _family(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    for name, role in [("adult1", "adult"), ("maja", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _as(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


def _months(text, amount, n=4, start=date(2026, 6, 25), gap=30):
    return [Txn(day=start + timedelta(days=gap * i), text=f"{text} {i + 10}/06", amount=-amount) for i in range(n)]


def test_what_counts_as_recurring():
    found = {r.pattern: r for r in bank_csv.recurring([
        *_months("BAHNHOF AB", 399),
        *_months("SATS SVERIGE", 449),
        Txn(day=date(2026, 9, 1), text="NETFLIX.COM", amount=-129),  # known, once
        # Shops: no steady amount, no steady gaps.
        *[Txn(day=date(2026, 6, 1) + timedelta(days=d), text="ICA MAXI SOLNA", amount=-a) for d, a in ((0, 412), (3, 88), (11, 1030), (40, 250))],
        *_months("HYRA", 8000, n=1),  # once, and not known
        *[Txn(day=date(2026, 6, 1) + timedelta(days=d), text="KIOSKEN", amount=-20) for d in (0, 3, 40, 41)],  # the same amount, but irregular
        Txn(day=date(2026, 6, 25), text="LON", amount=25000),  # money in
        *_months("ELLEVIO", 0, n=0),
        *[Txn(day=date(2026, 6, 25) + timedelta(days=30 * i), text="VATTENFALL EL", amount=-a) for i, a in enumerate((900, 1400, 2100))],  # varies too much
    ])}
    assert set(found) == {"bahnhof ab", "sats sverige", "netflix.com"}
    assert found["bahnhof ab"].interval == "month" and found["bahnhof ab"].amount == 399 and found["bahnhof ab"].category == "internet"
    assert found["sats sverige"].category == "membership" and found["netflix.com"].category == "streaming"
    yearly = bank_csv.recurring(_months("DOMAN", 199, n=2, gap=365))
    assert yearly[0].interval == "year"


async def test_the_overview(client):
    ids = await _family(client)
    path = "/api/subscriptions"
    out = (await client.post(path, json={"name": "Netflix", "category": "streaming", "amount": 120, "interval": "month", "next_payment": "2020-01-15"})).json()
    assert out["per_month"] == 120 and out["per_year"] == 1440
    assert date.fromisoformat(out["items"][0]["next_payment"]) >= date.today()  # carried forward
    assert date.fromisoformat(out["items"][0]["next_payment"]).day == 15
    out = (await client.post(path, json={"name": "Hemförsäkring", "category": "insurance", "amount": 1200, "interval": "year"})).json()
    assert out["per_year"] == 2640 and out["per_month"] == 220
    assert (await client.post(path, json={"name": "x", "amount": 1, "url": "javascript:alert(1)"})).status_code == 422
    first = next(x for x in out["items"] if x["name"] == "Netflix")["id"]
    # Ended: out of the sums, kept in the list.
    ended = (await client.put(f"{path}/{first}", json={"ended_on": str(date.today())})).json()
    assert ended["per_year"] == 1200 and next(x for x in ended["items"] if x["id"] == first)["ended_on"]
    assert (await client.put(f"{path}/{first}", json={"ended_on": None})).json()["per_year"] == 2640

    # Only me: nobody else sees it, or has it in their sum.
    await client.post(path, json={"name": "Hemligt", "amount": 50, "private": True})
    await _as(client, "adult1")
    other = (await client.get(path)).json()
    assert "Hemligt" not in str(other) and other["per_year"] == 2640
    mine = (await client.get("/api/subscriptions")).json()
    assert len(mine["items"]) == 2
    secret_id = None
    await _as(client, "admin", "secret123")
    secret_id = next(x["id"] for x in (await client.get(path)).json()["items"] if x["name"] == "Hemligt")
    await _as(client, "adult1")
    assert (await client.put(f"{path}/{secret_id}", json={"name": "x"})).status_code == 404
    assert (await client.delete(f"{path}/{secret_id}")).status_code == 404
    # The children don't have it.
    await _as(client, "maja")
    assert (await client.get(path)).status_code == 403
    assert ids


async def test_a_login_from_the_vault(client):
    await _family(client)
    path = "/api/subscriptions"
    mine = (await client.post("/api/vault/logins", json={"title": "Netflix", "url": "https://netflix.com", "username": "anna", "password": "hemligt-lösen"})).json()
    out = (await client.post(path, json={"name": "Netflix", "amount": 120, "login_id": mine["id"]})).json()
    sub = out["items"][0]
    assert sub["login_id"] == mine["id"]
    # Nothing of the account is kept with the subscription.
    assert "hemligt" not in str(out) and "anna" not in str(out)
    # Someone else can't link a login they may not see, nor read it through the subscription.
    await _as(client, "adult1")
    assert (await client.post(path, json={"name": "Stöld", "amount": 1, "login_id": mine["id"]})).status_code == 404
    assert (await client.put(f"{path}/{sub['id']}", json={"login_id": mine["id"]})).status_code == 404
    assert (await client.get(f"/api/vault/logins/{mine['id']}/secret")).status_code == 404
    seen = (await client.get(path)).json()["items"][0]
    assert seen["name"] == "Netflix" and "hemligt" not in str(seen)
    # Removed from the vault: the subscription stays, without it.
    await _as(client, "admin", "secret123")
    await client.delete(f"/api/vault/logins/{mine['id']}")
    assert len((await client.get(path)).json()["items"]) == 1


def _csv(rows):
    return ("Datum;Text;Belopp\n" + "".join(f"{d};{t};{a}\n" for d, t, a in rows)).encode("utf-8")


async def _bank(client, rows):
    r = await client.post("/api/bank/parse", files={"file": ("bank.csv", _csv(rows), "text/csv")})
    assert r.status_code == 200, r.text
    return (await client.get("/api/subscriptions")).json()


async def test_suggestions_from_the_bank(client):
    await _family(client)
    months = [("2026-07-25", "2026-08-25", "2026-09-25")]
    file = [(d, "BAHNHOF AB", "-399,00") for d in months[0]] + [(d, "SATS SVERIGE", "-449,00") for d in months[0]] + [("2026-09-02", "ICA MAXI", "-812,50")]
    out = await _bank(client, file)
    assert {s["name"] for s in out["suggestions"]} == {"Bahnhof Ab", "Sats Sverige"} and out["items"] == [] and out["per_month"] == 0
    bahnhof = next(s for s in out["suggestions"] if s["name"] == "Bahnhof Ab")
    sats = next(s for s in out["suggestions"] if s["name"] == "Sats Sverige")
    assert bahnhof["amount"] == 399 and bahnhof["interval"] == "month" and bahnhof["last_seen"] == "2026-09-25"
    # Only what looks like a subscription is kept of the file.
    assert "ICA" not in str(out)

    # Added: a subscription, and no longer a suggestion. Dismissed: stays away, also after the next file.
    out = (await client.post(f"/api/subscriptions/suggestions/{bahnhof['id']}/accept")).json()
    assert out["items"][0]["name"] == "Bahnhof Ab" and out["items"][0]["from_bank"] and out["per_month"] == 399
    out = (await client.post(f"/api/subscriptions/suggestions/{sats['id']}/dismiss")).json()
    assert out["suggestions"] == [] and out["dismissed"][0]["name"] == "Sats Sverige"
    out = await _bank(client, file)
    assert out["suggestions"] == [] and len(out["items"]) == 1

    # A new price in a later file is pointed out, and can be taken over.
    later = [(d, "BAHNHOF AB", "-449,00") for d in ("2026-10-25", "2026-11-25", "2026-12-25")]
    out = await _bank(client, later)
    item = out["items"][0]
    assert item["price_changed"] and item["seen_amount"] == 449 and item["amount"] == 399
    out = (await client.put(f"/api/subscriptions/{item['id']}", json={"amount": 449})).json()
    assert not out["items"][0]["price_changed"]

    # Ended, but still paid: that's worth knowing.
    await client.put(f"/api/subscriptions/{item['id']}", json={"ended_on": "2026-12-01"})
    assert (await client.get("/api/subscriptions")).json()["items"][0]["still_paid"] is True

    # One added by hand is recognised by its name, not suggested.
    await client.post("/api/subscriptions", json={"name": "Telia", "amount": 300})
    out = await _bank(client, [(d, "TELIA SVERIGE", "-300,00") for d in ("2026-07-28", "2026-08-28", "2026-09-28")])
    assert not [s for s in out["suggestions"] if "Telia" in s["name"]]
    assert next(x for x in out["items"] if x["name"] == "Telia")["from_bank"] is True

    # Suggested again when asked.
    restored = (await client.post(f"/api/subscriptions/suggestions/{out['dismissed'][0]['id']}/restore")).json()
    assert restored["suggestions"][0]["name"] == "Sats Sverige"


async def test_a_file_stays_with_the_one_who_brought_it(client):
    await _family(client)
    await client.post("/api/subscriptions", json={"name": "Hemlig", "amount": 100, "private": True})
    # The other adult's own file: what recurs there is theirs to see, and my private one isn't touched.
    await _as(client, "adult1")
    months = ("2026-07-25", "2026-08-25", "2026-09-25")
    out = await _bank(client, [(d, "TERAPEUTEN AB", "-900,00") for d in months] + [(d, "HEMLIG TJANST", "-100,00") for d in months])
    assert {s["name"] for s in out["suggestions"]} == {"Terapeuten Ab", "Hemlig Tjanst"}
    idea = out["suggestions"][0]["id"]
    await _as(client, "admin", "secret123")
    seen = (await client.get("/api/subscriptions")).json()
    assert seen["suggestions"] == [] and seen["dismissed"] == [] and "Terapeuten" not in str(seen)
    assert seen["items"][0]["seen_on"] is None
    for action in ("accept", "dismiss", "restore"):
        assert (await client.post(f"/api/subscriptions/suggestions/{idea}/{action}")).status_code == 404


async def test_taking_something_shared_private(client):
    await _family(client)
    sub = (await client.post("/api/subscriptions", json={"name": "Delad", "amount": 100})).json()["items"][0]
    await _as(client, "adult1")
    out = (await client.put(f"/api/subscriptions/{sub['id']}", json={"private": True})).json()
    assert out["items"][0]["private"] is True  # still there for the one who said so
    await _as(client, "admin", "secret123")
    assert (await client.get("/api/subscriptions")).json()["items"] == []


async def test_when_a_member_leaves(client):
    ids = await _family(client)
    await _as(client, "adult1")
    await client.post("/api/subscriptions", json={"name": "Familjens", "amount": 100})
    await client.post("/api/subscriptions", json={"name": "Bara min", "amount": 50, "private": True})
    await _bank(client, [(d, "BAHNHOF AB", "-399,00") for d in ("2026-07-25", "2026-08-25", "2026-09-25")])
    await _as(client, "admin", "secret123")
    assert (await client.delete(f"/api/family/members/{ids['adult1']}")).status_code == 204
    out = (await client.get("/api/subscriptions")).json()
    assert [x["name"] for x in out["items"]] == ["Familjens"] and out["per_month"] == 100


MORNING = datetime(2026, 11, 4, 8, 0, tzinfo=timezone.utc)


async def _remind(now=MORNING) -> int:
    async with SessionLocal() as db:
        return await run_subscription_reminders(db, now)


async def _got(username: str) -> list[tuple[str, str]]:
    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.username == username))).scalar_one()
        rows = (await db.execute(select(Notification).where(Notification.user_id == user.id, Notification.kind == "subscription"))).scalars().all()
        return [(n.title, n.body) for n in rows]


async def test_the_last_day_to_cancel_reminds(client):
    await _family(client)
    path = "/api/subscriptions"
    await client.post(path, json={"name": "Gymmet", "amount": 300, "cancel_by": "2026-11-18"})
    assert await _remind(MORNING - timedelta(hours=5)) == 0  # not in the night
    assert await _remind(MORNING - timedelta(days=1)) == 0  # 15 days ahead
    assert await _remind() == 2  # both adults, not the child
    assert await _got("admin") == [("Gymmet: sista dag att säga upp", "Om 14 dagar")]
    assert await _got("maja") == []
    assert await _remind() == 0  # once
    # The next one, and after a server that was off on the very day it still comes.
    assert await _remind(MORNING + timedelta(days=13)) == 2
    assert ("Gymmet: sista dag att säga upp", "Imorgon") in await _got("admin")
    assert await _remind(MORNING + timedelta(days=15)) == 0  # passed
    assert (await client.get(path)).json()["items"][0]["cancel_by"] == "2026-11-18"


async def test_which_payments_remind(client):
    await _family(client)
    path = "/api/subscriptions"
    for name, interval in (("Netflix", "month"), ("Veckis", "week"), ("Kvartal", "quarter"), ("Hemförsäkring", "year")):
        await client.post(path, json={"name": name, "amount": 1200, "interval": interval, "next_payment": "2026-11-09"})
    assert await _remind() == 4  # the quarterly and the yearly, for both adults
    assert sorted(t for t, _ in await _got("admin")) == ["Hemförsäkring: betalning på väg", "Kvartal: betalning på väg"]
    assert all(b.startswith("Om 5 dagar · 1200") for _, b in await _got("admin"))
    # Carried forward: a year on both fall on the same day again, and remind again.
    assert await _remind(datetime(2027, 11, 3, 8, 0, tzinfo=timezone.utc)) == 4
    # Ended: quiet.
    items = (await client.get(path)).json()["items"]
    for item in items:
        await client.put(f"{path}/{item['id']}", json={"ended_on": "2027-01-01"})
    assert await _remind(datetime(2028, 11, 3, 8, 0, tzinfo=timezone.utc)) == 0


async def test_each_adult_chooses_their_reminders(client):
    await _family(client)
    path = "/api/subscriptions"
    await client.post(path, json={"name": "Årsvis", "amount": 100, "interval": "year", "next_payment": "2026-11-09"})
    await client.post(path, json={"name": "Kvartalsvis", "amount": 100, "interval": "quarter", "next_payment": "2026-11-09"})
    await client.post(path, json={"name": "Bindning", "amount": 100, "cancel_by": "2026-11-06"})
    await client.post(path, json={"name": "Min egen", "amount": 100, "cancel_by": "2026-11-06", "private": True})
    await _as(client, "adult1")
    me = (await client.get("/api/auth/me")).json()
    assert me["notification_prefs"]["subs_year"] is True  # on, also for someone who has never chosen
    prefs = {**me["notification_prefs"], "subs_year": False, "subs_cancel": False}
    assert (await client.patch("/api/auth/me", json={"notification_prefs": prefs})).status_code == 200
    await _remind()
    assert [t for t, _ in await _got("adult1")] == ["Kvartalsvis: betalning på väg"]
    assert sorted(t for t, _ in await _got("admin")) == ["Bindning: sista dag att säga upp", "Kvartalsvis: betalning på väg", "Min egen: sista dag att säga upp", "Årsvis: betalning på väg"]


async def test_a_passed_last_day_is_pointed_out(client):
    await _family(client)
    out = (await client.post("/api/subscriptions", json={"name": "Gymmet", "amount": 300, "cancel_by": "2020-01-01"})).json()
    assert out["items"][0]["cancel_passed"] is True
    out = (await client.post("/api/subscriptions", json={"name": "Nytt", "amount": 300, "cancel_by": str(date.today() + timedelta(days=30))})).json()
    assert next(x for x in out["items"] if x["name"] == "Nytt")["cancel_passed"] is False
