#!/bin/sh
# Updates of Postgres, Redis, Caddy and SearXNG (2.9.0) – and of Smooth Family itself (3.3.0) –
# planned in Server settings → Updates.
# Schedule it every hour in DSM: Control Panel → Task Scheduler → Create → Scheduled Task →
# User-defined script, user "root", repeat hourly:
#
#   sh /volumeN/docker/smooth-family/update.sh
#
# Each run writes what runs now (DATA_DIR/updates/state.json) for the app to compare with Docker Hub.
# When the app has planned an update (plan.env) and its time has come: the new images are pulled, a
# backup is made, the new versions start – and if they don't come up, the old ones are put back.
#
# The app never touches Docker; this script never runs anything from the app's files. Only a run id,
# a time and image names are read from plan.env, each checked against a strict pattern, and only
# these four services' official images, and Smooth Family's own two by digest, can be chosen.
#
# DATA_DIR/updates is the app's folder, so here it is only a letterbox (3.5.1): plan.env is taken in
# once, and only as a plain file; state.json and result.env are made elsewhere and moved in, which
# replaces whatever is there rather than writing through it. Everything this script keeps for itself
# – the versions in use (pins), the database as it was – is in DATA_DIR/updates-root, which only root
# reads. The versions in use are written as docker-compose.override.yml, which compose reads by itself.
set -u
cd "$(dirname "$0")"
# Synology installs docker/docker-compose in /usr/local/bin, which the task's PATH may lack.
PATH="/usr/local/bin:$PATH"

if docker compose version > /dev/null 2>&1; then
	COMPOSE="docker compose"
else
	COMPOSE="docker-compose"
fi

DATA_DIR=$(grep '^DATA_DIR=' .env | cut -d= -f2-)
U="${UPDATES_DIR:-$DATA_DIR/updates}"
R="${UPDATES_ROOT_DIR:-$DATA_DIR/updates-root}"
OVERRIDE="${OVERRIDE_FILE:-docker-compose.override.yml}"
# What this script can do, for the app to say when it is older than the app expects.
SCRIPT=2
mkdir -p "$U" "$R"
chown root:root "$R" 2> /dev/null
chmod 700 "$R"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# A plain file in the app's folder – not a link to somewhere else, a folder or a pipe.
plain() { [ -f "$1" ] && [ ! -L "$1" ]; }

# Into the app's folder: made here, then moved in. A move replaces a link; it doesn't follow it.
# A link or a folder by that name is taken away first (a move would go into a folder, also through a
# link to one), and where mv knows -T it never treats the name as a folder at all.
: > "$R/.t1"
if mv -T "$R/.t1" "$R/.t2" 2> /dev/null; then MV="mv -T -f"; else MV="mv -f"; fi
rm -f "$R/.t1" "$R/.t2"
publish() {
	chmod 644 "$R/$1"
	if [ -L "$U/$1" ] || [ -d "$U/$1" ]; then rm -rf "$U/$1"; fi
	$MV "$R/$1" "$U/$1"
}

# A pins line the override may carry: one of the stack's services, with its own official image.
PIN_RE='^(db=postgres|redis=redis|caddy=caddy|searxng=searxng/searxng):[A-Za-z0-9._-]{1,64}$|^(backend|frontend)=ghcr\.io/burnwalled/smoothfamily-(backend|frontend)@sha256:[0-9a-f]{64}$'

# Before 3.5.1 the pins were in the app's folder: the lines that fit are taken over once, and what
# this script used to leave there is cleared away.
if [ ! -f "$R/pins" ]; then
	if plain "$U/pins"; then
		head -c 4096 "$U/pins" | grep -E "$PIN_RE" > "$R/pins" 2> /dev/null || true
	else
		: > "$R/pins"
	fi
fi
rm -f "$U/pins" "$U/pins.tmp" "$U/pins.before" "$U/state.json.tmp" "$U/db-before-update.dump"

