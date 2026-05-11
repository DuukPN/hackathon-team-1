#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_HOST="pi@hackathon-pi-1.local"
[[ -f "$SCRIPT_DIR/../.env" ]] && source "$SCRIPT_DIR/../.env"
SSH_OPTS="-o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new"

echo "→ Checking tracking-box status on Pi..."
ssh $SSH_OPTS "$PI_HOST" 'sudo systemctl status tracking-box --no-pager -l'
echo ""
echo "Recent logs:"
ssh $SSH_OPTS "$PI_HOST" 'journalctl -u tracking-box --no-pager -n 10'
