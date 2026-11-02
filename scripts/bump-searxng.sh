#!/bin/sh
# Moves the bundled SearXNG (the recipe and wish search) to the newest image that has been out for
# at least two weeks, in both compose files. Run by build-release.sh, so every release ships a
# fresh search engine – its engines are fixed often as sites change – but never a brand-new one.
#
#   sh scripts/bump-searxng.sh             pick and write the version
#   MIN_AGE_DAYS=30 sh scripts/bump-searxng.sh
#   DRY_RUN=1 sh scripts/bump-searxng.sh   only show what it would pick
set -eu
cd "$(dirname "$0")/.."

FILES="docker-compose.yml deploy/synology/docker-compose.yml"
# The first Python that really runs (on Windows "python3" can be a Store shortcut that doesn't).
PY=""
for candidate in python3 python; do
	if "$candidate" -c "" >/dev/null 2>&1; then
		PY=$candidate
		break
	fi
done
if [ -z "$PY" ]; then
	echo "SearXNG: python not found – keeping the current version."
	exit 0
fi

current=$(sed -n 's#^ *image: searxng/searxng:\([^ ]*\)$#\1#p' docker-compose.yml | head -1)
tags=$(curl -fsS "https://hub.docker.com/v2/repositories/searxng/searxng/tags?page_size=100&ordering=last_updated") || {
	echo "SearXNG: Docker Hub couldn't be reached – keeping $current."
	exit 0
}
picked=$(printf '%s' "$tags" | MIN_AGE_DAYS="${MIN_AGE_DAYS:-14}" "$PY" -c '
import json, os, re, sys
from datetime import datetime, timedelta, timezone

cutoff = datetime.now(timezone.utc) - timedelta(days=int(os.environ["MIN_AGE_DAYS"]))
best = None
for tag in json.load(sys.stdin).get("results", []):
    name = tag.get("name", "")
    archs = {i.get("architecture") for i in tag.get("images", [])}
    if not re.fullmatch(r"\d{4}\.\d{1,2}\.\d{1,2}-[0-9a-f]+", name) or not {"amd64", "arm64"} <= archs:
        continue
    when = datetime.fromisoformat(tag["last_updated"].replace("Z", "+00:00"))
    if when <= cutoff and (best is None or when > best[0]):
        best = (when, name)
print(best[1] if best else "")
')

if [ -z "$picked" ]; then
	echo "SearXNG: no image old enough – keeping $current."
	exit 0
fi
if [ "$picked" = "$current" ]; then
	echo "SearXNG: already on $current."
	exit 0
fi
if [ "${DRY_RUN:-0}" = "1" ]; then
	echo "SearXNG: would move $current -> $picked."
	exit 0
fi
for f in $FILES; do
	sed -i "s#^\( *image: searxng/searxng:\).*#\1$picked#" "$f"
done
echo "SearXNG: $current -> $picked (in $FILES)."
