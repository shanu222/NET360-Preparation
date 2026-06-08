#!/usr/bin/env bash
# One-time NET360 API production host setup (run on EC2 as root).
#
# Configures:
#   - log directories
#   - PM2 startup on reboot (systemd)
#   - PM2 log rotation (pm2-logrotate)
#   - optional CloudWatch Agent
#
# Usage:
#   cd /root/NET360-Preparation
#   sudo bash scripts/setup-pm2-production.sh

#   DRY_RUN=1         print actions only (no system changes)

set -euo pipefail

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] setup-pm2-production.sh — no changes will be made"
fi

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
LOG_DIR="${NET360_LOG_DIR:-${REPO_DIR}/logs}"
BACKUP_DIR="${NET360_BACKUP_DIR:-/var/backups/net360}"
PM2_USER="${PM2_USER:-root}"
INSTALL_CLOUDWATCH="${INSTALL_CLOUDWATCH:-0}"

cd "${REPO_DIR}"

echo "== NET360 production host setup =="
echo "repo=${REPO_DIR}"
echo "logs=${LOG_DIR}"
echo "backups=${BACKUP_DIR}"

mkdir -p "${LOG_DIR}"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would mkdir -p ${BACKUP_DIR}"
else
  mkdir -p "${BACKUP_DIR}"
fi
if [[ "${DRY_RUN:-0}" != "1" ]]; then
  chmod 750 "${LOG_DIR}" "${BACKUP_DIR}" || true
else
  echo "[DRY_RUN] would chmod 750 ${LOG_DIR} ${BACKUP_DIR}"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Install Node 20+ first."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "== Installing PM2 globally =="
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] would run: npm install -g pm2"
  else
    npm install -g pm2
  fi
fi

echo "== PM2 log rotation =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would configure pm2-logrotate (max_size 20M, retain 14, compress true)"
elif ! pm2 module:list 2>/dev/null | grep -q pm2-logrotate; then
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 20M
  pm2 set pm2-logrotate:retain 14
  pm2 set pm2-logrotate:compress true
  pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
  pm2 set pm2-logrotate:workerInterval 3600
else
  pm2 set pm2-logrotate:max_size 20M
  pm2 set pm2-logrotate:retain 14
  pm2 set pm2-logrotate:compress true
  pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
  pm2 set pm2-logrotate:workerInterval 3600
fi

echo "== PM2 startup on reboot =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run: pm2 startup systemd -u ${PM2_USER} --hp /${PM2_USER}"
  echo "[DRY_RUN] Amazon Linux 2023 uses systemd + dnf; no manual unit file edit required"
else
  STARTUP_CMD="$(pm2 startup systemd -u "${PM2_USER}" --hp "/${PM2_USER}" 2>&1 | grep -E '^sudo env' || true)"
  if [[ -n "${STARTUP_CMD}" ]]; then
    eval "${STARTUP_CMD}"
  fi
fi

if [[ -f "${REPO_DIR}/deploy/systemd/pm2-net360.service" ]]; then
  echo "Reference unit file: deploy/systemd/pm2-net360.service"
  echo "PM2 startup is managed via 'pm2 startup' + 'pm2 save' (recommended)."
fi

echo "== Start / reload NET360 API via ecosystem.config.cjs =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run: pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"
else
  pm2 startOrReload "${REPO_DIR}/ecosystem.config.cjs" --update-env
  pm2 save
fi

echo "== Health cron (optional) =="
CRON_FILE="/etc/cron.d/net360-health"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would write ${CRON_FILE}"
else
  cat > "${CRON_FILE}" <<EOF
# NET360 PM2 + API health monitor (every 5 minutes)
*/5 * * * * root NET360_LOG_DIR=${LOG_DIR} REPO_DIR=${REPO_DIR} bash ${REPO_DIR}/scripts/pm2-health-monitor.sh >> ${LOG_DIR}/health-monitor.log 2>&1
EOF
  chmod 644 "${CRON_FILE}"
  echo "Installed ${CRON_FILE}"
fi

echo "== Daily MongoDB backup cron (optional — requires MONGODB_URI in .env) =="
BACKUP_CRON="/etc/cron.d/net360-backup"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would write ${BACKUP_CRON}"
else
  cat > "${BACKUP_CRON}" <<EOF
# NET360 MongoDB backup daily at 02:15 UTC
15 2 * * * root REPO_DIR=${REPO_DIR} NET360_BACKUP_DIR=${BACKUP_DIR} bash ${REPO_DIR}/scripts/mongodb-backup-daily.sh >> ${LOG_DIR}/backup.log 2>&1
EOF
  chmod 644 "${BACKUP_CRON}"
  echo "Installed ${BACKUP_CRON}"
fi

if [[ "${INSTALL_CLOUDWATCH}" == "1" ]]; then
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] would run deploy/cloudwatch/install-cloudwatch-agent.sh"
  else
    bash "${REPO_DIR}/deploy/cloudwatch/install-cloudwatch-agent.sh"
  fi
fi

echo ""
echo "Setup complete."
echo "  pm2 list"
echo "  pm2 logs net360-api --lines 50"
echo "  curl -sS http://127.0.0.1:5000/api/health | jq ."
echo "  curl -sS http://127.0.0.1:5000/api/version | jq ."
