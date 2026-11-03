"""Public holidays – red days – for the family's country (3.4.0): Sweden, Norway, Denmark, Finland and
the United Kingdom (England & Wales, Scotland, Northern Ireland). Worked out here, with no outside
service: the fixed dates, those that move with Easter, and those that fall on a weekday. The eves that
work like holidays (julafton …) are marked as eves. Another country is added as a calendar
subscription (a public ICS feed) instead.
"""
from datetime import date, timedelta

COUNTRIES = ("SE", "NO", "DK", "FI", "GB-ENG", "GB-SCT", "GB-NIR")
# A new family's country from its admin's language – changed or turned off in Family settings.
BY_LANGUAGE = {"sv": "SE", "nb": "NO", "da": "DK", "fi": "FI", "en": "GB-ENG"}


def easter(year: int) -> date:
    """Easter Sunday (the Gregorian computus, Meeus/Jones/Butcher)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _weekday_between(year: int, month: int, first: int, weekday: int) -> date:
    """The given weekday (0 = Monday) in the seven days from `first` of the month."""
    start = date(year, month, first)
    return start + timedelta(days=(weekday - start.weekday()) % 7)


def _nth_monday(year: int, month: int, n: int) -> date:
    return _weekday_between(year, month, 1, 0) + timedelta(weeks=n - 1)


def _last_monday(year: int, month: int) -> date:
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    last = nxt - timedelta(days=1)
    return last - timedelta(days=last.weekday())


def _substituted(days: list[tuple[date, str]]) -> list[tuple[date, str]]:
    """UK: a bank holiday on a Saturday or Sunday moves to the next weekday that isn't one already
    (Christmas on a Saturday → Monday 27th, Boxing Day → Tuesday 28th)."""
    taken = {d for d, _ in days if d.weekday() < 5}
    out = []
    for d, name in sorted(days):
        if d.weekday() >= 5:
            moved = d
            while moved.weekday() >= 5 or moved in taken:
                moved += timedelta(days=1)
            taken.add(moved)
            out.append((moved, f"{name} (substitute day)"))
        else:
            out.append((d, name))
    return out


def holidays(country: str, year: int) -> list[tuple[date, str, bool]]:
    """(date, name, is_eve) for the year, in date order. Names in the country's own language."""
    e = easter(year)
    eve = []  # the eves that work like holidays
    if country == "SE":
        days = [
            (date(year, 1, 1), "Nyårsdagen"), (date(year, 1, 6), "Trettondedag jul"), (e - timedelta(days=2), "Långfredagen"),
            (e, "Påskdagen"), (e + timedelta(days=1), "Annandag påsk"), (date(year, 5, 1), "Första maj"),
            (e + timedelta(days=39), "Kristi himmelsfärdsdag"), (e + timedelta(days=49), "Pingstdagen"),
            (date(year, 6, 6), "Sveriges nationaldag"), (_weekday_between(year, 6, 20, 5), "Midsommardagen"),
            (_weekday_between(year, 10, 31, 5), "Alla helgons dag"), (date(year, 12, 25), "Juldagen"), (date(year, 12, 26), "Annandag jul"),
        ]
        eve = [(_weekday_between(year, 6, 19, 4), "Midsommarafton"), (date(year, 12, 24), "Julafton"), (date(year, 12, 31), "Nyårsafton")]
    elif country == "NO":
        days = [
            (date(year, 1, 1), "Første nyttårsdag"), (e - timedelta(days=3), "Skjærtorsdag"), (e - timedelta(days=2), "Langfredag"),
            (e, "Første påskedag"), (e + timedelta(days=1), "Andre påskedag"), (date(year, 5, 1), "Arbeidernes dag"),
            (date(year, 5, 17), "Grunnlovsdag"), (e + timedelta(days=39), "Kristi himmelfartsdag"), (e + timedelta(days=49), "Første pinsedag"),
            (e + timedelta(days=50), "Andre pinsedag"), (date(year, 12, 25), "Første juledag"), (date(year, 12, 26), "Andre juledag"),
        ]
        eve = [(date(year, 12, 24), "Julaften"), (date(year, 12, 31), "Nyttårsaften")]
    elif country == "DK":
        days = [
            (date(year, 1, 1), "Nytårsdag"), (e - timedelta(days=3), "Skærtorsdag"), (e - timedelta(days=2), "Langfredag"),
            (e, "Påskedag"), (e + timedelta(days=1), "2. påskedag"), (e + timedelta(days=39), "Kristi himmelfartsdag"),
            (e + timedelta(days=49), "Pinsedag"), (e + timedelta(days=50), "2. pinsedag"),
            (date(year, 12, 25), "Juledag"), (date(year, 12, 26), "2. juledag"),
        ]
        if year < 2024:  # Store bededag was abolished from 2024
            days.append((e + timedelta(days=26), "Store bededag"))
        eve = [(date(year, 6, 5), "Grundlovsdag"), (date(year, 12, 24), "Juleaften"), (date(year, 12, 31), "Nytårsaften")]
    elif country == "FI":
        days = [
            (date(year, 1, 1), "Uudenvuodenpäivä"), (date(year, 1, 6), "Loppiainen"), (e - timedelta(days=2), "Pitkäperjantai"),
            (e, "Pääsiäispäivä"), (e + timedelta(days=1), "2. pääsiäispäivä"), (date(year, 5, 1), "Vappu"),
            (e + timedelta(days=39), "Helatorstai"), (e + timedelta(days=49), "Helluntaipäivä"),
            (_weekday_between(year, 6, 20, 5), "Juhannuspäivä"), (_weekday_between(year, 10, 31, 5), "Pyhäinpäivä"),
            (date(year, 12, 6), "Itsenäisyyspäivä"), (date(year, 12, 25), "Joulupäivä"), (date(year, 12, 26), "Tapaninpäivä"),
        ]
        eve = [(_weekday_between(year, 6, 19, 4), "Juhannusaatto"), (date(year, 12, 24), "Jouluaatto")]
    elif country in ("GB-ENG", "GB-SCT", "GB-NIR"):
        base = [(date(year, 1, 1), "New Year's Day"), (e - timedelta(days=2), "Good Friday"), (_nth_monday(year, 5, 1), "Early May bank holiday"),
                (_last_monday(year, 5), "Spring bank holiday"), (date(year, 12, 25), "Christmas Day"), (date(year, 12, 26), "Boxing Day")]
        if country == "GB-SCT":
            base += [(date(year, 1, 2), "2nd January"), (_nth_monday(year, 8, 1), "Summer bank holiday"), (date(year, 11, 30), "St Andrew's Day")]
        else:
            base += [(e + timedelta(days=1), "Easter Monday"), (_last_monday(year, 8), "Summer bank holiday")]
        if country == "GB-NIR":
            base += [(date(year, 3, 17), "St Patrick's Day"), (date(year, 7, 12), "Battle of the Boyne (Orangemen's Day)")]
        days = _substituted(base)
    else:
        return []
    return sorted([(d, n, False) for d, n in days] + [(d, n, True) for d, n in eve])


