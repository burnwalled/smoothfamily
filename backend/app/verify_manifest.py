"""For update.sh (3.5.1): is this manifest one the channel's key signed, and newer than what the server
has put in before? The app checks it when it plans an update, but the app is what faces the internet.
So update.sh – root on the server – asks once more, in a container of its own made from the image
that runs now: no network, nothing to write to, and the keys that came with that image.

    python -m app.verify_manifest <manifest.json> <manifest.sig> <stable|beta> <floor>

The floor is the highest "version:build" put in so far, or "-". On stdout, for the script to compare
with its plan (it trusts no other line):

    version=3.5.1
    build=57
    backend=ghcr.io/…@sha256:…
    frontend=ghcr.io/…@sha256:…

Anything else: exit 1 and why on stderr.
"""
import sys
from pathlib import Path

from app.services.app_updates import AppUpdateError, version_key, verify

MAX_BYTES = 64 * 1024


def _build(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def order(version: str, build) -> tuple:
    """What comes after what: the version, then the build within it (every beta build has its own)."""
    return (*version_key(version), _build(build))


def check(manifest: bytes, sig: bytes, channel: str, floor: str) -> dict:
    """The manifest's version, build and two images – or AppUpdateError."""
    if channel not in ("stable", "beta"):
        raise AppUpdateError("Not a channel")
    m = verify(manifest, sig, channel)
    if floor and floor != "-":
        version, _, build = floor.partition(":")
        if order(m["version"], m.get("build")) <= order(version, build):
            raise AppUpdateError("Not newer than what this server has already put in")
    return {"version": m["version"], "build": _build(m.get("build")), **m["images"]}


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("usage: python -m app.verify_manifest <manifest.json> <manifest.sig> <stable|beta> <floor>", file=sys.stderr)
        return 2
    try:
        manifest, sig = (Path(p).read_bytes()[: MAX_BYTES + 1] for p in argv[:2])
        if len(manifest) > MAX_BYTES or len(sig) > MAX_BYTES:
            raise AppUpdateError("Too large to be a manifest")
        found = check(manifest, sig, argv[2], argv[3])
    except (AppUpdateError, OSError) as e:
        print(str(e), file=sys.stderr)
        return 1
    for key in ("version", "build", "backend", "frontend"):
        print(f"{key}={found[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
