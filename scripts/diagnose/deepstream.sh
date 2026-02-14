#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="deepstream"

pid=$(pgrep -f deepstream-test5-app 2>/dev/null || true)

if [ -n "$pid" ]; then
    echo "[PASS] $COMPONENT: process running (pid $pid)"
else
    echo "[FAIL] $COMPONENT: process not running"
    exit 1
fi
