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
ALERT_SCRIPT="${ROOT_DIR}/scripts/server/send-telegram-alert.sh"
source "${ROOT_DIR}/scripts/server/load-env.sh"

load_env_file "${ENV_FILE}"

APP_DOMAIN="${APP_DOMAIN:?APP_DOMAIN is required}"
ALERT_STATE_DIR="${ALERT_STATE_DIR:-/opt/telegram-retail/state/alerts}"
STATE_FILE="${ALERT_STATE_DIR}/public-health.state"

mkdir -p "${ALERT_STATE_DIR}"

set +e
RESPONSE="$(curl -fsS --max-time 10 "https://${APP_DOMAIN}/health" 2>&1)"
STATUS=$?
set -e

if [[ ${STATUS} -eq 0 ]]; then
  if [[ -f "${STATE_FILE}" ]]; then
    "${ALERT_SCRIPT}" "Public health recovered" "Host: $(hostname)
Domain: ${APP_DOMAIN}

Public /health responds again:
${RESPONSE}" || true
    rm -f "${STATE_FILE}"
  fi
  exit 0
fi

if [[ ! -f "${STATE_FILE}" ]]; then
  printf 'failed\n' > "${STATE_FILE}"
  "${ALERT_SCRIPT}" "Public health failed" "Host: $(hostname)
Domain: ${APP_DOMAIN}

GET https://${APP_DOMAIN}/health failed with:
${RESPONSE}" || true
fi

exit 1
