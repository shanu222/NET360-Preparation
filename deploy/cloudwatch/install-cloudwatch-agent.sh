#!/usr/bin/env bash
# Install and configure Amazon CloudWatch Agent for NET360 EC2 API host.
# Prerequisites:
#   - EC2 instance profile with CloudWatchAgentServerPolicy (or custom equivalent)
#   - Amazon Linux 2023 / Ubuntu 22.04+
#
# Usage (on API server as root):
#   sudo bash deploy/cloudwatch/install-cloudwatch-agent.sh

set -euo pipefail

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] install-cloudwatch-agent.sh — validating config only"
  if [[ ! -f "${REPO_DIR:-/root/NET360-Preparation}/deploy/cloudwatch/amazon-cloudwatch-agent.json" ]]; then
    echo "ERROR: Missing CloudWatch config JSON"
    exit 1
  fi
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" \
    "${REPO_DIR:-/root/NET360-Preparation}/deploy/cloudwatch/amazon-cloudwatch-agent.json"
  echo "[DRY_RUN] JSON valid; on AL2023 would: dnf install -y amazon-cloudwatch-agent"
  echo "[DRY_RUN] would copy config to /opt/aws/amazon-cloudwatch-agent/etc/ and run amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s"
  echo "No manual code changes required — only IAM instance profile + run this script."
  exit 0
fi

REPO_DIR="${REPO_DIR:-/root/NET360-Preparation}"
CONFIG_SRC="${REPO_DIR}/deploy/cloudwatch/amazon-cloudwatch-agent.json"
CONFIG_DST="/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"

if [[ ! -f "${CONFIG_SRC}" ]]; then
  echo "ERROR: Missing ${CONFIG_SRC}"
  exit 1
fi

if ! command -v amazon-cloudwatch-agent-ctl >/dev/null 2>&1; then
  echo "== Installing Amazon CloudWatch Agent =="
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y amazon-cloudwatch-agent
  elif command -v apt-get >/dev/null 2>&1; then
    wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb -O /tmp/amazon-cloudwatch-agent.deb
    dpkg -i /tmp/amazon-cloudwatch-agent.deb || apt-get install -f -y
  else
    echo "ERROR: Unsupported package manager. Install amazon-cloudwatch-agent manually."
    exit 1
  fi
fi

mkdir -p "$(dirname "${CONFIG_DST}")"
cp "${CONFIG_SRC}" "${CONFIG_DST}"

echo "== Starting CloudWatch Agent =="
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c "file:${CONFIG_DST}" \
  -s

echo "CloudWatch Agent configured. Log groups:"
echo "  /net360/production/api"
echo "  /net360/production/nginx"
echo "Metrics namespace: NET360/Production"
