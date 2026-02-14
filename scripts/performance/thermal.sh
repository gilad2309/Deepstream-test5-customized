#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="thermal"

# Thermal zone map: index -> name (confirmed on Jetson Orin Nano)
declare -A ZONES=(
    [0]="cpu-thermal"
    [1]="gpu-thermal"
    [5]="soc0-thermal"
    [6]="soc1-thermal"
    [7]="soc2-thermal"
    [8]="tj-thermal"
)

# Throttle thresholds from tj-thermal trip points
THROTTLE_TRIP="/sys/class/thermal/thermal_zone8/trip_point_2_temp"
CRITICAL_TRIP="/sys/class/thermal/thermal_zone8/trip_point_3_temp"
throttle_mc=$(cat "$THROTTLE_TRIP" 2>/dev/null || echo "95000")
critical_mc=$(cat "$CRITICAL_TRIP" 2>/dev/null || echo "104500")
throttle_c=$((throttle_mc / 1000))
critical_c=$((critical_mc / 1000))

# Warning threshold: 10C below throttle point
warn_mc=$((throttle_mc - 10000))

any_warn=0
any_crit=0

for idx in 0 1 5 6 7 8; do
    name="${ZONES[$idx]}"
    temp_path="/sys/class/thermal/thermal_zone${idx}/temp"
    temp_mc=$(cat "$temp_path" 2>/dev/null || echo "-1")

    if [ "$temp_mc" -lt 0 ] 2>/dev/null; then
        echo "[WARN] $MODULE: $name -- could not read"
        any_warn=1
        continue
    fi

    temp_c_int=$((temp_mc / 1000))
    temp_c_frac=$(( (temp_mc % 1000) / 100 ))
    temp_display="${temp_c_int}.${temp_c_frac}"

    if [ "$temp_mc" -ge "$throttle_mc" ]; then
        echo "[CRIT] $MODULE: $name ${temp_display}C -- THROTTLING (threshold: ${throttle_c}C)"
        any_crit=1
    elif [ "$temp_mc" -ge "$warn_mc" ]; then
        echo "[WARN] $MODULE: $name ${temp_display}C -- approaching throttle (threshold: ${throttle_c}C)"
        any_warn=1
    else
        echo "[OK] $MODULE: $name ${temp_display}C"
    fi
done

echo "[INFO] $MODULE: throttle at ${throttle_c}C, critical shutdown at ${critical_c}C"

if [ "$any_crit" -eq 1 ]; then
    exit 1
fi
