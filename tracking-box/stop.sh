#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_HOST="pi@hackathon-pi-1.local"
[[ -f "$SCRIPT_DIR/../.env" ]] && source "$SCRIPT_DIR/../.env"
SSH_OPTS="-o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new"

echo "→ Stopping tracking-box..."
if ssh $SSH_OPTS "$PI_HOST" 'sudo systemctl stop tracking-box'; then
  echo "✓ tracking-box stopped"
else
  echo "✗ tracking-box was not running"
fi
