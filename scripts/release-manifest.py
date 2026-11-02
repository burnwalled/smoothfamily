"""The manifest of a build (3.3.0): what a server that updates itself installs – the version, the
channel and the two images by digest. Written by .github/workflows/images.yml, then signed with
scripts/sign-release.py. The server only uses a manifest whose signature it can check.

  python3 scripts/release-manifest.py --channel beta --tag "" --build 41 --commit <sha> \\
      --backend ghcr.io/burnwalled/smoothfamily-backend@sha256:… --frontend …@sha256:…
"""
import argparse
import json
import pathlib
import re
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMAGE = re.compile(r"^ghcr\.io/burnwalled/smoothfamily-(backend|frontend)@sha256:[0-9a-f]{64}$")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", choices=["stable", "beta"], required=True)
    ap.add_argument("--tag", default="")
    ap.add_argument("--build", type=int, required=True)
    ap.add_argument("--commit", required=True)
    ap.add_argument("--backend", required=True)
    ap.add_argument("--frontend", required=True)
    a = ap.parse_args()
    version = re.search(r'__version__ = "([^"]+)"', (ROOT / "backend/app/__init__.py").read_text(encoding="utf-8")).group(1)
    if a.tag and a.tag != f"v{version}":
        sys.exit(f"The tag {a.tag} doesn't match the code's version {version}.")
    if a.channel == "stable" and "-" in version:
        sys.exit(f"{version} is a pre-release – not for the stable channel.")
    for part, image in (("backend", a.backend), ("frontend", a.frontend)):
        m = IMAGE.match(image)
        if not m or m.group(1) != part:
            sys.exit(f"Not a {part} image by digest: {image}")
    if not re.fullmatch(r"[0-9a-f]{40}", a.commit):
        sys.exit("The commit must be a full SHA.")
    manifest = {
        "product": "smooth-family",
        "channel": a.channel,
        "version": version,
        "build": a.build,
        "commit": a.commit,
        "built_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "images": {"backend": a.backend, "frontend": a.frontend},
    }
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
