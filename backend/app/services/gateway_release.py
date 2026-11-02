"""The newest gateway, for the gateways to update themselves (3.0.1): the program and its release –
version, checksum and a signature made on the family's own computer (scripts/sign-gateway.py). The
server only passes them on; a gateway runs nothing whose signature it can't check."""
import json
import pathlib
import re
from functools import lru_cache

FOLDER = pathlib.Path(__file__).resolve().parents[1] / "gateway_release"


@lru_cache(maxsize=1)
def release() -> dict | None:
    try:
        data = json.loads((FOLDER / "release.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return {k: str(data[k]) for k in ("version", "sha256", "signature")}


@lru_cache(maxsize=1)
def program() -> bytes:
    # Line endings as signed, whatever a Windows checkout made of them.
    return (FOLDER / "gateway.py").read_bytes().replace(b"\r\n", b"\n")


def latest_version() -> str | None:
    found = release()
    return found["version"] if found else None


def older(version: str | None, than: str | None) -> bool:
    """Whether a gateway runs an older version than the newest one."""
    def parts(v: str) -> tuple:
        return tuple(int(x) for x in re.findall(r"\d+", v)[:3])

    return bool(version and than) and parts(version) < parts(than)
