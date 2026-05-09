#!/usr/bin/env bash
#
# Run this from your laptop (Git Bash / WSL / Linux / macOS) after:
#   - Vercel: VITE_API_URL=https://api.net360preparation.com  (you did this ✓)
#   - Redeploy Vercel frontend
#
# Usage:
#   cd /path/to/NET360-Preparation
#   bash scripts/net360-after-vercel-deploy.sh
#
# Optional 2nd arg = API base (default https://api.net360preparation.com)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

API_BASE="${1:-https://api.net360preparation.com}"
API_BASE="${API_BASE%/}"

FRONTEND_ORIGIN="${2:-https://www.net360preparation.com}"

echo "=========================================="
echo " NET360 — post-Vercel checks"
echo " API:     ${API_BASE}"
echo " Origin:  ${FRONTEND_ORIGIN} (browser)"
echo "=========================================="
echo ""

echo "---- Step A — CORS preflight (check headers yourself) ----"
echo "If you see TWO origins in one line (comma), Nginx is duplicating CORS."
echo ""
resp_headers="$(
  curl -sS -D - -o /dev/null \
    -X OPTIONS \
    -H "Origin: ${FRONTEND_ORIGIN}" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type" \
    "${API_BASE}/api/auth/login" || true
)"
echo "${resp_headers}" | tr -d '\r' | grep -i '^access-control' || echo "(no Access-Control-* lines — may still be ok for simple requests)"

echo ""
if echo "${resp_headers}" | tr -d '\r' | grep -qi 'access-control-allow-origin:.*,'; then
  echo "WARNING: Access-Control-Allow-Origin looks like it contains a comma — fix Nginx (see Step C below)."
else
  echo "OK: No obvious comma in Access-Control-Allow-Origin from this preflight."
fi

echo ""
echo "---- Step B — API smoke tests (plans + trial routes) ----"
bash "${ROOT}/scripts/verify-net360-api.sh" "${API_BASE}"

echo ""
echo "=========================================="
echo " Step C — ON YOUR API SERVER (SSH) — fix duplicate CORS"
echo "=========================================="
echo "Browsers fail if BOTH Nginx and Node set CORS. Pick ONE:"
echo ""
echo "  Option 1 (recommended): Nginx does NOT add any Access-Control-* for api."
echo "          Only Express (cors package) sets CORS. See:"
echo "          ${ROOT}/deploy/nginx-api-proxy.example.conf"
echo ""
echo "  After editing Nginx:"
echo "    sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  Option 2: In API .env set DISABLE_EXPRESS_CORS=true and set CORS only in Nginx (advanced)."
echo ""
echo "---- Step D — Pull latest API code & restart Node (on server) ----"
echo "  cd /path/to/app   # your clone on the server"
echo "  git pull"
echo "  npm ci --omit=dev   # or npm install --omit=dev"
echo "  pm2 restart all     # or: pm2 restart net360-api --update-env"
echo "  pm2 logs --lines 50"
echo ""
echo "Done."
