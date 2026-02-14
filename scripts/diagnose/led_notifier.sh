#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="led_notifier"

pid=$(pgrep -f person_led_mqtt.py 2>/dev/null || true)

if [ -n "$pid" ]; then
    echo "[PASS] $COMPONENT: process running (pid $pid)"
else
    echo "[FAIL] $COMPONENT: process not running"
    exit 1
fi
