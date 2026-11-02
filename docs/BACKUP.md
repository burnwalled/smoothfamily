# Backup and restore

All family data lives on one device. **Without backups, one failed disk/SD card
can wipe everything.**

## What needs backing up?

| What | Where | How |
|---|---|---|
| Database (accounts, tasks, points, calendars, settings) | `${DATA_DIR}/pgdata` (mounted into Postgres) | `scripts/backup.sh` (pg_dump) |
| Uploaded media (photos/videos) | `${DATA_DIR}/media` | `scripts/backup.sh` (tar) |
| Secrets | `.env` in repo root | copy manually and store safely |

Redis is cache only and does not need backup.

## Backups from the app

The server admin (the admin of the family that set up the server) finds them under
**Family admin → Storage & backup**:

- **Back up now** writes the same files as `backup.sh` – `smoothfamily-<time>.sql.gz` (the whole
  database) and `media-<time>.tar.gz` (all photos and files) – to `DATA_DIR/backup`, which the
  backend mounts as `/data/backup`.
- A **daily backup** at the chosen hour (server time zone, `TIMEZONE`, default Europe/Stockholm)
  is on by default, keeping 30 days; the newest backup is always kept.
- Every backup can be downloaded or removed in the list.
- The server admin sees a warning on Today when the newest backup is older than three days.

If you also run `backup.sh` from the NAS's task scheduler you get two backups a night – turn one
of them off. Either way, copy `DATA_DIR/backup` somewhere else too (another disk, Hyper Backup,
the rclone sidecar below): a backup on the same disk doesn't help if the disk dies.

`.env` is not in the app's backups (the backend can't read it); keep a copy of it safe yourself –
`SECRET_KEY` is needed to read the two-step and Home Assistant secrets after a restore.

## Exporting a family's data

**Family admin → Storage & backup → Download all data** gives every family admin a zip with one
JSON file per table (only that family's rows) and the family's media. Passwords, two-step
secrets, passkeys, push subscriptions and the Home Assistant token are left out. It is meant for
keeping and reading, not for restoring – use a backup for that.

## Local backup quick start

```sh
./scripts/backup.sh
```

Creates:

- `backup/smoothfamily-YYYYMMDD-HHMMSS.sql.gz`
- `backup/media-YYYYMMDD-HHMMSS.tar.gz`

Old local files are removed after `KEEP_DAYS` (default 30).

## Daily cron job

```sh
crontab -e
```

Example (03:30 every night):

```
30 3 * * * cd /home/pi/smooth-family && ./scripts/backup.sh >> backup/backup.log 2>&1
```

## Off-site sync with rclone sidecar (profile: backup-sync)

The compose stack includes an optional `backup-sync` sidecar profile that can
sync backups/media/env to cloud storage with versioned history.

1. Generate local backups on schedule (`scripts/backup.sh`).
2. Configure rclone once:

```sh
mkdir -p rclone
rclone config
```

3. In `.env`, set:

```env
RCLONE_REMOTE=mycrypt:smooth-family
RCLONE_SYNC_INTERVAL_SECONDS=86400
```

4. Start profile:

```sh
docker compose --profile backup-sync up -d backup-sync
```

The sidecar uses versioned sync via `--backup-dir` (`versions/YYYY-MM-DD/...`)
for both local backup archives and media files.

### crypt remote is mandatory

`RCLONE_REMOTE` must point to an rclone `crypt` remote, not a plain provider
remote.

**Store your crypt passphrase outside backups (password manager/paper vault). If
you lose it, your cloud backup is unreadable forever.**

### Free-tier caveats

- OneDrive free: typically 5 GB.
- Google Drive free: typically 15 GB.

Photos/video growth can exceed this quickly. Monitor quotas.

## Restore from local backup files

```sh
# 1) Fresh install / empty stack
./scripts/install.sh
docker compose stop backend frontend

# 2) Restore DB
gunzip -c backup/smoothfamily-XXXX.sql.gz | docker compose exec -T db psql -U smooth -d smoothfamily

# 3) Restore media into DATA_DIR
mkdir -p "${DATA_DIR:-./data}/media"
tar -xzf backup/media-XXXX.tar.gz -C "${DATA_DIR:-./data}/media"

# 4) Restore previous .env (SECRET_KEY should match old install)

# 5) Start services
docker compose up -d
```

## Restore from cloud (rclone)

1. Recreate rclone config with the same crypt remote + passphrase.
2. Pull files down:

```sh
rclone sync mycrypt:smooth-family/backup ./backup
rclone sync mycrypt:smooth-family/media "${DATA_DIR:-./data}/media"
rclone copy mycrypt:smooth-family/env/.env .
```

3. Run the same DB/media restore commands as above.

## Test your restore

A backup you never restored is unverified. Do a full test restore at least once
before trusting the setup.
