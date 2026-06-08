#!/usr/bin/env bash
# Roll back NET360 API to a previous git commit recorded during deploy.
#
# Usage:
#   bash scripts/rollback-api-production.sh [.deploy-rollback-YYYYMMDD-HHMMSS]
#
# If no tag file is given, uses the most recent .deploy-rollback-* file.

set -euo pipefail

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] rollback-api-production.sh — no changes will be made"
fi

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
PM2_APP="${PM2_APP:-net360-api}"
API_BASE="${API_BASE:-http://127.0.0.1:${API_PORT:-5000}}"

cd "${REPO_DIR}"

TAG_FILE="${1:-}"
if [[ -z "${TAG_FILE}" ]]; then
  TAG_FILE="$(ls -1t .deploy-rollback-* 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "${TAG_FILE}" ]] || [[ ! -f "${REPO_DIR}/${TAG_FILE}" ]]; then
  echo "ERROR: Rollback tag file not found."
  echo "Usage: bash scripts/rollback-api-production.sh .deploy-rollback-YYYYMMDD-HHMMSS"
  exit 1
fi

TARGET_COMMIT="$(tr -d '[:space:]' < "${REPO_DIR}/${TAG_FILE}")"
if [[ -z "${TARGET_COMMIT}" ]]; then
  echo "ERROR: Empty commit in ${TAG_FILE}"
  exit 1
fi

echo "== NET360 API rollback =="
echo "target=${TARGET_COMMIT} (from ${TAG_FILE})"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would: git fetch && git checkout ${TARGET_COMMIT}"
  echo "[DRY_RUN] would: write-build-info, npm ci, npm run build, node --check, npm ci --omit=dev"
  echo "[DRY_RUN] would: pm2 startOrReload && verify-post-deploy-routes.sh ${API_BASE}"
  echo "Rollback dry-run complete for ${TARGET_COMMIT}"
  exit 0
fi

git fetch origin
git checkout "${TARGET_COMMIT}"
bash "${REPO_DIR}/scripts/write-build-info.sh"

npm ci
npm run build
node --check server/index.js
npm ci --omit=dev

pm2 startOrReload "${REPO_DIR}/ecosystem.config.cjs" --update-env
pm2 save

sleep 5
bash "${REPO_DIR}/scripts/verify-post-deploy-routes.sh" "${API_BASE}"

echo "Rollback complete to ${TARGET_COMMIT}"
