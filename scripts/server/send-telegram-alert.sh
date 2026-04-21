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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.server is missing." >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <title> <message>" >&2
  exit 1
fi

TITLE="$1"
MESSAGE="$2"

set -a
source "${ENV_FILE}"
set +a

BOT_TOKEN="${BOT_TOKEN:-}"
TELEGRAM_ALERT_CHAT_IDS="${TELEGRAM_ALERT_CHAT_IDS:-}"

if [[ -z "${BOT_TOKEN}" || -z "${TELEGRAM_ALERT_CHAT_IDS}" ]]; then
  echo "Telegram alerts are not configured." >&2
  exit 1
fi

TEXT="🚨 ${TITLE}"$'\n'"${MESSAGE}"

IFS=',' read -r -a CHAT_IDS <<< "${TELEGRAM_ALERT_CHAT_IDS}"
JSON_PAYLOAD="$(TITLE="${TITLE}" MESSAGE="${MESSAGE}" python3 - <<'PY'
import json
import os

text = f"🚨 {os.environ['TITLE']}\n{os.environ['MESSAGE']}"
print(json.dumps({
    "text": text,
    "disable_web_page_preview": True,
    "disable_notification": True,
}))
PY
)"

for CHAT_ID in "${CHAT_IDS[@]}"; do
  CHAT_ID_TRIMMED="$(echo "${CHAT_ID}" | xargs)"
  [[ -z "${CHAT_ID_TRIMMED}" ]] && continue

  CHAT_PAYLOAD="$(CHAT_ID="${CHAT_ID_TRIMMED}" JSON_PAYLOAD="${JSON_PAYLOAD}" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["JSON_PAYLOAD"])
payload["chat_id"] = os.environ["CHAT_ID"]
print(json.dumps(payload))
PY
)"

  curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    -d "${CHAT_PAYLOAD}" >/dev/null
done
