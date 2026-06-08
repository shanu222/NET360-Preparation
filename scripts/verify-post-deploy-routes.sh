#!/usr/bin/env bash
# Post-deploy route and health verification for NET360 API.
#
# Usage:
#   bash scripts/verify-post-deploy-routes.sh [API_BASE]
# Example:
#   bash scripts/verify-post-deploy-routes.sh https://api.net360preparation.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

API_BASE="${1:-http://127.0.0.1:5000}"
API_BASE="${API_BASE%/}"
EXPECTED_COMMIT="${EXPECTED_COMMIT:-}"

fail() {
  echo "FAIL: $*"
  exit 1
}

echo "== NET360 post-deploy verification: ${API_BASE} =="

echo "-- CORS preflight (auth + admin SPA headers) --"
bash "${SCRIPT_DIR}/verify-cors-preflight.sh" "${API_BASE}" "https://www.net360preparation.com"
bash "${SCRIPT_DIR}/verify-cors-preflight.sh" "${API_BASE}" "https://net360preparation.com"

echo "-- CORS static audit (source) --"
bash "${SCRIPT_DIR}/verify-cors-static-audit.sh"

echo ""
echo "-- GET /api/health (liveness) --"
health_code="$(curl -sS -o /tmp/net360-health.json -w '%{http_code}' "${API_BASE}/api/health")"
[[ "${health_code}" == "200" ]] || fail "/api/health returned ${health_code}"
grep -q '"status"' /tmp/net360-health.json || fail "/api/health missing status"
node -pe "const p=JSON.parse(require('fs').readFileSync('/tmp/net360-health.json','utf8')); if(p.status!=='ok') process.exit(1)" || fail "/api/health status not ok"
grep -q '"mongo"' /tmp/net360-health.json || fail "/api/health missing mongo block"
echo "OK (${health_code})"

echo "-- GET /api/health/ready (readiness) --"
ready_code="$(curl -sS -o /tmp/net360-ready.json -w '%{http_code}' "${API_BASE}/api/health/ready")"
if [[ "${ready_code}" != "200" ]]; then
  echo "WARN: /api/health/ready returned ${ready_code} (Mongo may be down or still connecting)"
else
  echo "OK (${ready_code})"
fi

echo "-- GET /api/version (deployment drift) --"
version_code="$(curl -sS -o /tmp/net360-version.json -w '%{http_code}' "${API_BASE}/api/version")"
[[ "${version_code}" == "200" ]] || fail "/api/version returned ${version_code}"
DEPLOYED_COMMIT="$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/net360-version.json','utf8')).commit || ''" 2>/dev/null || echo "")"
echo "deployed commit: ${DEPLOYED_COMMIT:-unknown}"
if [[ -n "${EXPECTED_COMMIT}" ]] && [[ "${DEPLOYED_COMMIT}" != "${EXPECTED_COMMIT}" ]]; then
  fail "deployment drift: expected ${EXPECTED_COMMIT}, got ${DEPLOYED_COMMIT}"
fi

echo "-- GET /api/subscriptions/plans --"
plans_code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}/api/subscriptions/plans")"
[[ "${plans_code}" == "200" ]] || fail "/api/subscriptions/plans returned ${plans_code}"
echo "OK (${plans_code})"

echo "-- GET /api/admin/support-chat/conversations (expect 401 without auth) --"
admin_code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}/api/admin/support-chat/conversations")"
if [[ "${admin_code}" == "404" ]]; then
  fail "/api/admin/support-chat/conversations returned 404 — route missing"
fi
echo "HTTP ${admin_code} (401/403 expected without token)"

echo "-- Admin user management routes exist (expect 401) --"
for route in \
  "/api/admin/subscriptions/management/users" \
  "/api/admin/users/search" \
  "/api/admin/users/all"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}${route}")"
  if [[ "${code}" == "404" ]]; then
    fail "${route} returned 404"
  fi
  echo "${route}: ${code}"
done

echo "-- Retired routes should NOT be used (410 if hit) --"
for route in \
  "/api/admin/signup-requests" \
  "/api/admin/password-recovery-requests" \
  "/api/admin/subscriptions/requests"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}${route}")"
  echo "${route}: ${code} (410 = intentionally retired)"
done

echo ""
echo "Post-deploy verification passed."
