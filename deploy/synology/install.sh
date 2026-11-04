#!/bin/sh
# Install or upgrade Smooth Family on a Synology NAS. Run as root over SSH
# from the release folder (the one containing images.tar.gz):
#
#   sudo sh install.sh
#
# First run: creates .env with generated secrets, creates the data folders,
# loads the images and starts the stack. Later runs (new release): loads the
# new images, bumps APP_VERSION and restarts – data and secrets are kept.
set -e
cd "$(dirname "$0")"
# Synology installs docker/docker-compose in /usr/local/bin, which sudo's PATH lacks.
PATH="/usr/local/bin:$PATH"

if docker compose version > /dev/null 2>&1; then
	COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
	COMPOSE="docker-compose"
else
	echo "docker-compose not found – install the Docker package in Package Center first."
	exit 1
fi

# Files copied from Windows may have CRLF line endings; a trailing \r would
# become part of every value (an "empty" password that isn't empty).
for f in .env .env.example docker-compose.yml Caddyfile searxng.yml update.sh VERSION; do
	if [ -f "$f" ]; then
		sed -i 's/\r$//' "$f"
	fi
done

VERSION=$(cat VERSION)

# Random hex string of $1 bytes. openssl isn't always usable on DSM (e.g.
# under sudo), so fall back to /dev/urandom.
random_hex() {
	value=$(openssl rand -hex "$1" 2>/dev/null || true)
	if [ "${#value}" -ne $(($1 * 2)) ]; then
		value=$(head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n')
	fi
	echo "$value"
}

# Fill a KEY= line that is still empty (fresh .env, or an earlier failed run).
fill_secret() {
	if grep -q "^$1=\$" .env; then
		sed -i "s/^$1=\$/$1=$(random_hex "$2")/" .env
	fi
}

if [ ! -f .env ]; then
	# DOMAIN can be given as an environment variable for unattended installs.
	if [ -z "$DOMAIN" ]; then
		printf "Public domain for Smooth Family (e.g. family.example.com): "
		read -r DOMAIN
	fi
	case "$DOMAIN" in
		*.*) ;;
		*) echo "That doesn't look like a domain name."; exit 1 ;;
	esac
	echo "Creating .env with generated secrets..."
	sed -e "s/^DOMAIN=$/DOMAIN=$DOMAIN/" \
		-e "s#^DATA_DIR=\$#DATA_DIR=$(pwd)/data#" \
		.env.example > .env
	chmod 600 .env
	CREATED_ENV=1
fi

fill_secret SECRET_KEY 32
fill_secret POSTGRES_PASSWORD 16
fill_secret SETUP_CODE 6
# Older installs (before 2.8.4) have no SEARXNG_SECRET line yet.
grep -q '^SEARXNG_SECRET=' .env || echo "SEARXNG_SECRET=" >> .env
fill_secret SEARXNG_SECRET 32
for key in DOMAIN DATA_DIR SECRET_KEY POSTGRES_PASSWORD; do
	if ! grep -q "^$key=[^[:space:]]" .env; then
		echo "$key is empty in .env – fill it in and run this script again."
		exit 1
	fi
done
if [ -n "$CREATED_ENV" ]; then
	echo "Done. Save a copy of .env in your password manager."
fi

# Keep APP_VERSION in step with the release being installed.
grep -q "^APP_VERSION=" .env || echo "APP_VERSION=" >> .env
sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" .env

# Memory settings sized from this machine's RAM. Only written when missing, so
# values tuned by hand in .env survive upgrades (and older installs get them).
if ! grep -q '^MEMORY_PROFILE=' .env; then
	RAM_MB=$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)
	if [ "$RAM_MB" -lt 2048 ]; then
		PROFILE=small PG_SHARED_BUFFERS=64MB PG_EFFECTIVE_CACHE_SIZE=192MB PG_WORK_MEM=4MB
		PG_MAINTENANCE_WORK_MEM=32MB NODE_MAX_OLD_SPACE_MB=160 REDIS_MAXMEMORY=48mb
	else
		PROFILE=standard PG_SHARED_BUFFERS=256MB PG_EFFECTIVE_CACHE_SIZE=1GB PG_WORK_MEM=8MB
		PG_MAINTENANCE_WORK_MEM=64MB NODE_MAX_OLD_SPACE_MB=512 REDIS_MAXMEMORY=128mb
	fi
	{
		echo ""
		echo "# Memory profile chosen by install.sh for ${RAM_MB} MB RAM (small < 2 GB, else standard)."
		echo "# Edit the values to tune; delete MEMORY_PROFILE to let install.sh pick again."
		echo "MEMORY_PROFILE=$PROFILE"
		echo "PG_SHARED_BUFFERS=$PG_SHARED_BUFFERS"
		echo "PG_EFFECTIVE_CACHE_SIZE=$PG_EFFECTIVE_CACHE_SIZE"
		echo "PG_WORK_MEM=$PG_WORK_MEM"
		echo "PG_MAINTENANCE_WORK_MEM=$PG_MAINTENANCE_WORK_MEM"
		echo "NODE_MAX_OLD_SPACE_MB=$NODE_MAX_OLD_SPACE_MB"
		echo "REDIS_MAXMEMORY=$REDIS_MAXMEMORY"
	} >> .env
	echo "Memory profile: $PROFILE ($RAM_MB MB RAM)"
