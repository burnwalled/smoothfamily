"""Which of the family's pantry items an ingredient is (2.8.4): for "can be made with what we have"
in the recipe book, and for counting down the pantry after cooking. Plain word matching – "gul lök"
finds "Lök", "Mjölk 3 %" is milk – and staples nobody keeps track of count as at home."""
import re

STAPLES = {"salt", "peppar", "pepper", "vatten", "water", "vann", "vand", "suola", "vesi", "is"}
_WORD = re.compile(r"[a-zåäöæøéü]+")


def words(name: str) -> set[str]:
    return {w for w in _WORD.findall(name.lower()) if len(w) >= 3}


def is_staple(name: str) -> bool:
    found = words(name) or {name.strip().lower()}
    return bool(found) and found <= STAPLES


def matches(ingredient: str, item: str) -> bool:
    a, b = words(ingredient), words(item)
    if not a or not b:
        return False
    if a & b:
        return True
    # "vetemjöl" and "mjöl", "körsbärstomater" and "tomater": one word ends the other.
    return any(x.endswith(y) or y.endswith(x) for x in a for y in b if min(len(x), len(y)) >= 4)
