"""Sign a build's manifest (3.3.0), so servers that update themselves trust it.

Two keys, as for the gateway: the **stable** key stays on the maintainer's computer
(~/.smooth-family/release-signing.key) – a stable release is signed there, so even someone who took
over the GitHub account couldn't send a stable update to the servers. The **beta** key is a GitHub
Actions secret (BETA_SIGNING_KEY): every change to beta is signed by the build itself. A server on the
stable channel trusts only the stable key; one on the beta channel trusts both. Their public halves
are in backend/app/services/app_updates.py.

  python scripts/sign-release.py keygen stable      # once – keep a copy in the password manager
  python scripts/sign-release.py keygen beta        # once – straight into the GitHub secret (gh)
  python scripts/sign-release.py --key-env BETA_SIGNING_KEY manifest.json   # in the build
  python scripts/sign-release.py release v3.3.0     # a stable release: fetch, check, sign, publish

The signature is over the manifest file's exact bytes; manifest.sig says which key signed it.
"""
import argparse
import base64
import json
import os
import pathlib
import subprocess
import sys
import tempfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

STABLE_KEY = pathlib.Path.home() / ".smooth-family" / "release-signing.key"
REPO = "burnwalled/smoothfamily"


def _public(key: Ed25519PrivateKey) -> str:
    return base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()


def keygen(which: str) -> None:
    key = Ed25519PrivateKey.generate()
    raw = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    if which == "stable":
        if STABLE_KEY.exists():
            sys.exit(f"{STABLE_KEY} exists already – a new key would stop every stable server updating.")
        STABLE_KEY.parent.mkdir(parents=True, exist_ok=True)
        STABLE_KEY.write_bytes(raw)
        STABLE_KEY.chmod(0o600)
        print(f"Saved in {STABLE_KEY}.")
    else:
        # Straight into the repository's secret – never shown or written to disk.
        r = subprocess.run(["gh", "secret", "set", "BETA_SIGNING_KEY", "-R", REPO], input=base64.b64encode(raw).decode(), text=True, capture_output=True)
        if r.returncode:
            sys.exit(f"gh secret set failed: {r.stderr.strip()[:200]}")
        print("The private half is saved as the BETA_SIGNING_KEY secret on GitHub.")
    print(f"Public half for {which.upper()}_PUBLIC_KEY in backend/app/services/app_updates.py:")
    print(_public(key))


def sign_file(key: Ed25519PrivateKey, which: str, manifest: pathlib.Path) -> pathlib.Path:
    data = manifest.read_bytes()
    channel = json.loads(data)["channel"]
    if which == "beta" and channel != "beta":
        sys.exit("The beta key signs only beta manifests.")
    out = manifest.with_name("manifest.sig")
    out.write_text(json.dumps({"key": which, "signature": base64.b64encode(key.sign(data)).decode()}) + "\n", encoding="utf-8")
    return out


def release(tag: str) -> None:
    """A stable release: the build attached manifest.json to the draft release – check it, sign it
    here, attach the signature and publish the release."""
    key = Ed25519PrivateKey.from_private_bytes(STABLE_KEY.read_bytes())
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["gh", "release", "download", tag, "-R", REPO, "-p", "manifest.json", "-D", tmp], check=True)
        manifest = pathlib.Path(tmp) / "manifest.json"
        m = json.loads(manifest.read_bytes())
        if m.get("channel") != "stable" or f"v{m.get('version')}" != tag:
            sys.exit(f"The manifest is not the stable {tag}: {m.get('channel')} {m.get('version')}")
        print(json.dumps(m, indent=2))
        sig = sign_file(key, "stable", manifest)
        subprocess.run(["gh", "release", "upload", tag, "-R", REPO, str(sig), "--clobber"], check=True)
        subprocess.run(["gh", "release", "edit", tag, "-R", REPO, "--draft=false", "--latest"], check=True)
    print(f"Signed and published {tag}.")


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "keygen":
        keygen(sys.argv[2] if len(sys.argv) > 2 else "stable")
        return
    if len(sys.argv) >= 2 and sys.argv[1] == "release":
        release(sys.argv[2])
        return
    ap = argparse.ArgumentParser()
    ap.add_argument("--key-env", help="the environment variable that holds the beta key (base64)")
    ap.add_argument("manifest", type=pathlib.Path)
    a = ap.parse_args()
    if a.key_env:
        raw = os.environ.get(a.key_env, "")
        if not raw:
            sys.exit(f"{a.key_env} is empty.")
        key, which = Ed25519PrivateKey.from_private_bytes(base64.b64decode(raw)), "beta"
    else:
        key, which = Ed25519PrivateKey.from_private_bytes(STABLE_KEY.read_bytes()), "stable"
    print(f"Signed with the {which} key: {sign_file(key, which, a.manifest)}")


if __name__ == "__main__":
    main()
