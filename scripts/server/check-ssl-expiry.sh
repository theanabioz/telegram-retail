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

APP_DOMAIN="${APP_DOMAIN:?APP_DOMAIN is required}"
THRESHOLD_DAYS="${SSL_ALERT_THRESHOLD_DAYS:-14}"
ALERT_STATE_DIR="${ALERT_STATE_DIR:-/opt/telegram-retail/state/alerts}"
STATE_FILE="${ALERT_STATE_DIR}/ssl-expiry.state"

mkdir -p "${ALERT_STATE_DIR}"

EXPIRY_RAW="$(echo | openssl s_client -servername "${APP_DOMAIN}" -connect "${APP_DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2-)"
if [[ -z "${EXPIRY_RAW}" ]]; then
  "${ALERT_SCRIPT}" "SSL check failed" "Host: $(hostname)
Domain: ${APP_DOMAIN}

Could not read certificate expiry." || true
  exit 1
fi

DAYS_LEFT="$(EXPIRY_RAW="${EXPIRY_RAW}" python3 - <<'PY'
from datetime import datetime, timezone
import email.utils
import os

expiry_raw = os.environ["EXPIRY_RAW"]
expiry_dt = email.utils.parsedate_to_datetime(expiry_raw)
if expiry_dt.tzinfo is None:
    expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)

now_dt = datetime.now(timezone.utc)
delta = expiry_dt - now_dt
print(max(0, delta.days))
PY
)"

if (( DAYS_LEFT > THRESHOLD_DAYS )); then
  if [[ -f "${STATE_FILE}" ]]; then
    "${ALERT_SCRIPT}" "SSL expiry recovered" "Host: $(hostname)
Domain: ${APP_DOMAIN}
Days left: ${DAYS_LEFT}
Expiry: ${EXPIRY_RAW}" || true
    rm -f "${STATE_FILE}"
  fi
  exit 0
fi

if [[ ! -f "${STATE_FILE}" ]]; then
  printf 'failed\n' > "${STATE_FILE}"
  "${ALERT_SCRIPT}" "SSL expires soon" "Host: $(hostname)
Domain: ${APP_DOMAIN}
Days left: ${DAYS_LEFT}
Expiry: ${EXPIRY_RAW}" || true
fi

exit 1
