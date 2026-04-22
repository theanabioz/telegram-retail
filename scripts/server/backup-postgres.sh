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
BACKUP_DIR="${BACKUP_DIR:-/opt/telegram-retail/backups/manual}"
source "${ROOT_DIR}/scripts/server/load-env.sh"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

load_env_file "${ENV_FILE}"

mkdir -p "${BACKUP_DIR}"

stamp="$(date +%Y-%m-%d_%H-%M-%S)"
target="${BACKUP_DIR}/postgres_${stamp}.sql.gz"
tmp_target="${target}.tmp"

cleanup() {
  rm -f "${tmp_target}"
}
trap cleanup EXIT

docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-telegram_retail}" "${POSTGRES_DB:-telegram_retail}" | gzip > "${tmp_target}"

mv "${tmp_target}" "${target}"
trap - EXIT

echo "Backup written to ${target}"