fi

DATA_DIR=$(grep '^DATA_DIR=' .env | cut -d= -f2-)
mkdir -p "$DATA_DIR/pgdata" "$DATA_DIR/media" "$DATA_DIR/redis" "$DATA_DIR/caddy/data" "$DATA_DIR/caddy/config" "$DATA_DIR/backup"
# Since 2.9.0 the backend runs as user 10001, not root: it owns the media and the backups.
mkdir -p "$DATA_DIR/updates"
chown -R 10001:10001 "$DATA_DIR/media" "$DATA_DIR/backup" "$DATA_DIR/updates"
# Redis runs as its own user (999) since 3.0.0.
chown -R 999:999 "$DATA_DIR/redis"

# Nobody else on the NAS reads the data or changes the scripts that run as root (2.9.0). A shared
# folder's Synology ACL lets every user read and the administrators group – where package users
# like Plex can end up – write; it's removed here, and plain owner-only modes set instead.
# The folder stays its uploader's, so a new release can be copied in as before.
HERE=$(pwd)
if [ -x /usr/syno/bin/synoacltool ]; then
	find "$HERE" "$DATA_DIR" -path "$DATA_DIR/pgdata" -prune -o -print | while read -r p; do
		# Fails (harmlessly) on a path that has no ACL – which must not stop the install.
		/usr/syno/bin/synoacltool -del "$p" > /dev/null 2>&1 || true
	done
fi
chmod 700 "$DATA_DIR"
find "$HERE" -path "$DATA_DIR" -prune -o -type d -exec chmod 700 {} +
find "$HERE" -path "$DATA_DIR" -prune -o -type f -exec chmod 644 {} +
chmod 600 .env
chown root:root "$DATA_DIR"
for d in media backup updates caddy redis; do
	find "$DATA_DIR/$d" -type d -exec chmod 700 {} +
	find "$DATA_DIR/$d" -type f -exec chmod 600 {} +
done

if [ -f images.tar.gz ]; then
	echo "Loading images (version $VERSION)..."
	gunzip -c images.tar.gz | docker load
else
	# No images in the folder (3.3.0): the same release from GitHub's registry.
	echo "Downloading images (version $VERSION)..."
	for part in backend frontend; do
		docker pull "ghcr.io/burnwalled/smoothfamily-$part:$VERSION"
		docker tag "ghcr.io/burnwalled/smoothfamily-$part:$VERSION" "smooth-family-$part:$VERSION"
	done
fi

# A release installed by hand replaces Smooth Family's own images pinned by an earlier update from
# the app (update.sh); the other services keep theirs.
PINS="$DATA_DIR/updates/pins"
if [ -f "$PINS" ] && grep -Eq '^(backend|frontend)=' "$PINS"; then
	grep -Ev '^(backend|frontend)=' "$PINS" > "$PINS.tmp" || true
	mv "$PINS.tmp" "$PINS"
	# Only lines that fit (the folder is the app's): the same rule as update.sh.
	grep -E '^(db=postgres|redis=redis|caddy=caddy|searxng=searxng/searxng):[A-Za-z0-9._-]{1,64}$|^(backend|frontend)=ghcr\.io/burnwalled/smoothfamily-(backend|frontend)@sha256:[0-9a-f]{64}$' "$PINS" > "$PINS.tmp" 2> /dev/null || true
	mv "$PINS.tmp" "$PINS"
	{
		echo "# Written by update.sh (Server settings → Updates) – the versions in use."
		echo 'version: "2.4"'
		echo "services:"
		while IFS='=' read -r svc image; do
			[ -n "$svc" ] && printf '  %s:\n    image: %s\n' "$svc" "$image"
		done < "$PINS"
	} > docker-compose.override.yml
fi

echo "Starting Smooth Family..."
$COMPOSE up -d

# Wait for the API (first start runs the database migrations – slow on a NAS).
printf "Waiting for the backend"
i=0
until $COMPOSE exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" > /dev/null 2>&1; do
	i=$((i + 1))
	if [ "$i" -ge 60 ]; then
		echo ""
		echo "The backend did not start within 3 minutes. Last log lines:"
		$COMPOSE logs --tail 40 backend
		exit 1
	fi
	printf "."
	sleep 3
done
echo " ok"

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2-)
echo ""
echo "Smooth Family $VERSION is running."
echo "  Logs:   $COMPOSE logs -f backend caddy"
echo "  Open:   https://$DOMAIN  (after the router forwards WAN 443 -> this NAS:$(grep '^HTTPS_PORT=' .env | cut -d= -f2-))"
if grep -q '^SETUP_CODE=.\+' .env; then
	echo "  Setup code for creating the family: $(grep '^SETUP_CODE=' .env | cut -d= -f2-)"
fi
