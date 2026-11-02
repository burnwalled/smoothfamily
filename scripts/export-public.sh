#!/bin/sh
# Copy the committed tree (HEAD) into a clone of the public repository – without the private parts –
# and check it for anything that must not be published. Nothing is committed or pushed: look at the
# result in the clone, then commit and push there yourself.
#
#   sh scripts/export-public.sh ../smoothfamily
#
# Left out: .ai/ (working notes). The development Home Assistant's config is never in git.
set -e
TARGET=${1:?"usage: sh scripts/export-public.sh <folder of the public repository's clone>"}
cd "$(dirname "$0")/.."
[ -d "$TARGET/.git" ] || { echo "$TARGET is not a git clone"; exit 1; }
[ -z "$(git status --porcelain)" ] || echo "Note: uncommitted changes are not exported – only HEAD is."

# Replace everything but the clone's own .git with HEAD.
find "$TARGET" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git archive HEAD | tar -x -C "$TARGET"
rm -rf "$TARGET/.ai"

# Stop if anything looks like a secret or a private address.
found=$(grep -rIlE \
  -e 'ghp_[A-Za-z0-9]{20,}' -e 'github_pat_[A-Za-z0-9_]{20,}' -e 'sk-[A-Za-z0-9]{32,}' -e 'AKIA[0-9A-Z]{16}' \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'xox[abp]-[A-Za-z0-9-]{10,}' \
  "$TARGET" --exclude-dir=.git 2>/dev/null || true)
if [ -n "$found" ]; then
  echo "Something that looks like a secret – not exported until it is gone:"
  echo "$found"
  exit 1
fi
echo "Exported $(git rev-parse --short HEAD) to $TARGET. Look it through, then commit and push there."
