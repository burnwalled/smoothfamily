"""A party's mails as HTML, in the party's theme (3.4.0): the same words as the plain text beside them.
Mail programs know little of modern CSS, so it's tables and plain colours, and everything from the hosts
and the guests is escaped. The colours are the app's themes (party_mail_themes.json; a test keeps it in
step with frontend/src/lib/partyThemes.ts)."""

import json
import re
from html import escape
from pathlib import Path

THEMES: dict = json.loads(Path(__file__).with_name("party_mail_themes.json").read_text(encoding="utf-8"))
SERIF = "Georgia,'Times New Roman',serif"
SANS = "Helvetica,Arial,sans-serif"
_URL = re.compile(r"https?://[^\s<>\"']+")


def _rgb(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def _mix(a: str, b: str, t: float) -> str:
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(_rgb(a), _rgb(b), strict=True))


def _is_dark(color: str) -> bool:
    r, g, b = _rgb(color)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5


def palette(theme_key: str | None, custom=None) -> dict:
    """The colours of a built-in theme, or of the family's own (made as the app makes them)."""
    if custom is not None:
        middle = _mix(custom.bg, custom.bg2, 0.5)
        dark = _is_dark(middle)
        return {
            "bg": middle, "surface": _mix(custom.bg, "#000000", 0.35) if dark else "#ffffff", "ink": custom.ink,
            "muted": _mix(custom.ink, "#000000" if dark else "#ffffff", 0.35), "accent": custom.accent, "font": custom.font or "playful", "header": None,
        }
    return THEMES.get(theme_key or "") or THEMES["balloons"]


def _text(text: str) -> str:
    """Escaped, with its line breaks and its addresses as links."""
    out, last = [], 0
    for m in _URL.finditer(text):
        out.append(escape(text[last:m.start()]))
        url = escape(m.group(0), quote=True)
        out.append(f'<a href="{url}" style="color:inherit">{url}</a>')
        last = m.end()
    out.append(escape(text[last:]))
    return "".join(out).replace("\n", "<br>")


def render(*, colors: dict, title: str, emoji: str, text: str, when: str = "", button: str = "", link: str = "", foot: str = "", stop: str = "", stop_link: str = "", header: str | None = None) -> str:
    """One mail: the top picture if there is one, the party's name, the words, when and where, the
    button to their own page, and the small print."""
    bg, surface, ink, muted, accent = colors["bg"], colors["surface"], colors["ink"], colors["muted"], colors["accent"]
    on_accent = "#ffffff" if _is_dark(accent) else "#1a1a1a"
    display = SERIF if colors["font"] in ("gala", "classic") else SANS
    parts = [f'<tr><td style="height:8px;font-size:0;line-height:0;background:{accent}">&nbsp;</td></tr>']
    if header:
        parts.append(f'<tr><td style="padding:0"><img src="{escape(header, quote=True)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>')
    parts.append(f'<tr><td style="padding:28px 32px 4px;font-family:{display};font-size:30px;line-height:1.15;font-weight:bold;color:{accent}">{escape(emoji)} {escape(title)}</td></tr>')
    parts.append(f'<tr><td style="padding:12px 32px;font-family:{SANS};font-size:16px;line-height:1.5;color:{ink}">{_text(text)}</td></tr>')
    if when:
        parts.append(f'<tr><td style="padding:4px 32px 12px;font-family:{SANS};font-size:15px;line-height:1.5;font-weight:bold;color:{ink}">{_text(when)}</td></tr>')
    if button and link:
        parts.append(
            f'<tr><td style="padding:12px 32px 24px"><a href="{escape(link, quote=True)}" style="display:inline-block;padding:12px 26px;border-radius:999px;'
            f'background:{accent};color:{on_accent};font-family:{SANS};font-size:15px;font-weight:bold;text-decoration:none">{escape(button)}</a></td></tr>'
        )
    if foot or stop:
        ending = f' <a href="{escape(stop_link, quote=True)}" style="color:{muted}">{escape(stop)}</a>' if stop and stop_link else ""
        parts.append(f'<tr><td style="padding:12px 32px 24px;font-family:{SANS};font-size:12px;line-height:1.5;color:{muted};border-top:1px solid {_mix(muted, surface, 0.6)}">{escape(foot)}{ending}</td></tr>')
    rows = "".join(parts)
    return (
        f'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title></head>'
        f'<body style="margin:0;padding:0;background:{bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{bg}"><tr><td align="center" style="padding:24px 12px">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:{surface};border-radius:14px;overflow:hidden">{rows}</table>'
        "</td></tr></table></body></html>"
    )
