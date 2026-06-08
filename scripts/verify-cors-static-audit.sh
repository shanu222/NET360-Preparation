#!/usr/bin/env bash
# Fail if server/index.js reintroduces duplicate or bare CORS handlers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX="${SCRIPT_DIR}/../server/index.js"

fail() {
  echo "FAIL: $*"
  exit 1
}

[[ -f "${INDEX}" ]] || fail "missing ${INDEX}"

echo "== CORS static audit: server/index.js =="

if grep -qE 'app\.options\([^)]*cors\(\s*\)' "${INDEX}"; then
  fail 'found bare app.options(..., cors()) — use app.options("*", corsMiddleware) only'
fi

cors_middleware_refs="$(grep -c 'corsMiddleware' "${INDEX}" || true)"
if [[ "${cors_middleware_refs}" -lt 3 ]]; then
  fail "expected corsMiddleware definition plus app.use/app.options registrations"
fi

if ! grep -q 'NET360_CORS_ALLOWED_HEADERS' "${INDEX}"; then
  fail 'missing NET360_CORS_ALLOWED_HEADERS constant'
fi

if ! grep -q 'x-net360-client-platform' "${INDEX}"; then
  fail 'missing x-net360-client-platform in CORS allowed headers'
fi

if ! grep -q 'Access-Control-Allow-Headers' "${INDEX}"; then
  echo "OK: no manual Access-Control-Allow-Headers middleware (Express cors owns CORS)"
fi

manual_acao="$(grep -c "res\.header('Access-Control-Allow-Origin'" "${INDEX}" || true)"
if [[ "${manual_acao}" != "0" ]]; then
  fail "found ${manual_acao} manual Access-Control-Allow-Origin handlers — consolidate on corsMiddleware"
fi

echo "PASS: single canonical CORS middleware; no bare cors() OPTIONS handlers"
