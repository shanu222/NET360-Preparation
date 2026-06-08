#!/usr/bin/env bash
#
# Legacy wrapper — use scripts/deploy-api-production.sh instead.
#
# Run on the EC2/API machine from the repo root:
#   cd /root/NET360-Preparation
#   bash scripts/net360-on-api-server.example.sh
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

echo "NOTE: This script delegates to scripts/deploy-api-production.sh"
echo "      See docs/ops/DEPLOYMENT-CHECKLIST.md for the full workflow."
bash "${REPO_DIR}/scripts/deploy-api-production.sh" "${DEPLOY_BRANCH}"
