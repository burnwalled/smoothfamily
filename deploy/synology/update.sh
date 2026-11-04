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
# these four services' official images, and Smooth Family's own two by digest, can be chosen. The versions in use are kept in
# DATA_DIR/updates/pins and written as docker-compose.override.yml, which compose reads by itself.
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
OVERRIDE="${OVERRIDE_FILE:-docker-compose.override.yml}"
mkdir -p "$U"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# --- 1. What runs now: each service's image and its version variable (nothing else of its env) ---
{
	printf '{"checked_at": "%s", "services": {' "$(now)"
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
} > "$U/state.json.tmp" && mv "$U/state.json.tmp" "$U/state.json"

# --- 2. A planned update whose time has come -----------------------------------------------------
[ -f "$U/plan.env" ] || exit 0
RUN_ID=$(sed -n 's/^RUN_ID=\([0-9a-f]\{12\}\)$/\1/p' "$U/plan.env")
NOT_BEFORE=$(sed -n 's/^NOT_BEFORE=\([0-9]\{1,12\}\)$/\1/p' "$U/plan.env")
PULL=$(sed -n 's/^PULL="\(.*\)"$/\1/p' "$U/plan.env")
if [ -z "$RUN_ID" ] || [ -z "$NOT_BEFORE" ] || [ -z "$PULL" ]; then
	echo "plan.env is not valid – ignored"
	exit 1
fi
[ "$(sed -n 's/^RUN_ID=//p' "$U/result.env" 2> /dev/null)" = "$RUN_ID" ] && exit 0
[ "$(date +%s)" -ge "$NOT_BEFORE" ] || exit 0

result() {
	printf 'RUN_ID=%s\nOK=%s\nAT=%s\nMESSAGE=%s\n' "$RUN_ID" "$1" "$(now)" "$2" > "$U/result.env"
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

# A pins line the override may carry: one of the stack's services, with its own official image. The
# folder is the app's (it writes plan.env there), so this script – running as root – trusts no line it
# hasn't checked itself.
PIN_RE='^(db=postgres|redis=redis|caddy=caddy|searxng=searxng/searxng):[A-Za-z0-9._-]{1,64}$|^(backend|frontend)=ghcr\.io/burnwalled/smoothfamily-(backend|frontend)@sha256:[0-9a-f]{64}$'
keep_valid_pins() {
	grep -E "$PIN_RE" "$U/pins" > "$U/pins.tmp" 2> /dev/null || true
	mv "$U/pins.tmp" "$U/pins"
}

write_override() {
	keep_valid_pins
	{
		echo "# Written by update.sh (Server settings → Updates) – the versions in use."
		echo 'version: "2.4"'
		echo "services:"
		while IFS='=' read -r svc image; do
			[ -n "$svc" ] && printf '  %s:\n    image: %s\n' "$svc" "$image"
		done < "$U/pins"
	} > "$OVERRIDE"
}

touch "$U/pins"
keep_valid_pins
cp "$U/pins" "$U/pins.before"
for image in $PULL; do
	if ! echo "$image" | grep -Eq '^((postgres|redis|caddy|searxng/searxng):[A-Za-z0-9._-]{1,64}|ghcr\.io/burnwalled/smoothfamily-(backend|frontend)@sha256:[0-9a-f]{64})$'; then
		result 0 "Not an allowed image: $image"
		exit 1
	fi
	svc=$(service_of "$image")
	if ! docker pull -q "$image" > /dev/null; then
		result 0 "Could not download $image"
		exit 1
	fi
	grep -v "^$svc=" "$U/pins" > "$U/pins.tmp"
	echo "$svc=$image" >> "$U/pins.tmp"
	mv "$U/pins.tmp" "$U/pins"
done

if ! $COMPOSE exec -T backend python -m app.cli backup; then
	cp "$U/pins.before" "$U/pins"
	result 0 "The backup before the update failed – nothing was changed"
	exit 1
fi

# Smooth Family's own images may change the database on start (its migrations). The database as it
# was is kept, to be put back if the new version doesn't come up.
DB_BEFORE=""
case "$PULL" in
	*smoothfamily-backend@*)
		DB_BEFORE="$U/db-before-update.dump"
		REVISION_BEFORE=$($COMPOSE exec -T db psql -U smooth -d smoothfamily -tAc 'select version_num from alembic_version' 2> /dev/null | tr -d '[:space:]')
		if ! $COMPOSE exec -T db pg_dump -U smooth -d smoothfamily -Fc > "$DB_BEFORE"; then
			cp "$U/pins.before" "$U/pins"
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
		cp "$U/pins.before" "$U/pins"
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
