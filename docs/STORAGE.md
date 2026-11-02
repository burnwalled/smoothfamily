# Storage guide (DATA_DIR)

Smooth Family now stores all persistent state under `DATA_DIR` on the host:

- Postgres: `${DATA_DIR}/pgdata`
- Media: `${DATA_DIR}/media`

Default is `./data` in the project directory, but on Raspberry Pi you should
prefer a USB3 SSD.

## Why this matters

Databases do many small writes. SD cards wear out much faster than SSDs and are
more likely to corrupt under power loss.

Recommended order for reliability:

1. Boot-from-USB SSD (best)
2. OS on SD + DATA_DIR on USB SSD
3. Everything on SD (last resort)

## Filesystem requirements

Use Linux filesystem for Postgres data (`pgdata`):

- Recommended: `ext4`
- Avoid for `pgdata`: `NTFS`, `exFAT`, SMB shares

Reason: Postgres expects POSIX file semantics and reliable fsync behavior.

## Set DATA_DIR in .env

Example:

```env
DATA_DIR=/mnt/smooth-family
```

Then ensure directories exist:

```sh
mkdir -p /mnt/smooth-family/pgdata /mnt/smooth-family/media
```

## Mount a USB SSD with nofail (Pi/Linux)

Find the disk UUID:

```sh
sudo blkid
```

Add an `/etc/fstab` entry (example):

```fstab
UUID=1234-ABCD  /mnt/smooth-family  ext4  defaults,nofail,x-systemd.device-timeout=10  0  2
```

Notes:

- `nofail` allows boot to continue if the USB disk is temporarily missing.
- Use a stable mount path; changing path later requires migration.

## Migrate existing data

Use the helper script from the repo root:

```sh
./scripts/move-data.sh --dry-run
./scripts/move-data.sh --to /mnt/smooth-family
```

The script can migrate:

- legacy named volumes -> `DATA_DIR`
- old `DATA_DIR` path -> new `DATA_DIR` path

It stops containers, copies data, updates `.env`, then starts the stack.

## Docker Desktop note

On Docker Desktop (Windows/Mac), host paths are VM-shared mounts and IO
behavior differs from native Linux. For always-on production, Raspberry Pi or
Linux host with direct ext4 storage is strongly recommended.
