#!/bin/sh
# Takes a complete backup of the family's data (Postgres dump + media, compressed) into the backup
# folder (DATA_DIR/backup), sealed with the server's backup key when one is set in Server settings,
# and removes the old ones. Run manually or via cron, see docs/BACKUP.md.
#
# The app makes it – the same as its nightly schedule – so a sealed backup also holds the server's
# secrets and opens with the private key alone. Without a key it is not encrypted, and says so.
set -e
cd "$(dirname "$0")/.."

docker compose exec -T backend python -m app.cli backup
