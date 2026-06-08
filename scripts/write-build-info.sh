#!/usr/bin/env bash
# Write deploy/build-info.json from current git state (run during deploy).
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
OUT="${REPO_DIR}/deploy/build-info.json"

cd "${REPO_DIR}"

COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BUILD_HOST="$(hostname 2>/dev/null || echo unknown)"

mkdir -p "$(dirname "${OUT}")"
cat > "${OUT}" <<EOF
{
  "service": "net360-api",
  "commit": "${COMMIT}",
  "branch": "${BRANCH}",
  "deployedAt": "${DEPLOYED_AT}",
  "buildHost": "${BUILD_HOST}"
}
EOF

echo "Wrote ${OUT}"
echo "  commit=${COMMIT}"
echo "  branch=${BRANCH}"
echo "  deployedAt=${DEPLOYED_AT}"
