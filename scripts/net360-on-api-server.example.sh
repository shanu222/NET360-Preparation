#!/usr/bin/env bash
#
# Run on the EC2/API machine from the repo root (after git pull):
#   cd /root/NET360-Preparation    # or your path
#   bash scripts/net360-on-api-server.example.sh
#
# Your PM2 names are usually `backend` and `frontend` — not `net360-api`.
# If you accidentally started a duplicate `net360-api`, remove it:
#   pm2 delete net360-api
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
# Comma-separated PM2 names, or "all"
PM2_APPS="${PM2_APPS:-all}"

cd "${REPO_DIR}"

echo "== repo: ${REPO_DIR} =="

echo "== git pull =="
git pull

echo "== npm ci (full deps for build validation) =="
npm ci

echo "== build validation (abort restart on failure) =="
npm run build

echo "== server syntax validation (abort restart on failure) =="
node --check server/index.js

echo "== npm ci (production deps only) =="
npm ci --omit=dev

if [[ ! -f node_modules/serve/build/main.js ]] && [[ ! -f node_modules/serve/package.json ]]; then
  echo "ERROR: 'serve' not installed. Use latest package.json (serve must be in dependencies) and run again."
  exit 1
fi

if [[ ! -d dist ]] || [[ ! -f dist/index.html ]]; then
  echo "ERROR: dist/ missing after build validation. Aborting before PM2 restart."
  exit 1
fi

echo "== Redis placeholder check (.env) =="
if grep -q 'your-redis-host' .env 2>/dev/null; then
  echo "WARN: REDIS_HOST (or REDIS_URL) still looks like a placeholder 'your-redis-host'."
  echo "  Fix: set real Redis host, or clear REDIS_URL/REDIS_HOST to run without Redis (cache/socket scale limited)."
fi

echo "== nginx =="
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx && echo "nginx reloaded" || true
else
  echo "nginx not in PATH — skip"
fi

echo "== pm2 restart (${PM2_APPS}) =="
if command -v pm2 >/dev/null 2>&1; then
  if [[ "${PM2_APPS}" == "all" ]]; then
    pm2 restart all --update-env
  else
    IFS=',' read -ra APPS <<< "${PM2_APPS}"
    for a in "${APPS[@]}"; do
      [[ -n "${a// }" ]] && pm2 restart "${a// }" --update-env || true
    done
  fi
  pm2 save || true
  echo "== pm2 status =="
  pm2 list
else
  echo "pm2 not in PATH"
fi

echo ""
echo "Done. Check logs: pm2 logs backend --lines 40"
echo "If 502 persists: ensure nginx proxy_pass port matches API_PORT (often 5000) and only ONE Node listens on it (pm2 delete any stray duplicate)."
