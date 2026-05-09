#!/usr/bin/env bash
# Upload built-in public media (schools, images/, guide video) to S3.
# Requires: Node.js, npm install (already done in project), AWS credentials.
#
# .env in project root must include:
#   AWS_REGION=ap-south-1
#   AWS_ACCESS_KEY_ID=...
#   AWS_SECRET_ACCESS_KEY=...
#   AWS_BUCKET_NAME=net360-media
#
# Usage:
#   chmod +x scripts/upload-public-media-to-s3.sh
#   ./scripts/upload-public-media-to-s3.sh
#   # or from anywhere:
#   bash /path/to/NET360-Preparation/scripts/upload-public-media-to-s3.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${AWS_BUCKET_NAME:-}" ]]; then
  echo "ERROR: AWS_BUCKET_NAME is not set. Add it to ${ROOT}/.env" >&2
  exit 1
fi

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "ERROR: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing (add to .env or use IAM role)." >&2
  exit 1
fi

echo "Bucket: ${AWS_BUCKET_NAME}  Region: ${AWS_REGION:-ap-south-1}"
echo "Project: ${ROOT}"
echo "Running npm run media:upload-s3 ..."
npm run media:upload-s3

echo "Done. Ensure bucket allows public GetObject (or use CloudFront). Set VITE_S3_BASE_URL on the frontend build."
