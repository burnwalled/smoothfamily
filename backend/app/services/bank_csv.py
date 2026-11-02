"""Reading a bank's transaction export (CSV) – Swedbank, SEB, Handelsbanken, Nordea, ICA Banken,
Länsförsäkringar, Skandia and others (2.7.5, #47).

No bank connection is needed: the member downloads the file from the bank and uploads it. The
file is read here, in memory, and never stored. Each bank names its columns its own way and puts a
line or two above them, so the header row is found by its names.
"""
import csv
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import date, datetime

DATE_NAMES = ("bokföringsdag", "bokforingsdag", "bokföringsdatum", "transaktionsdag", "transaktionsdatum", "valutadag", "datum", "date", "bokført", "dato", "kirjauspäivä", "päivämäärä")
TEXT_NAMES = ("beskrivning", "text", "specifikation", "rubrik", "referens", "mottagare", "meddelande", "description", "tekst", "beskrivelse", "selitys", "saaja")
AMOUNT_NAMES = ("belopp", "amount", "beløb", "beløp", "summa", "määrä")


@dataclass
class Txn:
    day: date
    text: str
    amount: float

    @property
    def digest(self) -> str:
        """The same transaction in another export of the same period gives the same digest."""
        return hashlib.sha256(f"{self.day.isoformat()}|{self.amount:.2f}|{self.text.strip().casefold()}".encode()).hexdigest()


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _amount(value: str) -> float | None:
    v = value.strip().replace("−", "-").replace("\xa0", "").replace(" ", "").replace("kr", "").replace("SEK", "")
    if not v:
        return None
    if "," in v and "." in v:
        # 1.234,50 or 1,234.50: the last one is the decimal sign.
        v = v.replace(".", "").replace(",", ".") if v.rfind(",") > v.rfind(".") else v.replace(",", "")
    else:
        v = v.replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def _date(value: str) -> date | None:
    v = value.strip()
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def _find(header: list[str], names: tuple[str, ...]) -> int | None:
    low = [h.strip().strip('"').casefold() for h in header]
    for name in names:
        for i, h in enumerate(low):
            if h == name:
                return i
    for name in names:
        for i, h in enumerate(low):
            if name in h:
                return i
    return None


def parse(data: bytes) -> list[Txn]:
    """The transactions in the file; raises ValueError when no date, text and amount columns are found."""
    text = _decode(data)
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("The file is empty")
    sample = "\n".join(lines[:10])
    delimiter = max((";", ",", "\t"), key=lambda d: sample.count(d))
    rows = list(csv.reader(io.StringIO("\n".join(lines)), delimiter=delimiter))
    for at, header in enumerate(rows[:15]):
        di, ti, ai = _find(header, DATE_NAMES), _find(header, TEXT_NAMES), _find(header, AMOUNT_NAMES)
        if di is not None and ti is not None and ai is not None and len({di, ti, ai}) == 3:
            break
    else:
        raise ValueError("Couldn't find the date, text and amount columns")
    out: list[Txn] = []
    for row in rows[at + 1:]:
        if len(row) <= max(di, ti, ai):
            continue
        day, amount = _date(row[di]), _amount(row[ai])
        if day is None or amount is None:
            continue
        out.append(Txn(day=day, text=re.sub(r"\s+", " ", row[ti]).strip(), amount=amount))
    return out


# Known merchants: where they usually go (the family's own rules come first).
SUGGEST: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("circle k", "okq8", "preem", "st1", "ingo", "shell", "tanka", "qstar", "gulf", "neste", "st 1"), "vehicle", "fuel"),
    (("ionity", "recharge", "mer sverige", "clever", "tesla supercharger", "vattenfall incharge", "eways"), "vehicle", "charging"),
    (("easypark", "parkster", "aimo", "apcoa", "q-park", "parkering"), "vehicle", "parking"),
    (("trängselskatt", "trangselskatt", "transportstyrelsen", "infrastruktur", "bropass", "epass", "autopass"), "vehicle", "toll"),
    (("mekonomen", "biltema", "bilia", "meca", "däck", "dack", "vianor", "euromaster", "dackskiftarna"), "vehicle", "service"),
    (("bilprovningen", "besikta", "carspect", "opus bilprovning"), "vehicle", "service"),
    (("vattenfall", "e.on", "eon ", "ellevio", "tibber", "fortum", "göteborg energi", "goteborg energi", "skellefteå kraft", "jämtkraft", "mälarenergi", "telge energi", "greenely", "bixia"), "property", "utility"),
    (("telia", "bredband", "bahnhof", "comhem", "tele2", "ownit", "fibra", "stadsnät"), "property", "utility"),
    (("bauhaus", "byggmax", "hornbach", "k-rauta", "beijer", "jula", "clas ohlson", "xl-bygg", "optimera", "colorama", "flügger", "flugger"), "property", "maintenance"),
    (("sotning", "sotare", "skorsten"), "property", "maintenance"),
    (("hemförsäkring", "hemforsakring", "villaförsäkring", "if skadeförs", "folksam", "länsförsäkringar", "trygg-hansa", "dina försäkringar"), "property", "insurance"),
    # The household's economy (2.8.5): everyday things that belong to no home or vehicle.
    (("ica ", "ica nara", "ica kvantum", "ica maxi", "coop", "willys", "hemköp", "hemkop", "lidl", "city gross", "mathem", "netto", "tempo", "matsmart"), "economy", "food"),
    (("apotek", "kronans", "apoteket", "lloyds", "hjärtat"), "economy", "health"),
    (("netflix", "spotify", "hbo", "max.com", "viaplay", "disney", "storytel", "nextory", "youtube premium", "icloud", "google one"), "economy", "subscriptions"),
    (("h&m", "lindex", "kappahl", "åhléns", "ahlens", "zara", "dressmann", "stadium", "intersport", "zalando", "boozt"), "economy", "clothes"),
    (("sl ", "sj ", "västtrafik", "vasttrafik", "skånetrafiken", "skanetrafiken", "voi", "bolt", "uber"), "economy", "transport"),
)


def suggest(text: str) -> tuple[str, str] | None:
    low = text.casefold()
    for words, target, category in SUGGEST:
        if any(w in low for w in words):
            return target, category
    return None


def pattern_of(text: str) -> str:
    """A rule's text from a transaction: the merchant's name without card numbers, dates and the
    city (e.g. 'CIRCLE K SOLNA 12/10' → 'circle k')."""
    words = [w for w in re.split(r"\s+", text.casefold()) if w and not re.search(r"\d", w)]
    return " ".join(words[:2])[:80] or text.casefold()[:80]
