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

OFFSITE_BACKUP_ENABLED="${OFFSITE_BACKUP_ENABLED:-false}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/telegram-retail/backups}"
APP_DOMAIN="${APP_DOMAIN:-telegram-retail}"

if [[ "${OFFSITE_BACKUP_ENABLED}" != "true" ]]; then
  echo "Offsite backup sync is disabled."
  exit 0
fi

: "${OFFSITE_S3_ENDPOINT:?OFFSITE_S3_ENDPOINT is required}"
: "${OFFSITE_S3_BUCKET:?OFFSITE_S3_BUCKET is required}"
: "${OFFSITE_AWS_ACCESS_KEY_ID:?OFFSITE_AWS_ACCESS_KEY_ID is required}"
: "${OFFSITE_AWS_SECRET_ACCESS_KEY:?OFFSITE_AWS_SECRET_ACCESS_KEY is required}"

OFFSITE_S3_REGION="${OFFSITE_S3_REGION:-us-east-1}"
OFFSITE_S3_PREFIX="${OFFSITE_S3_PREFIX:-telegram-retail}"
TARGET_URI="s3://${OFFSITE_S3_BUCKET}/${OFFSITE_S3_PREFIX}/${APP_DOMAIN}/"

docker run --rm \
  -e AWS_ACCESS_KEY_ID="${OFFSITE_AWS_ACCESS_KEY_ID}" \
  -e AWS_SECRET_ACCESS_KEY="${OFFSITE_AWS_SECRET_ACCESS_KEY}" \
  -e AWS_DEFAULT_REGION="${OFFSITE_S3_REGION}" \
  -v "${BACKUP_ROOT}:/backups:ro" \
  amazon/aws-cli:2.17.44 \
  s3 sync /backups "${TARGET_URI}" \
  --endpoint-url "${OFFSITE_S3_ENDPOINT}" \
  --only-show-errors

echo "Offsite backup sync completed to ${TARGET_URI}"
