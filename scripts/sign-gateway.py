"""Sign a gateway release for the gateways to fetch from the server (3.0.1).

The gateways only run code signed with the key made here; the server just passes the file on, so
even someone who took over the server couldn't run anything in the cabin. The private key stays on
this computer (~/.smooth-family/gateway-signing.key) – keep a copy in your password manager. Its
public half is built into gateway/gateway.py (UPDATE_PUBLIC_KEY).

  backend/.venv/Scripts/python scripts/sign-gateway.py keygen   # once: makes the key, prints the public half
  backend/.venv/Scripts/python scripts/sign-gateway.py          # after each change to gateway/gateway.py

Signing writes backend/app/gateway_release/ (gateway.py + release.json), which ships in the
backend image; a test fails when it is older than gateway/gateway.py.
"""
import base64
import hashlib
import json
import pathlib
import re
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = pathlib.Path.home() / ".smooth-family" / "gateway-signing.key"
SOURCE = ROOT / "gateway" / "gateway.py"
OUT = ROOT / "backend" / "app" / "gateway_release"


def message(version: str, sha256: str) -> bytes:
    """What is signed – the same text the gateway checks."""
    return f"smooth-family-gateway\n{version}\n{sha256}".encode()


def keygen() -> None:
    if KEY.exists():
        sys.exit(f"{KEY} exists already – a new key would lock out every gateway in use.")
    key = Ed25519PrivateKey.generate()
    KEY.parent.mkdir(parents=True, exist_ok=True)
    KEY.write_bytes(key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
    KEY.chmod(0o600)
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    print(f"Key saved in {KEY}. Public half for UPDATE_PUBLIC_KEY in gateway/gateway.py:")
    print(base64.b64encode(public).decode())


def sign() -> None:
    key = Ed25519PrivateKey.from_private_bytes(KEY.read_bytes())
    code = SOURCE.read_bytes().replace(b"\r\n", b"\n")
    version = re.search(rb'^VERSION = "([0-9.]+)"$', code, re.M).group(1).decode()
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    if f'UPDATE_PUBLIC_KEY = "{base64.b64encode(public).decode()}"'.encode() not in code:
        sys.exit("gateway/gateway.py doesn't carry this key's public half (UPDATE_PUBLIC_KEY).")
    sha256 = hashlib.sha256(code).hexdigest()
    signature = base64.b64encode(key.sign(message(version, sha256))).decode()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "gateway.py").write_bytes(code)
    (OUT / "release.json").write_text(json.dumps({"version": version, "sha256": sha256, "signature": signature}, indent=2) + "\n", encoding="utf-8")
    print(f"Signed gateway {version} -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    keygen() if sys.argv[1:] == ["keygen"] else sign()
