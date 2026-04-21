#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${BASH_SOURCE[0]}"
while [[ -h "${SOURCE_PATH}" ]]; do
  SOURCE_DIR="$(cd "$(dirname "${SOURCE_PATH}")" && pwd)"
  SOURCE_PATH="$(readlink "${SOURCE_PATH}")"
  [[ "${SOURCE_PATH}" != /* ]] && SOURCE_PATH="${SOURCE_DIR}/${SOURCE_PATH}"
done

ROOT_DIR="$(cd "$(dirname "${SOURCE_PATH}")/../.." && pwd)"
BIN_DIR="/usr/local/bin"
CRON_FILE="/etc/cron.d/telegram-retail-ops"
LEGACY_CRON_FILE="/etc/cron.d/telegram-retail-basebackup"

declare -a SCRIPTS=(
  "backup-postgres.sh:retail-backup-postgres"
  "basebackup-postgres.sh:retail-basebackup-postgres"
  "restore-postgres.sh:retail-restore-postgres"
  "pitr-restore-postgres.sh:retail-pitr-restore-postgres"
  "pitr-drill-postgres.sh:retail-pitr-drill-postgres"
  "send-telegram-alert.sh:retail-send-telegram-alert"
  "run-monitored-job.sh:retail-run-monitored-job"
  "check-backend-health.sh:retail-check-backend-health"
  "check-disk-usage.sh:retail-check-disk-usage"
  "check-ssl-expiry.sh:retail-check-ssl-expiry"
  "offsite-sync-backups.sh:retail-offsite-sync-backups"
  "bootstrap-cloudbeaver.sh:retail-bootstrap-cloudbeaver"
  "smoke-check.sh:retail-smoke"
  "deploy.sh:retail-deploy"
)

for entry in "${SCRIPTS[@]}"; do
  script_name="${entry%%:*}"
  link_name="${entry##*:}"
  chmod +x "${ROOT_DIR}/scripts/server/${script_name}"
  ln -sf "${ROOT_DIR}/scripts/server/${script_name}" "${BIN_DIR}/${link_name}"
done

cat > "${CRON_FILE}" <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

*/5 * * * * root retail-check-backend-health >> /var/log/telegram-retail-health.log 2>&1
*/15 * * * * root retail-check-disk-usage >> /var/log/telegram-retail-disk.log 2>&1
17 3 * * * root retail-check-ssl-expiry >> /var/log/telegram-retail-ssl.log 2>&1
0 3 * * * root retail-run-monitored-job sql-backup "SQL backup" retail-backup-postgres >> /var/log/telegram-retail-sql-backup.log 2>&1
10 3 * * * root retail-run-monitored-job base-backup "Base backup" retail-basebackup-postgres >> /var/log/telegram-retail-basebackup.log 2>&1
30 3 * * * root retail-run-monitored-job offsite-backup "Offsite backup sync" retail-offsite-sync-backups >> /var/log/telegram-retail-offsite.log 2>&1
EOF

chmod 0644 "${CRON_FILE}"
rm -f "${LEGACY_CRON_FILE}"
echo "Installed symlinks in ${BIN_DIR}"
echo "Installed cron config at ${CRON_FILE}"
