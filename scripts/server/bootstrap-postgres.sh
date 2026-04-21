#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${BASH_SOURCE[0]}"
while [[ -h "${SOURCE_PATH}" ]]; do
  SOURCE_DIR="$(cd "$(dirname "${SOURCE_PATH}")" && pwd)"
  SOURCE_PATH="$(readlink "${SOURCE_PATH}")"
  [[ "${SOURCE_PATH}" != /* ]] && SOURCE_PATH="${SOURCE_DIR}/${SOURCE_PATH}"
done

ROOT_DIR="$(cd "$(dirname "${SOURCE_PATH}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.server"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.server.yml"
MIGRATIONS_DIR="${ROOT_DIR}/supabase/migrations"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

POSTGRES_DB="${POSTGRES_DB:-telegram_retail}"
POSTGRES_USER="${POSTGRES_USER:-telegram_retail}"

mkdir -p /opt/telegram-retail/backups/manual /opt/telegram-retail/backups/base /opt/telegram-retail/backups/wal
chown -R 70:70 /opt/telegram-retail/backups

echo "==> Starting self-hosted postgres profile"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres postgres-backup >/dev/null

echo "==> Waiting for postgres"
until docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Applying schema migrations"
find "${MIGRATIONS_DIR}" -maxdepth 1 -type f -name '*.sql' | sort | while read -r file; do
  echo "---- $(basename "${file}")"
  docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${file}"
done

echo "==> PostgreSQL bootstrap completed"
echo "    DB: ${POSTGRES_DB}"
echo "    User: ${POSTGRES_USER}"
echo "    WAL archive: /opt/telegram-retail/backups/wal"
