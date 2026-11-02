# Production on a Synology NAS (DSM 6/7)

Smooth Family runs in the DSM **Docker** package (DSM 6) or **Container
Manager** (DSM 7.2), reachable from the internet over HTTPS on your own domain:

```
phone ──https──> family.example.com (CNAME → yourname.myds.me)
              ──> router: WAN 443 → NAS:8443
              ──> caddy (Let's Encrypt cert, security headers)
                    ├─ /api/* → backend:8000 (FastAPI)
                    └─ /*     → frontend:3000 (Next.js)
```

Images are built on a PC and copied over – a NAS is usually too small to build
the Next.js frontend.

## 0. Requirements and checks

- An Intel/AMD Synology model (DSM 6 has no Docker for ARM models).
- Docker package installed; SSH enabled (Control Panel → Terminal & SNMP).
- `sudo docker version` on the NAS. **Docker older than 20.10.0** (DSM 6.2
  package 18.09): update the Docker package first – current Alpine-based
  images fail on it. 20.10.3 (DSM 6.2.4) works: every image is Alpine/musl,
  which avoids the clone3 problem of Docker < 20.10.10 with newer glibc.
- 1 GB RAM is enough. `install.sh` reads the RAM and writes a memory profile
  to `.env`: **small** below 2 GB (Postgres 64 MB buffers, Node 160 MB,
  Redis 48 MB – tested on a DS412+, Atom D2700, 1 GB, DSM 6.2.4, Docker
  20.10.3) or **standard** otherwise (256 MB / 512 MB / 128 MB). Tune the
  values in `.env`; delete `MEMORY_PROFILE` to let `install.sh` choose again.
- DNS: `family.example.com  CNAME  yourname.myds.me` (or the UniFi DDNS name).

## 1. Build a release (on the PC)

```sh
sh scripts/build-release.sh 1.1.0
```

This creates `release/smooth-family-1.1.0/` with `images.tar.gz`,
`docker-compose.yml`, `Caddyfile`, `.env.example`, `install.sh`, `backup.sh`
and `VERSION`.

## 2. Install (on the NAS)

`/volumeN` below is the volume your `docker` shared folder is on – check with
`ls -d /volume*/docker` (e.g. `/volume2/docker`). Data is stored in
`smooth-family/data/` on that same volume.

1. Create the shared folder `docker` (if missing) and copy the **contents** of
   the release folder to `/volumeN/docker/smooth-family/` (File Station or
   `scp`).
2. Over SSH:
   ```sh
   cd /volumeN/docker/smooth-family
   sudo sh install.sh        # asks for the domain, generates .env, loads images, starts
   ```
3. **Save `.env` in your password manager.** `SECRET_KEY` encrypts the Home
   Assistant token and the GIPHY key; without it a restored backup can't use them.

## 3. Open the router and create the family

The order matters: the setup code protects the fresh install, but create the
family right away anyway.

1. UniFi: *Settings → Firewall & Security → Port Forwarding*: WAN TCP **443** →
   NAS LAN IP, port **8443**. Leave port 80 closed (the certificate is issued
   over 443 with TLS-ALPN). NAT hairpin is on by default, so the same address
   works on the home Wi-Fi.
2. Watch Caddy fetch the certificate: `sudo docker-compose logs -f caddy`
   (`certificate obtained successfully`).
3. Open `https://family.example.com`, enter the **setup code** printed by
   `install.sh` (also `SETUP_CODE` in `.env`), and create the family with your
   admin account and e-mail, and choose the sign-in security (passkeys,
   authenticator app). The e-mail is the contact address the push services
   (Apple, Google) require.
4. Optional hardening in UniFi: a GeoIP rule that only allows Sweden to the
   port forward.

Without a family yet, nobody without the setup code can create one. Once the
family exists, setup is permanently closed. Logins are throttled: 8 failed
attempts per username or 25 per IP within 15 minutes give HTTP 429.

## 4. Backups

**First make a backup key** (Server settings → Backups and moving → Backup key).
The key is made in your browser; the server only gets its public half, so it
can write backups but never read them. Save the key (`SFKEY-…`) in your
password manager or on paper – not on the NAS. Without it the backups can't be
opened; with it everything comes back, also on a new server.

Schedule `backup.sh` nightly: Control Panel → Task Scheduler → Create →
Scheduled Task → User-defined script, user **root**:

```sh
sh /volumeN/docker/smooth-family/backup.sh
```

