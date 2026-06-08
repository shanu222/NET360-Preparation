#!/usr/bin/env bash
# Daily MongoDB backup for NET360 (mongodump + gzip + retention).
#
# Requires:
#   - mongodump in PATH (mongodb-database-tools)
#   - MONGODB_URI in ${REPO_DIR}/.env
#
# Optional env:
#   NET360_BACKUP_DIR   default /var/backups/net360
#   BACKUP_RETENTION_DAYS default 14
#   S3_BACKUP_BUCKET    if set, uploads archive with aws cli
#
# Usage:
#   bash scripts/mongodb-backup-daily.sh

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
BACKUP_DIR="${NET360_BACKUP_DIR:-/var/backups/net360}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
ARCHIVE="${BACKUP_DIR}/net360-mongo-${STAMP}.gz"

cd "${REPO_DIR}"
mkdir -p "${BACKUP_DIR}"

if [[ -f "${REPO_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_DIR}/.env"
  set +a
fi

MONGO_URI="${MONGODB_URI:-${DATABASE_URL:-${MONGO_URI:-}}}"
if [[ -z "${MONGO_URI}" ]]; then
  echo "ERROR: MONGODB_URI not set in .env"
  exit 1
fi

if ! command -v mongodump >/dev/null 2>&1; then
  echo "ERROR: mongodump not found. Install mongodb-database-tools."
  exit 1
fi

echo "== MongoDB backup ${STAMP} =="
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

mongodump --uri="${MONGO_URI}" --gzip --archive="${ARCHIVE}"
echo "Wrote ${ARCHIVE} ($(du -h "${ARCHIVE}" | awk '{print $1}'))"

find "${BACKUP_DIR}" -name 'net360-mongo-*.gz' -type f -mtime +"${RETENTION_DAYS}" -delete
echo "Retention: deleted backups older than ${RETENTION_DAYS} days"

if [[ -n "${S3_BACKUP_BUCKET:-}" ]] && command -v aws >/dev/null 2>&1; then
  aws s3 cp "${ARCHIVE}" "s3://${S3_BACKUP_BUCKET}/mongodb/$(basename "${ARCHIVE}")"
  echo "Uploaded to s3://${S3_BACKUP_BUCKET}/mongodb/$(basename "${ARCHIVE}")"
fi

echo "Backup complete."
