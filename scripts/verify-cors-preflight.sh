#!/usr/bin/env bash
# Verify admin SPA preflight headers against production API.
# Usage: bash scripts/verify-cors-preflight.sh [API_BASE] [ORIGIN]
set -euo pipefail

API_BASE="${1:-https://api.net360preparation.com}"
API_BASE="${API_BASE%/}"
ORIGIN="${2:-https://www.net360preparation.com}"

echo "== CORS preflight: ${API_BASE}/api/admin/system-status =="
echo "Origin: ${ORIGIN}"

headers="$(curl -sS -D - -o /dev/null \
  -X OPTIONS \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-net360-client-platform,authorization,x-net360-client-version,x-net360-auth-transport-preference" \
  "${API_BASE}/api/admin/system-status")"

echo "${headers}" | tr -d '\r' | grep -iE '^HTTP/|^access-control' || true

status="$(echo "${headers}" | tr -d '\r' | grep -i '^HTTP/' | head -n1 | awk '{print $2}')"
allow_headers="$(echo "${headers}" | tr -d '\r' | grep -i '^access-control-allow-headers:' | head -n1 | cut -d: -f2- | tr '[:upper:]' '[:lower:]')"
allow_origin="$(echo "${headers}" | tr -d '\r' | grep -i '^access-control-allow-origin:' | head -n1 | awk '{print $2}')"

if [[ "${status}" != "204" && "${status}" != "200" ]]; then
  echo "FAIL: expected HTTP 200/204, got ${status:-unknown}"
  exit 1
fi

if [[ "${allow_origin}" != "${ORIGIN}" ]]; then
  echo "FAIL: Access-Control-Allow-Origin=${allow_origin:-missing} expected ${ORIGIN}"
  exit 1
fi

for required in \
  x-net360-client-platform \
  x-net360-client-version \
  x-net360-auth-transport-preference \
  authorization \
  content-type; do
  if ! echo "${allow_headers}" | grep -q "${required}"; then
    echo "FAIL: Access-Control-Allow-Headers missing ${required}"
    echo "Got: ${allow_headers}"
    exit 1
  fi
done

echo "PASS: preflight includes required NET360 headers for ${ORIGIN}"
