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

set -a
source "${ENV_FILE}"
set +a

THRESHOLD="${DISK_ALERT_THRESHOLD_PERCENT:-85}"
ALERT_STATE_DIR="${ALERT_STATE_DIR:-/opt/telegram-retail/state/alerts}"
STATE_FILE="${ALERT_STATE_DIR}/disk-usage.state"

mkdir -p "${ALERT_STATE_DIR}"

USAGE="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
DETAILS="$(df -h / | tail -n 1)"

if (( USAGE < THRESHOLD )); then
  if [[ -f "${STATE_FILE}" ]]; then
    "${ALERT_SCRIPT}" "Disk usage recovered" "Host: $(hostname)
Current usage: ${USAGE}%

${DETAILS}" || true
    rm -f "${STATE_FILE}"
  fi
  exit 0
fi

if [[ ! -f "${STATE_FILE}" ]]; then
  printf 'failed\n' > "${STATE_FILE}"
  "${ALERT_SCRIPT}" "Disk usage high" "Host: $(hostname)
Threshold: ${THRESHOLD}%
Current usage: ${USAGE}%

${DETAILS}" || true
fi

exit 1

