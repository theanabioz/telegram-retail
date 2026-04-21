#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.server.yml"
ENV_FILE="${ROOT_DIR}/.env.server"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing. Copy .env.server.example first." >&2
  exit 1
fi

cd "${ROOT_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
