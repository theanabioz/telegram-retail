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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <base-backup-dir> <recovery-target-time> [--yes]" >&2
  echo "Example: $0 /opt/telegram-retail/backups/base/base_2026-04-21_18-00-00 '2026-04-21 18:17:00+01' --yes" >&2
  exit 1
fi

BASE_BACKUP_DIR="$1"
RECOVERY_TARGET_TIME="$2"
CONFIRM_FLAG="${3:-}"

if [[ ! -d "${BASE_BACKUP_DIR}" ]]; then
  echo "Base backup directory not found: ${BASE_BACKUP_DIR}" >&2
  exit 1
fi

if [[ "${CONFIRM_FLAG}" != "--yes" ]]; then
  echo "PITR restore is destructive for the self-hosted Postgres data directory." >&2
  echo "Re-run with --yes to continue." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

echo "==> Stopping app containers"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" stop frontend backend postgres-backup postgres >/dev/null

DATA_VOLUME="$(docker inspect telegram-retail-postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"

if [[ -z "${DATA_VOLUME}" ]]; then
  echo "Could not determine postgres data volume" >&2
  exit 1
fi

echo "==> Restoring base backup ${BASE_BACKUP_DIR} into volume ${DATA_VOLUME}"
docker run --rm \
  -v "${DATA_VOLUME}:/var/lib/postgresql/data" \
  -v "${BASE_BACKUP_DIR}:/base:ro" \
  alpine:3.20 \
  sh -lc '
    rm -rf /var/lib/postgresql/data/* /var/lib/postgresql/data/.[!.]* /var/lib/postgresql/data/..?* 2>/dev/null || true
    cp -a /base/. /var/lib/postgresql/data/
    chown -R 70:70 /var/lib/postgresql/data
  '

echo "==> Writing recovery configuration"
docker run --rm \
  -v "${DATA_VOLUME}:/var/lib/postgresql/data" \
  alpine:3.20 \
  sh -lc "
    touch /var/lib/postgresql/data/recovery.signal
    cat >> /var/lib/postgresql/data/postgresql.auto.conf <<'EOF'
restore_command = 'cp /var/lib/postgresql/wal-archive/%f %p'
recovery_target_time = '${RECOVERY_TARGET_TIME}'
recovery_target_action = 'promote'
EOF
    chown 70:70 /var/lib/postgresql/data/recovery.signal /var/lib/postgresql/data/postgresql.auto.conf
  "

echo "==> Starting postgres in recovery mode"
docker compose --profile selfhosted-db --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres >/dev/null

echo "==> Wait for postgres to promote, then bring app containers back"
echo "Run after verification:"
echo "  docker compose --profile selfhosted-db --env-file ${ENV_FILE} -f ${COMPOSE_FILE} up -d backend frontend postgres-backup"

