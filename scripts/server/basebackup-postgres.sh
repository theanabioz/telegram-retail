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
BACKUP_ROOT="${BACKUP_ROOT:-/opt/telegram-retail/backups}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

POSTGRES_USER="${POSTGRES_USER:-telegram_retail}"
BASEBACKUP_RETENTION_DAYS="${BASEBACKUP_RETENTION_DAYS:-7}"
WAL_RETENTION_DAYS="${WAL_RETENTION_DAYS:-7}"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BASE_DIR="${BACKUP_ROOT}/base/base_${STAMP}"

mkdir -p "${BACKUP_ROOT}/base"

echo "==> Waiting for postgres-backup container"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres postgres-backup >/dev/null

echo "==> Creating base backup at ${BASE_DIR}"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc "rm -rf '/backups/base/base_${STAMP}' && mkdir -p '/backups/base/base_${STAMP}' && pg_basebackup -U '${POSTGRES_USER}' -D '/backups/base/base_${STAMP}' -Fp -Xs -P"

echo "==> Pruning old base backups and WAL files"
find "${BACKUP_ROOT}/base" -mindepth 1 -maxdepth 1 -type d -mtime +"${BASEBACKUP_RETENTION_DAYS}" -exec rm -rf {} +
find "${BACKUP_ROOT}/wal" -type f -mtime +"${WAL_RETENTION_DAYS}" -delete

echo "Base backup written to ${BASE_DIR}"
