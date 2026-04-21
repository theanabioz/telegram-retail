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
source "${ROOT_DIR}/scripts/server/load-env.sh"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

load_env_file "${ENV_FILE}"

POSTGRES_DB="${POSTGRES_DB:-telegram_retail}"
POSTGRES_USER="${POSTGRES_USER:-telegram_retail}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/telegram-retail/backups}"
BASE_BACKUP_DIR="${1:-$(ls -1dt "${BACKUP_ROOT}"/base/base_* 2>/dev/null | head -n 1 || true)}"
RECOVERY_TARGET_TIME="${2:-}"
DRILL_ROOT="/opt/telegram-retail/pitr-drill"
DRILL_NAME="telegram-retail-postgres-drill"
DRILL_PORT="${DRILL_PORT:-55432}"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
DRILL_DATA_DIR="${DRILL_ROOT}/${STAMP}"

if [[ -z "${BASE_BACKUP_DIR}" || ! -d "${BASE_BACKUP_DIR}" ]]; then
  echo "Base backup directory not found. Pass it explicitly as the first argument." >&2
  exit 1
fi

cleanup() {
  docker rm -f "${DRILL_NAME}" >/dev/null 2>&1 || true
  rm -rf "${DRILL_DATA_DIR}"
}

KEEP_FAILED_DRILL="${KEEP_FAILED_DRILL:-false}"
DOCKER_RM_FLAG="--rm"

if [[ "${KEEP_FAILED_DRILL}" == "true" ]]; then
  DOCKER_RM_FLAG=""
fi

cleanup_on_exit() {
  status=$?
  if [[ ${status} -ne 0 && "${KEEP_FAILED_DRILL}" == "true" ]]; then
    echo "==> Drill failed; preserving temp container/data for inspection"
    echo "    container: ${DRILL_NAME}"
    echo "    data dir: ${DRILL_DATA_DIR}"
    exit ${status}
  fi

  cleanup
  exit ${status}
}

trap cleanup_on_exit EXIT

mkdir -p "${DRILL_ROOT}"

echo "==> Preparing PITR drill from ${BASE_BACKUP_DIR}"
rm -rf "${DRILL_DATA_DIR}"
mkdir -p "${DRILL_DATA_DIR}"
cp -a "${BASE_BACKUP_DIR}/." "${DRILL_DATA_DIR}/"
chown -R 70:70 "${DRILL_DATA_DIR}"

cat >> "${DRILL_DATA_DIR}/postgresql.auto.conf" <<EOF
restore_command = 'cp /wal-archive/%f %p'
recovery_target_action = 'promote'
EOF

if [[ -n "${RECOVERY_TARGET_TIME}" ]]; then
  cat >> "${DRILL_DATA_DIR}/postgresql.auto.conf" <<EOF
recovery_target_time = '${RECOVERY_TARGET_TIME}'
EOF
else
  cat >> "${DRILL_DATA_DIR}/postgresql.auto.conf" <<EOF
recovery_target = 'immediate'
EOF
fi
touch "${DRILL_DATA_DIR}/recovery.signal"
chown 70:70 "${DRILL_DATA_DIR}/postgresql.auto.conf" "${DRILL_DATA_DIR}/recovery.signal"

echo "==> Starting temporary recovery instance on localhost:${DRILL_PORT}"
docker run -d ${DOCKER_RM_FLAG} \
  --name "${DRILL_NAME}" \
  -p "127.0.0.1:${DRILL_PORT}:5432" \
  -v "${DRILL_DATA_DIR}:/var/lib/postgresql/data" \
  -v "${BACKUP_ROOT}/wal:/wal-archive:ro" \
  postgres:16-alpine >/dev/null

echo "==> Waiting for temporary instance"
for _ in $(seq 1 60); do
  if docker exec "${DRILL_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker exec "${DRILL_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
  echo "Temporary PITR instance did not become ready" >&2
  docker logs "${DRILL_NAME}" >&2 || true
  exit 1
fi

echo "==> Verifying recovery state"
docker exec "${DRILL_NAME}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 <<'SQL'
select current_timestamp as drill_time_utc;
select pg_is_in_recovery() as still_in_recovery;
select count(*) as users_count from public.users;
select count(*) as stores_count from public.stores;
select count(*) as products_count from public.products;
SQL

echo "==> PITR drill succeeded"
echo "    base backup: ${BASE_BACKUP_DIR}"
echo "    target: ${RECOVERY_TARGET_TIME:-immediate}"
echo "    temp data dir: ${DRILL_DATA_DIR}"
