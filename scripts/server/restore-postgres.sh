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
source "${ROOT_DIR}/scripts/server/load-env.sh"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file.sql.gz|backup-file.sql> [--yes]" >&2
  exit 1
fi

BACKUP_FILE="$1"
CONFIRM_FLAG="${2:-}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ "${CONFIRM_FLAG}" != "--yes" ]]; then
  echo "Restore is destructive for the self-hosted Postgres database." >&2
  echo "Re-run with --yes to continue." >&2
  exit 1
fi

load_env_file "${ENV_FILE}"

POSTGRES_DB="${POSTGRES_DB:-telegram_retail}"
POSTGRES_USER="${POSTGRES_USER:-telegram_retail}"

echo "==> Waiting for postgres container"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres >/dev/null
until docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Resetting public schema in ${POSTGRES_DB}"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "==> Restoring ${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  gzip -dc "${BACKUP_FILE}" | docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1
else
  cat "${BACKUP_FILE}" | docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1
fi

echo "Restore completed successfully."
