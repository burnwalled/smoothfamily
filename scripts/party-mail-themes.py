#!/usr/bin/env python3
"""The party themes' colours for the server's mails: read from the app's own lists and written to
backend/app/services/party_mail_themes.json. Run it after changing a theme; a test says when it's time."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = (ROOT / "frontend/src/lib/partyThemes.ts").read_text(encoding="utf-8")
LIBRARY = (ROOT / "frontend/src/lib/partyLibrary.ts").read_text(encoding="utf-8")


def field(body: str, name: str) -> str | None:
    m = re.search(rf'[ ,{{]{name}: "([^"]*)"', body)
    return m.group(1) if m else None


def over(color: str, bg: str) -> str:
    """An rgba() laid on the background, as mail programs want it plain."""
    m = re.match(r"rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)", color)
    if not m:
        return color
    r, g, b, a = int(m[1]), int(m[2]), int(m[3]), float(m[4])
    back = [int(bg[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * a + y * (1 - a)):02x}" for x, y in zip((r, g, b), back, strict=True))


out = {}
for m in re.finditer(r'^\s*T\("(\w+)",\s*"\w+",\s*\{([^\n]*)\}\),?\s*$', THEMES, re.M):
    key, body = m.group(1), m.group(2)
    background = field(body, "background") or ""
    colors = re.findall(r"#[0-9a-fA-F]{6}", background)
    dark = "...DARK" in body
    bg = colors[0] if colors else ("#0d0b08" if dark else "#ffffff")
    surface = field(body, "surface") or ("rgba(255,255,255,.86)" if not dark else "rgba(20,20,20,.9)")
    header = re.search(rf'file: "([^"]+)"', next((line for line in LIBRARY.splitlines() if f'kind: "header", theme: "{key}"' in line), ""))
    out[key] = {
        "bg": bg, "surface": over(surface, bg), "ink": field(body, "ink"), "muted": field(body, "muted"), "accent": field(body, "accent"),
        "font": field(body, "fonts"), "header": f"/party-assets/{header.group(1)}" if header else None,
    }
path = ROOT / "backend/app/services/party_mail_themes.json"
path.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
print(len(out), "themes")
