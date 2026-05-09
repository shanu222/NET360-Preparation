#!/usr/bin/env bash
# NET360 — production frontend build & optional deploy (run from repo root on macOS/Linux or WSL).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== Install dependencies =="
npm ci

echo "== Vite production build (writes dist/version.json with fresh id) =="
npm run build

echo "== Done. dist/ is ready to upload or ship to Vercel."
echo ""
echo "Typical next steps:"
echo "  - Vercel (connected repo): git push origin main  # auto-build, or:"
echo "  - Vercel CLI: npx vercel --prod"
echo "  - EC2/static host: rsync -avz --delete dist/ user@host:/var/www/net360/"
echo ""
echo "After deploy, Vercel should serve index.html with short cache (see vercel.json headers)."
