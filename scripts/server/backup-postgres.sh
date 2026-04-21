#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.server"
BACKUP_DIR="${BACKUP_DIR:-/opt/telegram-retail/backups/manual}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"

stamp="$(date +%Y-%m-%d_%H-%M-%S)"
target="${BACKUP_DIR}/postgres_${stamp}.sql.gz"

docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.server.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-telegram_retail}" "${POSTGRES_DB:-telegram_retail}" | gzip > "${target}"

echo "Backup written to ${target}"
