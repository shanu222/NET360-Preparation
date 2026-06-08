#!/usr/bin/env bash
# Automated NET360 API production deployment (run on EC2 from repo root).
#
# Usage:
#   cd /root/NET360-Preparation
#   bash scripts/deploy-api-production.sh [branch]
#
# Environment:
#   REPO_DIR          default /root/NET360-Preparation
#   DEPLOY_BRANCH     branch to checkout (default: main)
#   API_BASE          for post-deploy checks (default http://127.0.0.1:5000)
#   SKIP_GIT_PULL=1   skip git fetch/checkout
#   PM2_APP           default net360-api

set -euo pipefail

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] deploy-api-production.sh — no changes will be made"
fi

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
DEPLOY_BRANCH="${1:-${DEPLOY_BRANCH:-main}}"
API_BASE="${API_BASE:-http://127.0.0.1:${API_PORT:-5000}}"
PM2_APP="${PM2_APP:-net360-api}"
ROLLBACK_TAG=".deploy-rollback-$(date +%Y%m%d-%H%M%S)"

cd "${REPO_DIR}"

echo "== NET360 API deploy =="
echo "repo=${REPO_DIR} branch=${DEPLOY_BRANCH}"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  echo "== Recording rollback point =="
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] would write ${ROLLBACK_TAG} with $(git rev-parse HEAD)"
  else
    git rev-parse HEAD > "${REPO_DIR}/${ROLLBACK_TAG}"
    echo "Rollback tag file: ${ROLLBACK_TAG} ($(cat "${REPO_DIR}/${ROLLBACK_TAG}"))"
  fi

  echo "== git fetch + checkout ${DEPLOY_BRANCH} =="
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] would: git fetch origin && git checkout ${DEPLOY_BRANCH} && git pull --ff-only origin ${DEPLOY_BRANCH}"
  else
    git fetch origin
    git checkout "${DEPLOY_BRANCH}"
    git pull --ff-only origin "${DEPLOY_BRANCH}"
  fi
fi

echo "== write build info =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run scripts/write-build-info.sh"
else
  bash "${REPO_DIR}/scripts/write-build-info.sh"
fi

echo "== npm ci (build deps) =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run: npm ci"
else
  npm ci
fi

echo "== build validation =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run: npm run build"
else
  npm run build
fi

echo "== server syntax check =="
node --check server/index.js

echo "== npm ci (production deps) =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run: npm ci --omit=dev"
else
  npm ci --omit=dev
fi

if [[ "${DRY_RUN:-0}" != "1" ]]; then
  if [[ ! -d dist ]] || [[ ! -f dist/index.html ]]; then
    echo "ERROR: dist/ missing after build."
    exit 1
  fi
else
  echo "[DRY_RUN] would verify dist/index.html exists"
fi

echo "== nginx reload =="
if command -v nginx >/dev/null 2>&1; then
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] would run: sudo nginx -t && sudo systemctl reload nginx"
  else
    sudo nginx -t && sudo systemctl reload nginx
  fi
else
  echo "nginx not in PATH — skip"
fi

echo "== PM2 reload ${PM2_APP} =="
if ! command -v pm2 >/dev/null 2>&1; then
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] pm2 not in PATH — would fail on real deploy (expected on CI/dev without PM2)"
  else
    echo "ERROR: pm2 not installed. Run scripts/setup-pm2-production.sh first."
    exit 1
  fi
else
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[DRY_RUN] would run: pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"
  else
    pm2 startOrReload "${REPO_DIR}/ecosystem.config.cjs" --update-env
    pm2 save
  fi
fi

echo "== waiting for API readiness =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would poll ${API_BASE}/api/health/ready for up to 60s"
else
  ready=0
  for i in $(seq 1 30); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}/api/health/ready" || echo 000)"
    if [[ "${code}" == "200" ]]; then
      ready=1
      break
    fi
    sleep 2
  done

  if [[ "${ready}" != "1" ]]; then
    echo "WARN: /api/health/ready did not return 200 within 60s (Mongo may still be connecting)."
  fi
fi

echo "== post-deploy route verification =="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] would run: scripts/verify-post-deploy-routes.sh ${API_BASE}"
else
  bash "${REPO_DIR}/scripts/verify-post-deploy-routes.sh" "${API_BASE}"
fi

echo ""
echo "Deploy complete."
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "  [DRY_RUN] would print version from ${API_BASE}/api/version"
  echo "  rollback tag: ${ROLLBACK_TAG}"
else
  echo "  version: $(curl -sS "${API_BASE}/api/version" | tr -d '\n')"
  echo "  rollback: bash scripts/rollback-api-production.sh ${ROLLBACK_TAG}"
fi
