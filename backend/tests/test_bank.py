"""Importing the bank's CSV (2.7.5): the banks' formats, suggestions, rules, and never twice."""
import pytest

pytestmark = pytest.mark.asyncio

# Swedbank: a line above the header, semicolons, comma decimals, cp1252.
SWEDBANK = (
    "* Transaktionsrapport Period 2026-10-01 – 2026-10-31\n"
    "Radnummer;Clearingnummer;Kontonummer;Produkt;Valuta;Bokföringsdag;Transaktionsdag;Valutadag;Referens;Beskrivning;Belopp;Bokfört saldo\n"
    "1;8327-9;123;Privatkonto;SEK;2026-10-28;2026-10-27;2026-10-28;CIRCLE K SOLNA;CIRCLE K SOLNA;-812,50;10000,00\n"
    "2;8327-9;123;Privatkonto;SEK;2026-10-25;2026-10-25;2026-10-25;VATTENFALL;VATTENFALL AB;-1 234,00;10812,50\n"
    "3;8327-9;123;Privatkonto;SEK;2026-10-25;2026-10-25;2026-10-25;LÖN;LÖN OKTOBER;35 000,00;12046,50\n"
    "4;8327-9;123;Privatkonto;SEK;2026-10-24;2026-10-24;2026-10-24;ICA;ICA NARA SOLNA;-345,90;12046,50\n"
).encode("cp1252")
# Handelsbanken / SEB style: other names, ISO dates, dot decimals.
OTHER = "Datum,Text,Belopp,Saldo\n2026-10-20,BAUHAUS BARKARBY,-1499.00,5000.00\n2026-10-19,OKQ8 ARLANDA,-650.00,6499.00\n".encode("utf-8-sig")


def test_formats():
    from app.services import bank_csv

    rows = bank_csv.parse(SWEDBANK)
    assert [(str(r.day), r.amount) for r in rows] == [("2026-10-28", -812.5), ("2026-10-25", -1234.0), ("2026-10-25", 35000.0), ("2026-10-24", -345.9)]
    assert rows[0].text == "CIRCLE K SOLNA"
    assert [r.text for r in bank_csv.parse(OTHER)] == ["BAUHAUS BARKARBY", "OKQ8 ARLANDA"]
    assert bank_csv.pattern_of("CIRCLE K SOLNA 12/10") == "circle k"
    with pytest.raises(ValueError):
        bank_csv.parse(b"just,some,text\n1,2,3\n")


async def test_suggest_import_remember_and_never_twice(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    car = (await client.post("/api/vehicles", json={"name": "Volvo", "registration": "ABC123"})).json()
    home = (await client.post("/api/property/properties", json={"name": "Villan"})).json()

    rows = (await client.post("/api/bank/parse", files={"file": ("export.csv", SWEDBANK, "text/csv")})).json()
    # Money in is left out; known merchants get a suggestion (the only car, the only home).
    by_text = {r["text"]: r for r in rows}
    assert "LÖN OKTOBER" not in by_text
    assert by_text["CIRCLE K SOLNA"]["suggestion"] == {"target": "vehicle", "target_id": car["id"], "category": "fuel", "source": "known"}
    assert by_text["VATTENFALL AB"]["suggestion"]["target"] == "property" and by_text["VATTENFALL AB"]["suggestion"]["category"] == "utility"
    assert by_text["ICA NARA SOLNA"]["suggestion"]["target"] == "economy"  # groceries go to the economy's food (2.8.5)

    choose = [
        {**{k: r[k] for k in ("day", "text", "amount", "digest")}, "target": "ignore" if r["text"] == "ICA NARA SOLNA" else r["suggestion"]["target"], "target_id": r["suggestion"]["target_id"], "category": r["suggestion"]["category"], "remember": r["text"] == "ICA NARA SOLNA", "pattern": r["pattern"]}
        for r in rows
    ]
    result = (await client.post("/api/bank/import", json={"rows": choose})).json()
    assert result == {"imported": 2, "skipped": 1, "rules": 1}
    assert [(e["name"], e["amount"], e["category"]) for e in (await client.get(f"/api/vehicles/expenses?vehicle_id={car['id']}")).json()] == [("CIRCLE K SOLNA", 812.5, "fuel")]
    assert [e["name"] for e in (await client.get(f"/api/property/expenses?property_id={home['id']}")).json()] == ["VATTENFALL AB"]

    # The same file again: already imported, and the rule says ICA is skipped.
    again = (await client.post("/api/bank/parse", files={"file": ("export.csv", SWEDBANK, "text/csv")})).json()
    assert all(r["imported"] for r in again if r["text"] != "ICA NARA SOLNA")
    assert {r["text"]: r for r in again}["ICA NARA SOLNA"]["suggestion"]["source"] == "rule"
    redo = (await client.post("/api/bank/import", json={"rows": choose})).json()
    assert redo["imported"] == 0
    rules = (await client.get("/api/bank/rules")).json()
    assert [(r["pattern"], r["target"]) for r in rules] == [("ica nara", "ignore")]
    assert (await client.delete(f"/api/bank/rules/{rules[0]['id']}")).status_code == 204

    # Only adults.
    await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})
    assert (await client.post("/api/auth/login", json={"username": "leo", "password": "pass1234"})).status_code == 200
    assert (await client.post("/api/bank/parse", files={"file": ("export.csv", OTHER, "text/csv")})).status_code == 403



async def test_the_import_tells_which_purchases_have_a_receipt(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    # The receipt is dated a day after the bank's day, as often happens.
    assert (await client.post("/api/receipts", json={"store": "Circle K", "amount": 812.5, "purchased_on": "2026-10-28", "category": "vehicle"})).status_code == 201
    rows = (await client.post("/api/bank/parse", files={"file": ("export.csv", SWEDBANK, "text/csv")})).json()
    assert {r["text"]: r["has_receipt"] for r in rows} == {"CIRCLE K SOLNA": True, "VATTENFALL AB": False, "ICA NARA SOLNA": False}
