#!/bin/sh
# Move Smooth Family data safely between storage locations.
# Supports both:
# 1) legacy named volumes -> DATA_DIR bind mounts
# 2) old DATA_DIR -> new DATA_DIR
# Linux/Pi host script. Docker Desktop users typically do not need this.
set -e

cd "$(dirname "$0")/.."

usage() {
  cat <<EOF
Usage: ./scripts/move-data.sh [--to <path>] [--dry-run]

Options:
  --to <path>   Target DATA_DIR path (default: DATA_DIR from .env, else ./data)
  --dry-run     Print actions without making changes
  -h, --help    Show help
EOF
}

DRY_RUN=0
TARGET_ARG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --to)
      TARGET_ARG="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ ! -f .env ]; then
  echo "Missing .env in project root. Run install first."
  exit 1
fi

CURRENT_DATA_DIR=$(grep '^DATA_DIR=' .env | cut -d= -f2- || true)
if [ -z "$CURRENT_DATA_DIR" ]; then
  CURRENT_DATA_DIR="./data"
fi

TARGET_DATA_DIR=${TARGET_ARG:-$CURRENT_DATA_DIR}

PROJECT_NAME=$(basename "$(pwd)")
VOL_PG_1="${PROJECT_NAME}_pgdata"
VOL_MEDIA_1="${PROJECT_NAME}_mediadata"
VOL_PG_2="$(echo "$PROJECT_NAME" | tr '-' '_')_pgdata"
VOL_MEDIA_2="$(echo "$PROJECT_NAME" | tr '-' '_')_mediadata"

find_volume() {
  if docker volume inspect "$1" >/dev/null 2>&1; then
    echo "$1"
    return 0
  fi
  return 1
}

PG_VOLUME=""
MEDIA_VOLUME=""

if [ -d "$CURRENT_DATA_DIR/pgdata" ] || [ -d "$CURRENT_DATA_DIR/media" ]; then
  SOURCE_MODE="bind"
else
  SOURCE_MODE="volume"
  PG_VOLUME=$(find_volume "$VOL_PG_1" || find_volume "$VOL_PG_2" || true)
  MEDIA_VOLUME=$(find_volume "$VOL_MEDIA_1" || find_volume "$VOL_MEDIA_2" || true)
  if [ -z "$PG_VOLUME" ] || [ -z "$MEDIA_VOLUME" ]; then
    echo "Could not locate source named volumes for pgdata/mediadata."
    echo "Tried: $VOL_PG_1, $VOL_PG_2 and $VOL_MEDIA_1, $VOL_MEDIA_2"
    exit 1
  fi
fi

log() {
  echo "[move-data] $*"
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY-RUN: $*"
  else
    sh -c "$*"
  fi
}

log "Source mode: $SOURCE_MODE"
log "Current DATA_DIR: $CURRENT_DATA_DIR"
log "Target DATA_DIR: $TARGET_DATA_DIR"

run "mkdir -p \"$TARGET_DATA_DIR/pgdata\" \"$TARGET_DATA_DIR/media\""

log "Stopping stack..."
run "docker compose stop"

if [ "$SOURCE_MODE" = "bind" ]; then
  log "Copying from existing bind mount directory with rsync..."
  run "rsync -aHAX --delete \"$CURRENT_DATA_DIR/pgdata/\" \"$TARGET_DATA_DIR/pgdata/\""
  run "rsync -aHAX --delete \"$CURRENT_DATA_DIR/media/\" \"$TARGET_DATA_DIR/media/\""
else
  log "Copying from legacy named volumes with rsync inside a helper container..."
  run "docker run --rm -v \"$PG_VOLUME:/from:ro\" -v \"$TARGET_DATA_DIR/pgdata:/to\" alpine sh -c 'apk add --no-cache rsync >/dev/null && rsync -a /from/ /to/'"
  run "docker run --rm -v \"$MEDIA_VOLUME:/from:ro\" -v \"$TARGET_DATA_DIR/media:/to\" alpine sh -c 'apk add --no-cache rsync >/dev/null && rsync -a /from/ /to/'"
fi

log "Updating DATA_DIR in .env..."
if grep -q '^DATA_DIR=' .env; then
  run "sed -i 's#^DATA_DIR=.*#DATA_DIR=$TARGET_DATA_DIR#' .env"
else
  run "printf '\nDATA_DIR=%s\n' \"$TARGET_DATA_DIR\" >> .env"
fi

log "Starting stack..."
run "docker compose up -d"

log "Verifying db health and media file count..."
run "docker compose ps"
run "find \"$TARGET_DATA_DIR/media\" -type f | wc -l"

log "Done."
if [ "$DRY_RUN" -eq 1 ]; then
  log "No changes were applied (dry-run)."
fi
