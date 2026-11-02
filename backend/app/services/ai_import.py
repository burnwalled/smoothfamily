"""Tolerant parsing of JSON pasted from an external AI.

Strips markdown fences and chatter around the JSON so users can paste the
whole AI answer without surgical copy-pasting.
"""
import json
from typing import Any


def extract_json(raw: str) -> Any:
    """Find and parse the first JSON object/array in a pasted AI answer."""
    text = raw.strip()
    # Strip ```json ... ``` fences
    if "```" in text:
        chunks = text.split("```")
        for chunk in chunks:
            candidate = chunk.strip()
            if candidate.lower().startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith(("{", "[")):
                text = candidate
                break
    # Strip chatter before/after the JSON body
    for open_char, close_char in (("{", "}"), ("[", "]")):
        start = text.find(open_char)
        if start != -1:
            end = text.rfind(close_char)
            if end > start:
                try:
                    return json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    continue
    raise ValueError("No valid JSON found in the pasted answer")
