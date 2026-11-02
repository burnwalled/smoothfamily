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
  echo ""
  echo "Choose where app data is stored (Postgres + media)."
  echo "Warning: databases wear out SD cards — prefer a USB SSD path on a Pi."
  printf "DATA_DIR [./data]: "
  read -r DATA_DIR
  DATA_DIR=${DATA_DIR:-./data}
  sed -e "s/^SECRET_KEY=$/SECRET_KEY=$SECRET_KEY/" \
      -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" \
      -e "s#^DATA_DIR=.*$#DATA_DIR=$DATA_DIR#" \
      .env.example > .env
  echo "Done: .env created."
else
  echo ".env already exists – keeping it."
fi

echo "Building and starting Smooth Family (the first build on a Pi takes 5-15 min)..."
docker compose up -d --build

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "✅ Smooth Family is now running."
echo "   Open http://${IP:-<your-pi-ip>}:$(grep '^PORT=' .env | cut -d= -f2) and create your family."
