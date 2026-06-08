#!/usr/bin/env bash
# PM2 + API health monitor for cron (every 5 minutes).
# Logs issues to stdout; pair with CloudWatch Agent or email alerting.
#
# Usage:
#   bash scripts/pm2-health-monitor.sh

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
API_BASE="${API_BASE:-http://127.0.0.1:${API_PORT:-5000}}"
PM2_APP="${PM2_APP:-net360-api}"
LOG_PREFIX="[net360-health $(date -u +%Y-%m-%dT%H:%M:%SZ)]"

cd "${REPO_DIR}" 2>/dev/null || true

issues=0

if command -v pm2 >/dev/null 2>&1; then
  if ! pm2 describe "${PM2_APP}" >/dev/null 2>&1; then
    echo "${LOG_PREFIX} CRITICAL PM2 app '${PM2_APP}' not found"
    issues=$((issues + 1))
  else
    status="$(pm2 jlist 2>/dev/null | node -e "
      const apps = JSON.parse(require('fs').readFileSync(0,'utf8'));
      const app = apps.find(a => a.name === process.argv[1]);
      if (!app) { console.log('missing'); process.exit(0); }
      console.log(app.pm2_env.status || 'unknown');
    " "${PM2_APP}" 2>/dev/null || echo unknown)"
    if [[ "${status}" != "online" ]]; then
      echo "${LOG_PREFIX} CRITICAL PM2 '${PM2_APP}' status=${status} — attempting restart"
      pm2 restart "${PM2_APP}" --update-env || true
      pm2 save || true
      issues=$((issues + 1))
    fi
    restarts="$(pm2 jlist 2>/dev/null | node -e "
      const apps = JSON.parse(require('fs').readFileSync(0,'utf8'));
      const app = apps.find(a => a.name === process.argv[1]);
      console.log(app?.pm2_env?.restart_time ?? 0);
    " "${PM2_APP}" 2>/dev/null || echo 0)"
    if [[ "${restarts}" -gt 20 ]]; then
      echo "${LOG_PREFIX} WARN high restart count: ${restarts}"
      issues=$((issues + 1))
    fi
  fi
else
  echo "${LOG_PREFIX} WARN pm2 not in PATH"
  issues=$((issues + 1))
fi

health_code="$(curl -sS -m 10 -o /tmp/net360-hc.json -w '%{http_code}' "${API_BASE}/api/health" 2>/dev/null || echo 000)"
if [[ "${health_code}" != "200" ]]; then
  echo "${LOG_PREFIX} CRITICAL /api/health returned ${health_code}"
  issues=$((issues + 1))
else
  heap="$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/net360-hc.json','utf8')).process?.memoryMb?.heapUsed || 0" 2>/dev/null || echo 0)"
  if [[ "${heap}" -gt 700 ]]; then
    echo "${LOG_PREFIX} WARN high heap usage: ${heap}MB"
  fi
  mongo_connected="$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/net360-hc.json','utf8')).mongo?.connected" 2>/dev/null || echo false)"
  if [[ "${mongo_connected}" != "true" ]]; then
    echo "${LOG_PREFIX} WARN MongoDB not connected"
    issues=$((issues + 1))
  fi
fi

ready_code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "${API_BASE}/api/health/ready" 2>/dev/null || echo 000)"
if [[ "${ready_code}" != "200" ]]; then
  echo "${LOG_PREFIX} WARN /api/health/ready returned ${ready_code}"
fi

if [[ "${issues}" -eq 0 ]]; then
  echo "${LOG_PREFIX} OK"
fi

exit 0
