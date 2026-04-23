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
  echo ".env.server is missing, skipping Telegram menu button update." >&2
  exit 0
fi

set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

if [[ -z "${BOT_TOKEN:-}" || -z "${APP_DOMAIN:-}" ]]; then
  echo "BOT_TOKEN or APP_DOMAIN is missing, skipping Telegram menu button update." >&2
  exit 0
fi

curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
  -d 'menu_button={"type":"default"}' \
  >/dev/null

curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/deleteMyCommands" >/dev/null

echo "Telegram bot menu button reset to default"
echo "Telegram bot commands removed"
