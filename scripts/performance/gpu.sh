#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="gpu"

GPU_FREQ_PATH="/sys/class/devfreq/17000000.gpu/cur_freq"
GPU_MAX_FREQ_PATH="/sys/class/devfreq/17000000.gpu/max_freq"
GPU_LOAD_PATH="/sys/devices/platform/17000000.gpu/load"
GPU_GOV_PATH="/sys/class/devfreq/17000000.gpu/governor"

# Read current GPU frequency (Hz -> MHz)
cur_freq_hz=$(cat "$GPU_FREQ_PATH" 2>/dev/null || echo "0")
max_freq_hz=$(cat "$GPU_MAX_FREQ_PATH" 2>/dev/null || echo "0")
cur_freq_mhz=$((cur_freq_hz / 1000000))
max_freq_mhz=$((max_freq_hz / 1000000))

# Read GPU utilization (permille 0-1000 -> percent with one decimal)
gpu_load_raw=$(cat "$GPU_LOAD_PATH" 2>/dev/null || echo "-1")

if [ "$gpu_load_raw" -ge 0 ] 2>/dev/null; then
    gpu_pct_int=$((gpu_load_raw / 10))
    gpu_pct_frac=$((gpu_load_raw % 10))
    gpu_pct="${gpu_pct_int}.${gpu_pct_frac}"
else
    gpu_pct="N/A"
fi

# Read governor
governor=$(cat "$GPU_GOV_PATH" 2>/dev/null || echo "unknown")

echo "[INFO] $MODULE: frequency ${cur_freq_mhz} / ${max_freq_mhz} MHz (governor: $governor)"

if [ "$gpu_load_raw" -ge 0 ] 2>/dev/null; then
    if [ "$gpu_load_raw" -ge 900 ]; then
        echo "[CRIT] $MODULE: utilization ${gpu_pct}% -- GPU saturated"
        exit 1
    elif [ "$gpu_load_raw" -ge 750 ]; then
        echo "[WARN] $MODULE: utilization ${gpu_pct}% -- high load"
    else
        echo "[OK] $MODULE: utilization ${gpu_pct}%"
    fi
else
    echo "[WARN] $MODULE: could not read GPU utilization"
fi