It asks the app for a backup – the same as its own nightly schedule – into
`$DATA_DIR/backup`, and removes the ones older than the schedule's days. With a
backup key each backup is three sealed files (`*.sfenc`): the database, the
media and the server's secrets (`SECRET_KEY` …, needed to open the encrypted
parts of the database after a restore). Without a key they are not encrypted
and the script warns. `.env` is no longer copied next to the backups.

Point **Hyper Backup** at that folder for an off-site copy. Never back up
`pgdata` directly while the database runs.

**Check your key** now and then: Backup key → *Check my key*. It opens the
newest backup in your browser; the key is never sent to the server.

**Restore** – open the sealed files with the key, then follow
[BACKUP.md](BACKUP.md) (use `docker-compose` instead of `docker compose` on
DSM 6). The key is asked for, so it never lands in the shell's history:

```sh
sudo docker-compose exec backend python -m app.cli unseal \
  /data/backup/secrets-20261101-030000.env.sfenc /data/backup/secrets.env
sudo docker-compose exec backend python -m app.cli unseal \
  /data/backup/smoothfamily-20261101-030000.sql.gz.sfenc /data/backup/restore.sql.gz
sudo docker-compose exec backend python -m app.cli unseal \
  /data/backup/media-20261101-030000.tar.gz.sfenc /data/backup/media.tar.gz
```

Put `SECRET_KEY` from `secrets.env` into `.env` before starting the restored
server, and delete the opened files afterwards.

**A family's own key:** a family's admin can make a key of its own (Family
settings → Security and data). That family's backups are then sealed with it
too – not even the server admin can open them, and restoring one asks for the
family's key.

## Updates of the server's software

Postgres, Redis, Caddy and SearXNG get security fixes between Smooth Family's
releases. Schedule `update.sh` **every hour**: Control Panel → Task Scheduler →
Create → Scheduled Task → User-defined script, user **root**, repeat hourly:

```sh
sh /volumeN/docker/smooth-family/update.sh
```

It tells the app what runs; the app looks for newer versions in the same major
(never Postgres 16 → 17) that have been out for a week, and the server admin
chooses in Server settings → Updates whether they go in by themselves in a
weekly window or after approval. When it's time, `update.sh` pulls them, makes
a backup, starts them – and puts the old ones back if they don't come up. The
versions in use are kept in `docker-compose.override.yml` next to the compose
file (compose reads it by itself). The app never gets access to Docker: it only
writes which versions it wants, and `update.sh` checks every value.

## 5. Upgrading

```sh
sh scripts/build-release.sh 1.2.0     # on the PC
# copy the new release contents to /volumeN/docker/smooth-family (keeps .env and data/)
sudo sh backup.sh && sudo sh install.sh   # on the NAS – migrations run automatically
```

## Recipe search (SearXNG)

Since 2.8.4 the stack includes `searxng`, a self-hosted search engine used only
by the recipe search. It publishes no port – only the backend reaches it over
Docker's internal network – and is capped at `SEARXNG_MEMORY` (default 256m,
about 130 MB in use). `install.sh` generates `SEARXNG_SECRET`, also for older
installs. Nothing is searched until the server admin turns it on under
Server settings → Address and services; the image is pulled from Docker Hub on
the first `install.sh`.

## Sign-in security

At setup you choose whether **passkeys** are allowed and whether an
**authenticator app** (TOTP – Microsoft/Google Authenticator, 1Password …) is
off, optional or required for adults. Change it later under Family admin →
Security; each person manages their own passkeys/authenticator under Profile.
Both work fully offline – no external service is involved.

- Passkeys are bound to the domain they were made on. The server's address
  can be changed under Server settings → Address and services (it overrides
  `PUBLIC_URL` for every link the app hands out); passkeys made on the old
  domain keep working as long as that domain still reaches the server.
- Lost phone: an admin uses *Reset two-step* next to the member in Family admin.
- Locked-out admin (on the NAS):
  ```sh
  sudo docker-compose exec backend python -m app.cli reset-mfa <username>
  sudo docker-compose exec backend python -m app.cli reset-password <username> <new-password>
  ```

## Push notifications

Work once the site is served over HTTPS with the trusted certificate:
Android (Chrome) directly; iPhone (iOS 16.4+) after *Share → Add to Home
Screen*. Don't change the domain later – push subscriptions and the
home-screen app are tied to it.
