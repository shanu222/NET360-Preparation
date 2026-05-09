#!/usr/bin/env bash
# NET360 API / trial / community smoke checks (run on your machine or CI after deploy).
# Usage: bash scripts/verify-net360-api.sh [API_BASE]
# Example: bash scripts/verify-net360-api.sh https://api.net360preparation.com

set -euo pipefail

API_BASE="${1:-https://api.net360preparation.com}"
API_BASE="${API_BASE%/}"

echo "== NET360 API checks against ${API_BASE} =="

echo ""
echo "-- Public: subscription plans (expect 200) --"
curl -sS -o /dev/null -w "%{http_code}\n" "${API_BASE}/api/subscriptions/plans" | tee /tmp/net360_plans.code
code="$(cat /tmp/net360_plans.code)"
if [[ "${code}" != "200" ]]; then
  echo "FAIL: plans returned ${code}"
  exit 1
fi

echo ""
echo "-- Protected: subscriptions/me (expect 401 without auth) --"
curl -sS -o /dev/null -w "%{http_code}\n" "${API_BASE}/api/subscriptions/me" | tee /tmp/net360_me.code
code="$(cat /tmp/net360_me.code)"
if [[ "${code}" != "401" ]]; then
  echo "WARN: expected 401 without cookie/token, got ${code}"
fi

echo ""
echo "-- Trial route exists (expect 401 or 400 without auth — NOT 404) --"
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "${API_BASE}/api/subscriptions/start-trial" | tee /tmp/net360_trial1.code
code="$(cat /tmp/net360_trial1.code)"
if [[ "${code}" == "404" ]]; then
  echo "FAIL: POST /api/subscriptions/start-trial returned 404 — deploy latest server or fix reverse proxy."
  exit 1
fi
echo "start-trial HTTP: ${code} (ok if 401/403)"

curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "${API_BASE}/api/trial/start" | tee /tmp/net360_trial2.code
code="$(cat /tmp/net360_trial2.code)"
if [[ "${code}" == "404" ]]; then
  echo "FAIL: POST /api/trial/start returned 404 — deploy latest server."
  exit 1
fi
echo "trial/start HTTP: ${code} (ok if 401/403)"

echo ""
echo "-- Community leaderboards (may be 401/403 if locked; 502 means upstream/gateway error) --"
curl -sS -o /dev/null -w "quiz-leaderboard %{http_code}\n" "${API_BASE}/api/community/quiz-leaderboard" || true
curl -sS -o /dev/null -w "leaderboard weekly %{http_code}\n" "${API_BASE}/api/community/leaderboard?period=weekly" || true

echo ""
echo "Done. For authenticated checks, paste a Bearer token:"
echo "  curl -sS -H \"Authorization: Bearer YOUR_JWT\" \"${API_BASE}/api/subscriptions/me\""
echo "  curl -sS -X POST -H \"Authorization: Bearer YOUR_JWT\" -H 'Content-Type: application/json' -d '{}' \"${API_BASE}/api/subscriptions/start-trial\""
