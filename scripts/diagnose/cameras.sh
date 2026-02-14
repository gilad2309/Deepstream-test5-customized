#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="cameras"
CAMERAS_FILE="${PROJECT_ROOT}/app/config/cameras.txt"
TIMEOUT=2

if [ ! -f "$CAMERAS_FILE" ]; then
    echo "[FAIL] $COMPONENT: cameras.txt not found at $CAMERAS_FILE"
    exit 1
fi

# Read non-empty, non-comment lines
mapfile -t urls < <(grep -v '^\s*#' "$CAMERAS_FILE" | grep -v '^\s*$')

if [ ${#urls[@]} -eq 0 ]; then
    echo "[FAIL] $COMPONENT: no cameras configured in cameras.txt"
    exit 1
fi

echo "[INFO] $COMPONENT: found ${#urls[@]} configured camera(s)"

any_failed=0
for url in "${urls[@]}"; do
    # Extract host and port from RTSP URL
    # Format: rtsp://user:pass@host:port/path
    host=$(echo "$url" | sed -E 's|rtsp://([^@]+@)?([^:/]+).*|\2|')
    port=$(echo "$url" | sed -E 's|rtsp://([^@]+@)?[^:/]+:([0-9]+).*|\2|')
    # Default RTSP port
    if [ -z "$port" ] || [ "$port" = "$url" ]; then
        port=554
    fi

    if nc -z -w "$TIMEOUT" "$host" "$port" 2>/dev/null; then
        echo "[PASS] $COMPONENT: $host:$port reachable"
    else
        echo "[FAIL] $COMPONENT: $host:$port unreachable"
        any_failed=1
    fi
done

exit $any_failed
