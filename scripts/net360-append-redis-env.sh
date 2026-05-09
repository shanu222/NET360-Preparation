#!/usr/bin/env bash
#
# Append Redis Cloud variables to .env on the API server (secrets NOT stored in git).
#
# Usage (on EC2, from repo root — set password in the shell, not in the file):
#
#   cd /root/NET360-Preparation
#   export REDIS_PASSWORD='your-redis-cloud-password'
#   bash scripts/net360-append-redis-env.sh
#
# Optional overrides:
#   REDIS_HOST=... REDIS_PORT=11326 REDIS_USERNAME=default REDIS_PASSWORD='...' \
#     bash scripts/net360-append-redis-env.sh
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"

REDIS_HOST="${REDIS_HOST:-redis-11326.crce292.ap-south-1-2.ec2.cloud.redislabs.com}"
REDIS_PORT="${REDIS_PORT:-11326}"
REDIS_USERNAME="${REDIS_USERNAME:-default}"

if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  echo "ERROR: Set REDIS_PASSWORD in the environment (do not commit it)."
  echo "  export REDIS_PASSWORD='...'"
  echo "  bash scripts/net360-append-redis-env.sh"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: Missing ${ENV_FILE}"
  exit 1
fi

# Avoid duplicating block if host already present
if grep -qE '^REDIS_HOST=' "${ENV_FILE}" 2>/dev/null; then
  echo "WARN: ${ENV_FILE} already has REDIS_HOST. Edit the file by hand or remove old REDIS_* lines first."
  exit 1
fi

{
  echo ""
  echo "# Redis Cloud (Socket.IO adapter + cache — added $(date -u +%Y-%m-%d)Z)"
  echo "REDIS_HOST=${REDIS_HOST}"
  echo "REDIS_PORT=${REDIS_PORT}"
  echo "REDIS_USERNAME=${REDIS_USERNAME}"
  echo "REDIS_PASSWORD=${REDIS_PASSWORD}"
} >> "${ENV_FILE}"

echo "Appended Redis settings to ${ENV_FILE}"
echo "Restart API: pm2 restart backend --update-env && pm2 logs backend --lines 30"
