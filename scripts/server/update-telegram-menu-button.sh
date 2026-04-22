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

asset_hash="$(
  docker exec telegram-retail-frontend sh -lc \
    "sed -n 's/.*src=\"\\/assets\\/index-\\([^\"]*\\)\\.js\".*/\\1/p' /srv/index.html | head -n 1" \
    2>/dev/null || true
)"

if [[ -z "${asset_hash}" ]]; then
  asset_hash="$(date +%Y%m%d%H%M%S)"
fi

asset_hash="$(printf '%s' "${asset_hash}" | tr '[:upper:]' '[:lower:]')"

app_url="https://${APP_DOMAIN}/app-v-${asset_hash}"

curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
  -d "menu_button={\"type\":\"web_app\",\"text\":\"Open\",\"web_app\":{\"url\":\"${app_url}\"}}" \
  >/dev/null

echo "Telegram menu button URL set to ${app_url}"
