#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="network"

for iface_dir in /sys/class/net/*; do
    iface=$(basename "$iface_dir")
    # Skip loopback and interfaces without statistics
    [ "$iface" = "lo" ] && continue
    [ ! -d "$iface_dir/statistics" ] && continue

    operstate=$(cat "$iface_dir/operstate" 2>/dev/null || echo "unknown")

    if [ "$operstate" != "up" ]; then
        echo "[INFO] $MODULE: $iface is $operstate"
        continue
    fi

    rx_bytes=$(cat "$iface_dir/statistics/rx_bytes" 2>/dev/null || echo "0")
    tx_bytes=$(cat "$iface_dir/statistics/tx_bytes" 2>/dev/null || echo "0")
    rx_errors=$(cat "$iface_dir/statistics/rx_errors" 2>/dev/null || echo "0")
    tx_errors=$(cat "$iface_dir/statistics/tx_errors" 2>/dev/null || echo "0")
    rx_dropped=$(cat "$iface_dir/statistics/rx_dropped" 2>/dev/null || echo "0")
    tx_dropped=$(cat "$iface_dir/statistics/tx_dropped" 2>/dev/null || echo "0")

    # Convert bytes to human-readable
    rx_mb=$((rx_bytes / 1048576))
    tx_mb=$((tx_bytes / 1048576))

    echo "[INFO] $MODULE: $iface UP -- rx=${rx_mb}MB tx=${tx_mb}MB"

    total_errors=$((rx_errors + tx_errors))
    total_dropped=$((rx_dropped + tx_dropped))

    if [ "$total_errors" -gt 100 ]; then
        echo "[WARN] $MODULE: $iface errors rx_err=${rx_errors} tx_err=${tx_errors} -- check cabling/signal"
    elif [ "$total_dropped" -gt 100 ]; then
        echo "[WARN] $MODULE: $iface dropped rx_drop=${rx_dropped} tx_drop=${tx_dropped} -- possible buffer overrun"
    else
        echo "[OK] $MODULE: $iface errors=${total_errors} dropped=${total_dropped}"
    fi
done
