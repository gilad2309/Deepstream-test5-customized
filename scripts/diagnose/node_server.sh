#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="node_server"
PORT=8081

# Try hitting the status endpoint
if curl -s --max-time 2 "http://127.0.0.1:${PORT}/api/status" >/dev/null 2>&1; then
    response=$(curl -s --max-time 2 "http://127.0.0.1:${PORT}/api/status")
    echo "[PASS] $COMPONENT: responding on port $PORT ($response)"
else
    echo "[FAIL] $COMPONENT: not responding on port $PORT"
    exit 1
fi
