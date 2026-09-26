#!/bin/bash
# Daemon to keep Next.js dev server alive after parent session exits

PROJECT_DIR="/home/z/my-project"
LOG_FILE="$PROJECT_DIR/dev.log"
PID_FILE="$PROJECT_DIR/dev.pid"

cd "$PROJECT_DIR"

# If already running, exit
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Dev server already running with PID $(cat "$PID_FILE")"
    exit 0
fi

# Spawn detached daemon — exec replaces shell with next dev directly (no tee pipe)
# nohup + setsid + </dev/null ensures no controlling terminal, no HUP, no stdin dependency
setsid nohup bun x next dev -p 3000 > "$LOG_FILE" 2>&1 < /dev/null &
DAEMON_PID=$!
echo "$DAEMON_PID" > "$PID_FILE"
disown "$DAEMON_PID" 2>/dev/null || true

echo "Started dev server, daemon PID: $DAEMON_PID"
echo "Log: $LOG_FILE"
echo "PID file: $PID_FILE"
