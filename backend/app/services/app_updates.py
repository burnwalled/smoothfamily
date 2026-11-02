"""Smooth Family updating itself (3.3.0). A server on the stable or the beta channel looks for the
newest build on GitHub – only when the server admin has chosen a channel (it's an outgoing call) –
and update.sh puts it in like the other services' updates (services/updates.py).

What a server installs is named in a manifest (scripts/release-manifest.py): the version, the channel
and the two images by digest. The manifest is signed (scripts/sign-release.py), and nothing is planned
unless the signature checks out with a key built in here:

- a stable release is signed on the maintainer's computer – the stable channel trusts only that key,
  so not even a taken-over GitHub account can send a stable update;
- every beta build is signed by GitHub's build with the beta key – the beta channel trusts both.

The images are then pulled by digest, so what runs is exactly what was signed.
"""
import base64
import json
import os
import re

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from app import __version__

REPO = "burnwalled/smoothfamily"
STABLE_PUBLIC_KEY = "P7bU3eRMXgtTrzmhzWKxCGDsdyDFBkl3XF8/lSSplyM="
BETA_PUBLIC_KEY = ""
CHANNELS = ("off", "stable", "beta")
IMAGE = {
    "backend": re.compile(r"^ghcr\.io/burnwalled/smoothfamily-backend@sha256:[0-9a-f]{64}$"),
    "frontend": re.compile(r"^ghcr\.io/burnwalled/smoothfamily-frontend@sha256:[0-9a-f]{64}$"),
}
VERSION = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$")


class AppUpdateError(Exception):
    """Why no update could be found – shown to the server admin."""


def version_key(version: str) -> tuple[int, int, int, int, int]:
    """3.3.0-beta.2 < 3.3.0 < 3.3.1: a release comes after its betas."""
    m = VERSION.match(version or "")
    if not m:
        return (0, 0, 0, 0, 0)
    major, minor, patch, beta = m.groups()
    return (int(major), int(minor), int(patch), 0 if beta else 1, int(beta or 0))


def running() -> dict:
    """This server's own version and build (the commit its images were built from)."""
    return {"version": __version__, "commit": os.environ.get("APP_BUILD", "")}


def trusted_keys(channel: str) -> dict[str, str]:
    keys = {"stable": STABLE_PUBLIC_KEY}
    if channel == "beta" and BETA_PUBLIC_KEY:
        keys["beta"] = BETA_PUBLIC_KEY
    return keys


def verify(manifest: bytes, sig: bytes, channel: str) -> dict:
    """The manifest, if a key this channel trusts signed it – else AppUpdateError."""
    try:
        s = json.loads(sig)
        public = trusted_keys(channel).get(s.get("key"))
        if not public:
            raise AppUpdateError(f"Signed with a key the {channel} channel doesn't trust")
        Ed25519PublicKey.from_public_bytes(base64.b64decode(public)).verify(base64.b64decode(s["signature"]), manifest)
    except InvalidSignature:
        raise AppUpdateError("The signature doesn't match – the update is ignored")
    except (ValueError, KeyError, TypeError):
        raise AppUpdateError("The signature can't be read")
    try:
        m = json.loads(manifest)
    except ValueError:
        raise AppUpdateError("The manifest can't be read")
    if m.get("product") != "smooth-family" or not VERSION.match(str(m.get("version", ""))):
        raise AppUpdateError("Not a Smooth Family manifest")
    if channel == "stable" and (m.get("channel") != "stable" or s.get("key") != "stable"):
        raise AppUpdateError("Not a stable release")
    images = m.get("images") or {}
    for part, pattern in IMAGE.items():
        if not pattern.match(str(images.get(part, ""))):
            raise AppUpdateError(f"The {part} image isn't named by digest")
    if not re.fullmatch(r"[0-9a-f]{40}", str(m.get("commit", ""))):
        raise AppUpdateError("The manifest has no commit")
    return m


async def fetch(channel: str) -> tuple[bytes, bytes]:
    """The channel's manifest and its signature, from the GitHub release: the newest stable release,
    or the beta channel's pre-release that moves with every change."""
    api = f"https://api.github.com/repos/{REPO}/releases/" + ("latest" if channel == "stable" else "tags/channel-beta")
    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"Accept": "application/vnd.github+json"}) as client:
        resp = await client.get(api)
        if resp.status_code == 404:
            raise AppUpdateError(f"No {channel} release yet")
        resp.raise_for_status()
        assets = {a["name"]: a["browser_download_url"] for a in resp.json().get("assets", [])}
        if "manifest.json" not in assets or "manifest.sig" not in assets:
            raise AppUpdateError("The release isn't signed yet")
        manifest = (await client.get(assets["manifest.json"])).raise_for_status().content
        sig = (await client.get(assets["manifest.sig"])).raise_for_status().content
    return manifest, sig


async def available(channel: str, get=None) -> dict | None:
    """The build to update to on this channel, or None when this server runs it (or something newer)."""
    if channel not in ("stable", "beta"):
        return None
    if channel == "beta" and not BETA_PUBLIC_KEY:
        raise AppUpdateError("This version can't follow the beta channel yet")
    try:
        manifest, sig = await (get or fetch)(channel)
    except httpx.HTTPError:
        raise AppUpdateError("GitHub couldn't be reached")
    m = verify(manifest, sig, channel)
    me = running()
    if m["commit"] == me["commit"] or version_key(m["version"]) < version_key(me["version"]):
        return None
    return {"version": m["version"], "build": m.get("build"), "commit": m["commit"], "built_at": m.get("built_at"), **m["images"]}
