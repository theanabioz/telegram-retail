#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${BASH_SOURCE[0]}"
while [[ -h "${SOURCE_PATH}" ]]; do
  SOURCE_DIR="$(cd "$(dirname "${SOURCE_PATH}")" && pwd)"
  SOURCE_PATH="$(readlink "${SOURCE_PATH}")"
  [[ "${SOURCE_PATH}" != /* ]] && SOURCE_PATH="${SOURCE_DIR}/${SOURCE_PATH}"
done

ROOT_DIR="$(cd "$(dirname "${SOURCE_PATH}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.server.yml"
ENV_FILE="${ROOT_DIR}/.env.server"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing. Copy .env.server.example first." >&2
  exit 1
fi

cd "${ROOT_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" --profile selfhosted-db up -d --build
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" --profile selfhosted-db ps
