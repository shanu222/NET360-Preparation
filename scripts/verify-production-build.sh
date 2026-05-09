#!/usr/bin/env bash
# Run after git pull (or before deploy) to match CI/production build.
# Usage (Git Bash / WSL / Linux / macOS):
#   chmod +x scripts/verify-production-build.sh
#   ./scripts/verify-production-build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== NET360: npm ci =="
npm ci
echo "== NET360: production build =="
npm run build
echo "== OK: dist/ is ready to deploy; restart your Node process if applicable. =="
