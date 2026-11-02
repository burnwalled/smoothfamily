#!/bin/sh
# Nightly backup for the Synology install: Postgres dump + media archive into $DATA_DIR/backup,
# sealed with the server's backup key, old ones removed after the schedule's days. Schedule it in DSM:
# Control Panel -> Task Scheduler -> Create -> Scheduled Task -> User-defined
# script, user "root", command: sh /volume2/docker/smooth-family/backup.sh
# (use the volume where your "docker" shared folder lives)
#
# Point Hyper Backup at $DATA_DIR/backup (not pgdata!) for an off-site copy.
set -e
cd "$(dirname "$0")"
# Synology installs docker/docker-compose in /usr/local/bin, which sudo's PATH lacks.
PATH="/usr/local/bin:$PATH"

if docker compose version > /dev/null 2>&1; then
	COMPOSE="docker compose"
else
	COMPOSE="docker-compose"
fi

# The app makes the backup (the same as its nightly schedule): the database, the media and – when
# a backup key is set in Server settings – the server's secrets, all sealed with that key. Without a
# key the backup is not encrypted and the script says so. .env is never copied next to the backups:
# keep it in your password manager, or make a backup key.
$COMPOSE exec -T backend python -m app.cli backup
