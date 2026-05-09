#!/usr/bin/env bash
# Copy this file to your API machine (EC2/VPS), edit paths, then run:
#   bash net360-on-api-server.sh
#
set -euo pipefail

# ---- EDIT THESE ----
REPO_DIR="${REPO_DIR:-$HOME/NET360-Preparation}"   # where git repo lives on server
PM2_APP="${PM2_APP:-net360-api}"                   # pm2 process name, or "all"
# ---------------------

cd "${REPO_DIR}"

echo "== git pull =="
git pull

echo "== npm ci (production deps) =="
npm ci --omit=dev

echo "== nginx config test (if installed) =="
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx && echo "nginx reloaded" || true
else
  echo "nginx not in PATH — skip"
fi

echo "== pm2 restart =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "${PM2_APP}" --update-env || pm2 restart all --update-env
  pm2 logs --lines 30
else
  echo "pm2 not in PATH — restart your Node service manually"
fi

echo "Done."