# --- 1. What runs now: each service's image and its version variable (nothing else of its env) ---
{
	printf '{"checked_at": "%s", "script": %s, "services": {' "$(now)" "$SCRIPT"
	first=1
	for svc in $($COMPOSE ps --services 2> /dev/null); do
		id=$($COMPOSE ps -q "$svc" 2> /dev/null | head -1)
		[ -n "$id" ] || continue
		image=$(docker inspect --format '{{.Config.Image}}' "$id")
		vars=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id")
		# Images without a version variable say it themselves.
		case "$svc" in
			redis) echo "$vars" | grep -q '^REDIS_VERSION=' || vars="REDIS_VERSION=$(docker exec "$id" redis-server --version 2> /dev/null | sed -n 's/.* v=\([0-9.]*\).*/\1/p')" ;;
			caddy) echo "$vars" | grep -q '^CADDY_VERSION=' || vars="CADDY_VERSION=$(docker exec "$id" caddy version 2> /dev/null | cut -d' ' -f1)" ;;
		esac
		env=$(echo "$vars" | grep -E '^(PG_VERSION|REDIS_VERSION|CADDY_VERSION|__SEARXNG_VERSION)=[A-Za-z0-9.+_-]+$' |
			sed 's/.*/"&"/' | paste -sd, -)
		[ $first -eq 1 ] || printf ','
		first=0
		printf '"%s": {"image": "%s", "env": [%s]}' "$svc" "$image" "$env"
	done
	printf '}}\n'
} > "$R/state.json" && publish state.json

# --- 2. A planned update whose time has come -----------------------------------------------------
# Taken in once, and read from the copy: the app can't change it under this run.
plain "$U/plan.env" || exit 0
head -c 4096 "$U/plan.env" > "$R/plan.env"
RUN_ID=$(sed -n 's/^RUN_ID=\([0-9a-f]\{12\}\)$/\1/p' "$R/plan.env" | head -1)
NOT_BEFORE=$(sed -n 's/^NOT_BEFORE=\([0-9]\{1,12\}\)$/\1/p' "$R/plan.env" | head -1)
PULL=$(sed -n 's/^PULL="\(.*\)"$/\1/p' "$R/plan.env" | head -1)
rm -f "$R/plan.env"
if [ -z "$RUN_ID" ] || [ -z "$NOT_BEFORE" ] || [ -z "$PULL" ]; then
	echo "plan.env is not valid – ignored"
	exit 1
fi
[ "$(cat "$R/done" 2> /dev/null)" = "$RUN_ID" ] && exit 0
[ "$(date +%s)" -ge "$NOT_BEFORE" ] || exit 0

# How the run went, for the app. The message is this script's own words and image names it has
# checked – never a line of the plan as it came.
result() {
	printf 'RUN_ID=%s\nOK=%s\nAT=%s\nMESSAGE=%s\n' "$RUN_ID" "$1" "$(now)" "$2" > "$R/result.env"
	publish result.env
	echo "$RUN_ID" > "$R/done"
	rm -f "$U/plan.env" "$U/plan.override.yml"
	echo "$2"
}

# The service an image belongs to – only these, only their official repositories.
service_of() {
	case "$1" in
		postgres:*) echo db ;;
		redis:*) echo redis ;;
		caddy:*) echo caddy ;;
		searxng/searxng:*) echo searxng ;;
		ghcr.io/burnwalled/smoothfamily-backend@*) echo backend ;;
		ghcr.io/burnwalled/smoothfamily-frontend@*) echo frontend ;;
	esac
}

# The pins are this script's own, but only lines that fit are ever written to the override.
keep_valid_pins() {
	grep -E "$PIN_RE" "$R/pins" > "$R/pins.tmp" 2> /dev/null || true
	mv "$R/pins.tmp" "$R/pins"
}

write_override() {
	keep_valid_pins
	{
		echo "# Written by update.sh (Server settings → Updates) – the versions in use."
		echo 'version: "2.4"'
		echo "services:"
		while IFS='=' read -r svc image; do
			[ -n "$svc" ] && printf '  %s:\n    image: %s\n' "$svc" "$image"
		done < "$R/pins"
	} > "$OVERRIDE"
}

