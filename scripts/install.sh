#!/bin/sh
# One-time install: creates .env with generated secrets and starts the stack.
set -e
cd "$(dirname "$0")/.."

if ! command -v docker > /dev/null; then
  echo "Docker is missing. Install it first: https://docs.docker.com/engine/install/"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Creating .env with generated secrets..."
  SECRET_KEY=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  SEARXNG_SECRET=$(openssl rand -hex 32)
  # Needed once, to create the family – so nobody else can claim a fresh install.
  SETUP_CODE=$(openssl rand -hex 6)
  echo ""
  echo "Choose where app data is stored (Postgres + media)."
  echo "Warning: databases wear out SD cards — prefer a USB SSD path on a Pi."
  printf "DATA_DIR [./data]: "
  read -r DATA_DIR || true
  DATA_DIR=${DATA_DIR:-./data}
  # The patterns are in single quotes: in double quotes the shell would read "$#" as a variable.
  sed -e 's/^SECRET_KEY=$/SECRET_KEY='"$SECRET_KEY"'/' \
      -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD='"$POSTGRES_PASSWORD"'/' \
      -e 's/^SEARXNG_SECRET=$/SEARXNG_SECRET='"$SEARXNG_SECRET"'/' \
      -e 's/^SETUP_CODE=$/SETUP_CODE='"$SETUP_CODE"'/' \
      -e 's#^DATA_DIR=.*$#DATA_DIR='"$DATA_DIR"'#' \
      .env.example | tr -d '\r' > .env
  echo "Done: .env created – keep a copy of it somewhere safe (a password manager)."
else
  echo ".env already exists – keeping it."
fi

echo "Building and starting Smooth Family (the first build takes 5-15 min on a Pi)..."
docker compose up -d --build

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
PORT=${PORT:-$(grep '^PORT=' .env | cut -d= -f2)}
echo ""
echo "✅ Smooth Family is now running."
echo "   Open http://${IP:-localhost}:${PORT:-3000} and create your family."
echo "   Setup code: $(grep '^SETUP_CODE=' .env | cut -d= -f2)"
