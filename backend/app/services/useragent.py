"""A browser's User-Agent in a few words: which browser, which system, and what kind of device.

Used for a report's context and the family's list of devices – never more than this is kept.
"""

_BROWSERS = (("Edg/", "Edge"), ("OPR/", "Opera"), ("SamsungBrowser/", "Samsung Internet"), ("Firefox/", "Firefox"), ("FxiOS/", "Firefox"), ("CriOS/", "Chrome"), ("Chrome/", "Chrome"), ("Safari/", "Safari"))
_SYSTEMS = (("iPad", "iPadOS"), ("iPhone", "iOS"), ("Android", "Android"), ("Windows", "Windows"), ("Mac OS X", "macOS"), ("CrOS", "ChromeOS"), ("Linux", "Linux"))


def describe(ua: str | None) -> dict[str, str]:
    """{browser, os, kind}: kind is mobile, tablet or computer."""
    ua = ua or ""
    browser = next((name for mark, name in _BROWSERS if mark in ua), "")
    system = next((name for mark, name in _SYSTEMS if mark in ua), "")
    if system == "iPadOS" or (system == "Android" and "Mobile" not in ua):
        kind = "tablet"
    elif system in ("iOS", "Android") or "Mobile" in ua:
        kind = "mobile"
    else:
        kind = "computer"
    return {"browser": browser, "os": system, "kind": kind}


def short(ua: str | None) -> str:
    """"Chrome on Android"; "" when unknown."""
    d = describe(ua)
    return " on ".join(x for x in (d["browser"], d["os"]) if x)
