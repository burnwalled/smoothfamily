#!/bin/sh
# The help centre's screenshots (3.0.2): a throwaway test stack, a demo family per language, every
# page on a phone – saved as webp in frontend/public/help/<language>/. Run before a release when
# pages have changed:
#
#   sh scripts/help-shots.sh
set -e
cd "$(dirname "$0")/.."
RAW="$(pwd)/.help-shots"
rm -rf "$RAW"
HELP_SHOTS="$RAW" sh scripts/e2e.sh tests/help-shots.spec.ts --project=phone

PY=backend/.venv/Scripts/python
[ -x "$PY" ] || PY=backend/.venv/bin/python
[ -x "$PY" ] || PY=python3
"$PY" - "$RAW" frontend/public/help <<'EOF'
import pathlib, sys
from PIL import Image
raw, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
n = 0
for png in sorted(raw.glob("*/*.png")):
    target = out / png.parent.name / (png.stem + ".webp")
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.open(png).convert("RGB").save(target, "WEBP", quality=72, method=6)
    n += 1
print(f"{n} screenshots in {out}")
EOF
rm -rf "$RAW"
