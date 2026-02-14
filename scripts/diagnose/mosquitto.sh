#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="mosquitto"

# Check if mosquitto service is active
if systemctl is-active --quiet mosquitto 2>/dev/null; then
    echo "[PASS] $COMPONENT: service is running"
else
    echo "[FAIL] $COMPONENT: service is not running"
    exit 1
fi

# Check MQTT port 1883
if ss -lntp 2>/dev/null | grep -q ':1883 '; then
    echo "[PASS] $COMPONENT: port 1883 (MQTT TCP) is listening"
else
    echo "[FAIL] $COMPONENT: port 1883 (MQTT TCP) is NOT listening"
    exit 1
fi

# Check WebSocket port 9001
if ss -lntp 2>/dev/null | grep -q ':9001 '; then
    echo "[PASS] $COMPONENT: port 9001 (MQTT WebSocket) is listening"
else
    echo "[FAIL] $COMPONENT: port 9001 (MQTT WebSocket) is NOT listening"
    exit 1
fi