keep_valid_pins
cp "$R/pins" "$R/pins.before"
# Every image is checked before any is fetched. No globbing: the words are the plan's.
set -f
for image in $PULL; do
	if ! echo "$image" | grep -Eq '^((postgres|redis|caddy|searxng/searxng):[A-Za-z0-9._-]{1,64}|ghcr\.io/burnwalled/smoothfamily-(backend|frontend)@sha256:[0-9a-f]{64})$'; then
		result 0 "The plan names an image that isn't allowed – nothing was changed"
		exit 1
	fi
done
for image in $PULL; do
	svc=$(service_of "$image")
	if ! docker pull -q "$image" > /dev/null; then
		cp "$R/pins.before" "$R/pins"
		result 0 "Could not download $image"
		exit 1
	fi
	grep -v "^$svc=" "$R/pins" > "$R/pins.tmp"
	echo "$svc=$image" >> "$R/pins.tmp"
	mv "$R/pins.tmp" "$R/pins"
done
set +f

if ! $COMPOSE exec -T backend python -m app.cli backup; then
	cp "$R/pins.before" "$R/pins"
	result 0 "The backup before the update failed – nothing was changed"
	exit 1
fi

# Smooth Family's own images may change the database on start (its migrations). The database as it
# was is kept, to be put back if the new version doesn't come up.
DB_BEFORE=""
case "$PULL" in
	*smoothfamily-backend@*)
		DB_BEFORE="$R/db-before-update.dump"
		REVISION_BEFORE=$($COMPOSE exec -T db psql -U smooth -d smoothfamily -tAc 'select version_num from alembic_version' 2> /dev/null | tr -d '[:space:]')
		if ! $COMPOSE exec -T db pg_dump -U smooth -d smoothfamily -Fc > "$DB_BEFORE"; then
			cp "$R/pins.before" "$R/pins"
			result 0 "The database couldn't be saved before the update – nothing was changed"
			exit 1
		fi
		;;
esac

[ -f "$OVERRIDE" ] && cp "$OVERRIDE" "$OVERRIDE.before"
write_override
$COMPOSE up -d

# Up again? Every container running (and healthy, where it has a health check), the backend
# reaching the database – and still so 20 seconds later, with no container restarted meanwhile:
# a container that keeps failing is "running" now and then between its restarts.
restarts() {
	for id in $($COMPOSE ps -q); do docker inspect --format '{{.RestartCount}}' "$id"; done | paste -sd, -
}
up_now() {
	for id in $($COMPOSE ps -q); do
		case "$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id")" in
			"running healthy" | "running none") ;;
			*) return 1 ;;
		esac
	done
	$COMPOSE exec -T backend python -m app.cli check > /dev/null 2>&1
}
healthy() {
	up_now || return 1
	before=$(restarts)
	sleep 20
	up_now && [ "$(restarts)" = "$before" ]
}
i=0
until healthy; do
	i=$((i + 1))
	if [ "$i" -ge 60 ]; then
		cp "$R/pins.before" "$R/pins"
		write_override
		# A new version that changed the database: the database as it was comes back with the old one.
		if [ -n "$DB_BEFORE" ]; then
			REVISION_NOW=$($COMPOSE exec -T db psql -U smooth -d smoothfamily -tAc 'select version_num from alembic_version' 2> /dev/null | tr -d '[:space:]')
			if [ "$REVISION_NOW" != "$REVISION_BEFORE" ]; then
				$COMPOSE stop backend frontend
				$COMPOSE exec -T db pg_restore -U smooth -d smoothfamily --clean --if-exists < "$DB_BEFORE"
			fi
			# The plain dump of the whole server isn't left behind.
			rm -f "$DB_BEFORE"
		fi
		$COMPOSE up -d
		result 0 "The new versions did not come up – the old ones are back ($PULL)"
		exit 1
	fi
	sleep 3
done
[ -z "$DB_BEFORE" ] || rm -f "$DB_BEFORE"
result 1 "Updated: $PULL"
