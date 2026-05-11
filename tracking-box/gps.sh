#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_HOST="pi@hackathon-pi-1.local"
[[ -f "$SCRIPT_DIR/../.env" ]] && source "$SCRIPT_DIR/../.env"
REMOTE_DIR="/home/pi/tracking-box/gps"
SSH_OPTS="-o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new"

# Sync GPS scripts
rsync -az -e "ssh $SSH_OPTS" --exclude '.venv' --exclude '__pycache__' \
  "$SCRIPT_DIR/gps/" "$PI_HOST:$REMOTE_DIR/" 2>/dev/null

# Ensure venv + deps
ssh $SSH_OPTS "$PI_HOST" "cd $REMOTE_DIR && (test -d .venv || python3 -m venv .venv) && .venv/bin/pip install -q -r requirements.txt" 2>/dev/null

# Kill any orphaned stream process
ssh $SSH_OPTS "$PI_HOST" 'pkill -f "stream[.]py" 2>/dev/null; rm -f /tmp/gps-stream.lock' || true

# Run the GPS configure script
ssh $SSH_OPTS -t "$PI_HOST" "cd $REMOTE_DIR && .venv/bin/python configure.py"
