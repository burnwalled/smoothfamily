#!/bin/sh
# Browser tests (Playwright) against a throwaway stack: its own compose project, an empty
# database in tmpfs and port 3100, so dev and prod data are never touched.
#
#   sh scripts/e2e.sh                 build, start, test, tear down
#   KEEP=1 sh scripts/e2e.sh          leave the stack running afterwards (rerun the tests faster)
#   sh scripts/e2e.sh --project=phone  extra arguments go to `playwright test`
set -eu
cd "$(dirname "$0")/.."

export E2E_PORT="${E2E_PORT:-3100}"
export PORT="$E2E_PORT"
export POSTGRES_PASSWORD=e2e
export SECRET_KEY=e2e-only-not-a-secret-just-long-enough-for-hs256
export COOKIE_SECURE=false
export E2E_BASE_URL="http://localhost:$E2E_PORT"

compose() {
  docker compose -p sf-e2e -f docker-compose.yml -f e2e/docker-compose.e2e.yml "$@"
}

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

compose up -d --build --wait db redis backend frontend

(
  cd e2e
  [ -d node_modules ] || npm ci
  npx playwright test "$@"
)
