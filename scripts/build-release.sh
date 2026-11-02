#!/bin/sh
# Build a production release for the Synology install (see docs/DEPLOY_SYNOLOGY.md).
# Run on a PC with Docker (Docker Desktop works), from any directory:
#
#   sh scripts/build-release.sh [version]
#
# Produces release/smooth-family-<version>/ with images.tar.gz plus the
# deploy files. Copy that folder to the NAS and run install.sh there.
set -e
cd "$(dirname "$0")/.."

VERSION=${1:-$(git describe --tags --always --dirty)}
PLATFORM=${PLATFORM:-linux/amd64}  # DSM 6 Docker only exists for Intel/AMD models
OUT="release/smooth-family-$VERSION"

# A fresh (two weeks old) SearXNG for the recipe and wish search; SKIP_SEARXNG_BUMP=1 keeps it.
[ "${SKIP_SEARXNG_BUMP:-0}" = "1" ] || sh scripts/bump-searxng.sh

echo "Building $VERSION for $PLATFORM..."
docker build --platform "$PLATFORM" -t "smooth-family-backend:$VERSION" backend
docker build --platform "$PLATFORM" -t "smooth-family-frontend:$VERSION" frontend

mkdir -p "$OUT"
echo "Saving images..."
docker save "smooth-family-backend:$VERSION" "smooth-family-frontend:$VERSION" | gzip > "$OUT/images.tar.gz"
# Strip CR so the files run on the NAS even if the Windows working copy has CRLF.
for f in docker-compose.yml Caddyfile .env.example install.sh backup.sh update.sh; do
	tr -d '\015' < "deploy/synology/$f" > "$OUT/$f"
done
tr -d '\015' < deploy/searxng/settings.yml > "$OUT/searxng.yml"
echo "$VERSION" > "$OUT/VERSION"

echo ""
echo "Release ready: $OUT ($(du -sh "$OUT" | cut -f1))"
echo "Copy the folder to the NAS (e.g. /volume2/docker/smooth-family) and run: sudo sh install.sh"
