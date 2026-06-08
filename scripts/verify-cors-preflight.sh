#!/usr/bin/env bash
# Verify NET360 SPA preflight headers (auth + admin routes).
# Usage: bash scripts/verify-cors-preflight.sh [API_BASE] [ORIGIN]
set -euo pipefail

API_BASE="${1:-https://api.net360preparation.com}"
API_BASE="${API_BASE%/}"
ORIGIN="${2:-https://www.net360preparation.com}"

fail() {
  echo "FAIL: $*"
  exit 1
}

check_preflight() {
  local path="$1"
  local method="$2"
  local label="$3"

  echo ""
  echo "== CORS preflight: ${API_BASE}${path} (${label}) =="
  echo "Origin: ${ORIGIN}"
  echo "Method: ${method}"

  local headers
  headers="$(curl -sS -D - -o /dev/null \
    -X OPTIONS \
    -H "Origin: ${ORIGIN}" \
    -H "Access-Control-Request-Method: ${method}" \
    -H "Access-Control-Request-Headers: x-net360-client-platform,authorization,x-net360-client-version,x-net360-auth-transport-preference" \
    "${API_BASE}${path}")"

  echo "${headers}" | tr -d '\r' | grep -iE '^HTTP/|^access-control' || true

  local status allow_headers allow_origin allow_credentials allow_methods
  status="$(echo "${headers}" | tr -d '\r' | grep -i '^HTTP/' | head -n1 | awk '{print $2}')"
  allow_headers="$(echo "${headers}" | tr -d '\r' | grep -i '^access-control-allow-headers:' | head -n1 | cut -d: -f2- | tr '[:upper:]' '[:lower:]')"
  allow_origin="$(echo "${headers}" | tr -d '\r' | grep -i '^access-control-allow-origin:' | head -n1 | awk '{print $2}')"
  allow_credentials="$(echo "${headers}" | tr -d '\r' | grep -i '^access-control-allow-credentials:' | head -n1 | awk '{print $2}')"
  allow_methods="$(echo "${headers}" | tr -d '\r' | grep -i '^access-control-allow-methods:' | head -n1 | cut -d: -f2- | tr '[:upper:]' '[:lower:]')"

  if [[ "${status}" != "204" && "${status}" != "200" ]]; then
    fail "${path} expected HTTP 200/204, got ${status:-unknown}"
  fi

  if [[ "${allow_origin}" != "${ORIGIN}" ]]; then
    fail "${path} Access-Control-Allow-Origin=${allow_origin:-missing} expected ${ORIGIN}"
  fi

  if [[ "${allow_credentials}" != "true" ]]; then
    fail "${path} Access-Control-Allow-Credentials=${allow_credentials:-missing} expected true"
  fi

  for required in \
    x-net360-client-platform \
    x-net360-client-version \
    x-net360-auth-transport-preference \
    authorization \
    content-type \
    accept \
    origin \
    x-requested-with; do
    if ! echo "${allow_headers}" | grep -q "${required}"; then
      fail "${path} Access-Control-Allow-Headers missing ${required}"
      echo "Got: ${allow_headers}"
    fi
  done

  for required_method in get post put patch delete options; do
    if ! echo "${allow_methods}" | grep -q "${required_method}"; then
      fail "${path} Access-Control-Allow-Methods missing ${required_method^^}"
      echo "Got: ${allow_methods}"
    fi
  done

  echo "PASS: ${path} preflight includes required NET360 headers"
}

echo "== NET360 CORS preflight verification: ${API_BASE} =="

check_preflight "/api/auth/login" "POST" "auth login"
check_preflight "/api/admin/system-status" "GET" "admin system-status"

echo ""
echo "PASS: all CORS preflight checks succeeded for ${ORIGIN}"
