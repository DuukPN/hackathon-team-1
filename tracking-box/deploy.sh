#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_HOST="pi@hackathon-pi-1.local"
[[ -f "$SCRIPT_DIR/../.env" ]] && source "$SCRIPT_DIR/../.env"
REMOTE_DIR="/home/pi/tracking-box"
SSH_OPTS="-o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new"

echo "→ Stopping service..."
ssh $SSH_OPTS "$PI_HOST" 'sudo systemctl stop tracking-box 2>/dev/null || pkill -f "main[.]py" || true'

echo "→ Syncing files..."
rsync -avz -e "ssh $SSH_OPTS" --exclude '.venv' --exclude '__pycache__' --exclude '.DS_Store' \
  "$SCRIPT_DIR/" "$PI_HOST:$REMOTE_DIR/"

echo "→ Installing deps..."
ssh $SSH_OPTS "$PI_HOST" "cd $REMOTE_DIR && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt"

echo "→ Installing systemd service..."
ssh $SSH_OPTS "$PI_HOST" "sudo cp $REMOTE_DIR/tracking-box.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable tracking-box && sudo systemctl start tracking-box"

echo "✓ Deployed and running as systemd service. Logs: ssh $PI_HOST 'journalctl -u tracking-box -f'"
