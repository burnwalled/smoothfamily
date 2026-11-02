"""The weather card and the weather line of the morning summary, from SMHI's open forecast API.

No key is needed and nothing about the family is sent: only the coordinates the admin chose,
rounded to two decimals (about a kilometre). Forecasts are cached for 30 minutes.
"""
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from app.config import get_settings

SMHI_URL = "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json"
CACHE_SECONDS = 1800
_cache: dict[str, tuple[float, list[dict]]] = {}

# SMHI's weather symbols (1–27) grouped into what the app draws.
_KIND = {
    1: "clear", 2: "clear", 3: "partly", 4: "partly", 5: "cloudy", 6: "cloudy", 7: "fog",
    8: "rain", 9: "rain", 10: "rain", 11: "thunder", 12: "sleet", 13: "sleet", 14: "sleet",
    15: "snow", 16: "snow", 17: "snow", 18: "rain", 19: "rain", 20: "rain", 21: "thunder",
    22: "sleet", 23: "sleet", 24: "sleet", 25: "snow", 26: "snow", 27: "snow",
}
WET = {"rain", "thunder", "sleet", "snow"}


def rounded(value: float) -> float:
    return round(float(value), 2)


def _tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


async def forecast(lat: float, lon: float) -> list[dict]:
    """[{time (local), temp, kind, precip}] hour by hour (later steps are 3–6 hours apart)."""
    lat, lon = rounded(lat), rounded(lon)
    key = f"{lat}:{lon}"
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "SmoothFamily (weather card)"}) as client:
        resp = await client.get(SMHI_URL.format(lat=lat, lon=lon))
    if resp.status_code != 200:
        raise ValueError("SMHI has no forecast for that place")
    tz = _tz()
    steps = []
    for row in resp.json().get("timeSeries", []):
        data = row.get("data", {})
        when = datetime.fromisoformat(row["time"].replace("Z", "+00:00")).astimezone(tz)
        steps.append(
            {
                "time": when,
                "temp": data.get("air_temperature"),
                "kind": _KIND.get(int(data.get("symbol_code") or 0), "cloudy"),
                "precip": float(data.get("precipitation_amount_mean") or 0.0),
                "wind": data.get("wind_speed"),
            }
        )
    _cache[key] = (time.monotonic(), steps)
    return steps


def _main_kind(steps: list[dict]) -> str:
    """The day's weather: the wettest kind if it rains or snows, else the most common."""
    kinds = [s["kind"] for s in steps]
    for wet in ("thunder", "snow", "sleet", "rain"):
        if kinds.count(wet) >= 2 or (wet in kinds and len(kinds) <= 3):
            return wet
    return max(set(kinds), key=kinds.count) if kinds else "cloudy"


def summary(steps: list[dict], now: datetime | None = None) -> dict:
    """What the card and the morning summary show: now, the rest of today, and the coming days."""
    tz = _tz()
    now = (now or datetime.now(tz)).astimezone(tz)
    today = now.date()
    upcoming = [s for s in steps if s["time"] >= now - timedelta(minutes=30)]
    current = upcoming[0] if upcoming else (steps[-1] if steps else None)
    # Today from 06 (or now) to midnight.
    day = [s for s in upcoming if s["time"].date() == today and s["time"].hour >= 6]
    if not day:
        day = [s for s in upcoming if s["time"].date() == today]
    wet_from = next((s["time"].strftime("%H:%M") for s in day if s["kind"] in WET and s["precip"] >= 0.1), None)
    days = []
    for offset in range(1, 4):
        d = today + timedelta(days=offset)
        rows = [s for s in steps if s["time"].date() == d and 6 <= s["time"].hour <= 21]
        if rows:
            temps = [s["temp"] for s in rows if s["temp"] is not None]
            days.append({"date": d, "min": min(temps), "max": max(temps), "kind": _main_kind(rows)})
    temps = [s["temp"] for s in day if s["temp"] is not None]
    return {
        "now": {"temp": current["temp"], "kind": current["kind"], "wind": current["wind"]} if current else None,
        "today": {
            "min": min(temps) if temps else None,
            "max": max(temps) if temps else None,
            "kind": _main_kind(day) if day else (current["kind"] if current else "cloudy"),
            "wet_from": wet_from,
            "precip": round(sum(s["precip"] for s in day), 1),
        },
        "hours": [
            {"time": s["time"].strftime("%H:%M"), "temp": s["temp"], "kind": s["kind"], "precip": s["precip"]}
            for s in upcoming[:12]
        ],
        "days": days,
    }


_KIND_TEXT = {
    "en": {"clear": "sunny", "partly": "partly cloudy", "cloudy": "cloudy", "fog": "fog", "rain": "rain", "thunder": "thunder", "sleet": "sleet", "snow": "snow"},
    "sv": {"clear": "sol", "partly": "växlande molnighet", "cloudy": "mulet", "fog": "dimma", "rain": "regn", "thunder": "åska", "sleet": "snöblandat regn", "snow": "snö"},
    "nb": {"clear": "sol", "partly": "delvis skyet", "cloudy": "overskyet", "fog": "tåke", "rain": "regn", "thunder": "torden", "sleet": "sludd", "snow": "snø"},
    "da": {"clear": "sol", "partly": "skiftende skydække", "cloudy": "overskyet", "fog": "tåge", "rain": "regn", "thunder": "torden", "sleet": "slud", "snow": "sne"},
    "fi": {"clear": "aurinkoista", "partly": "puolipilvistä", "cloudy": "pilvistä", "fog": "sumua", "rain": "sadetta", "thunder": "ukkosta", "sleet": "räntää", "snow": "lunta"},
}
_FROM = {"en": "{what} from {time}", "sv": "{what} från {time}", "nb": "{what} fra {time}", "da": "{what} fra {time}", "fi": "{what} klo {time} alkaen"}


def weather_line(info: dict, language: str) -> str:
    """"8–12°, rain from 15:00" for the morning summary."""
    texts = _KIND_TEXT.get(language, _KIND_TEXT["en"])
    today = info["today"]
    parts = []
    if today["min"] is not None:
        low, high = round(today["min"]), round(today["max"])
        parts.append(f"{low}°" if low == high else f"{low}–{high}°")
    if today["wet_from"]:
        wet = today["kind"] if today["kind"] in WET else "rain"
        parts.append(_FROM.get(language, _FROM["en"]).format(what=texts[wet], time=today["wet_from"]))
    else:
        parts.append(texts[today["kind"]])
    return ", ".join(parts)


def today_local() -> date:
    return datetime.now(_tz()).date()
