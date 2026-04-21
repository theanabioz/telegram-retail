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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <state-key> <title> <command...>" >&2
  exit 1
fi

STATE_KEY="$1"
TITLE="$2"
shift 2

set -a
source "${ENV_FILE}"
set +a

ALERT_STATE_DIR="${ALERT_STATE_DIR:-/opt/telegram-retail/state/alerts}"
STATE_FILE="${ALERT_STATE_DIR}/${STATE_KEY}.state"
LOG_DIR="${ALERT_STATE_DIR}/logs"
LOG_FILE="${LOG_DIR}/${STATE_KEY}.log"

mkdir -p "${ALERT_STATE_DIR}" "${LOG_DIR}"

set +e
"$@" >"${LOG_FILE}" 2>&1
STATUS=$?
set -e

if [[ ${STATUS} -eq 0 ]]; then
  if [[ -f "${STATE_FILE}" ]]; then
    "${ALERT_SCRIPT}" "${TITLE} recovered" "$(printf 'Job succeeded again on %s.\n\nLast successful command:\n%s' "$(hostname)" "$*")" || true
    rm -f "${STATE_FILE}"
  fi
  exit 0
fi

if [[ ! -f "${STATE_FILE}" ]]; then
  printf 'failed\n' > "${STATE_FILE}"
  TAIL_OUTPUT="$(tail -n 40 "${LOG_FILE}" 2>/dev/null || true)"
  "${ALERT_SCRIPT}" "${TITLE} failed" "$(printf 'Host: %s\nCommand: %s\nExit code: %s\n\nLast log lines:\n%s' "$(hostname)" "$*" "${STATUS}" "${TAIL_OUTPUT}")" || true
fi

exit ${STATUS}

