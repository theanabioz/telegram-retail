#!/usr/bin/env bash
set -euo pipefail

APP_DOMAIN="${1:-${APP_DOMAIN:-}}"

if [[ -z "${APP_DOMAIN}" ]]; then
  echo "Usage: $0 <domain>" >&2
  exit 1
fi

echo "==> /health"
curl -fsS "https://${APP_DOMAIN}/health"
echo

echo "==> Frontend"
curl -fsSI "https://${APP_DOMAIN}/"
echo

echo "==> Auth route"
status="$(curl -sS -o /tmp/telegram-retail-auth-check.out -w '%{http_code}' "https://${APP_DOMAIN}/auth/me" || true)"
echo "GET /auth/me -> ${status}"
rm -f /tmp/telegram-retail-auth-check.out