def fox_theme(day: date, country: str | None) -> str:
    """What the fox screensaver dresses up for (3.4.0): newyear (31 Dec – 1 Jan), christmas (first
    Advent – Twelfth Night), easter (Palm Sunday – Easter Monday), midsummer (the Swedish and Finnish
    Friday between 19 and 25 June to its Sunday; Sankthans 23–24 June in Norway and Denmark; none in
    the UK), halloween (24–31 October) – or ""."""
    y = day.year
    if (day.month, day.day) in ((12, 31), (1, 1)):
        return "newyear"
    if (day.month == 1 and day.day <= 6) or day >= _weekday_between(y, 11, 27, 6):
        return "christmas"
    sunday = easter(y)
    if sunday - timedelta(days=7) <= day <= sunday + timedelta(days=1):
        return "easter"
    if day.month == 6:
        if country in ("NO", "DK"):
            if day.day in (23, 24):
                return "midsummer"
        elif not (country or "").startswith("GB"):
            eve = _weekday_between(y, 6, 19, 4)
            if eve <= day <= eve + timedelta(days=2):
                return "midsummer"
    if day.month == 10 and day.day >= 24:
        return "halloween"
    return ""


def between(country: str | None, start: date, end: date) -> list[tuple[date, str, bool]]:
    """The red days from `start` up to `end` (exclusive)."""
    if not country:
        return []
    return [h for year in range(start.year, end.year + 1) for h in holidays(country, year) if start <= h[0] < end]
