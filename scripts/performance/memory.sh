#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="memory"

# Parse /proc/meminfo
mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
mem_avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
swap_total_kb=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
swap_free_kb=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)

# Convert to MB
mem_total_mb=$((mem_total_kb / 1024))
mem_avail_mb=$((mem_avail_kb / 1024))
mem_used_mb=$((mem_total_mb - mem_avail_mb))
swap_total_mb=$((swap_total_kb / 1024))
swap_free_mb=$((swap_free_kb / 1024))
swap_used_mb=$((swap_total_mb - swap_free_mb))

# Percentage used (RAM) — permille for precision
if [ "$mem_total_kb" -gt 0 ]; then
    mem_used_pct=$(( (mem_total_kb - mem_avail_kb) * 1000 / mem_total_kb ))
    mem_pct_int=$((mem_used_pct / 10))
    mem_pct_frac=$((mem_used_pct % 10))
    mem_display="${mem_pct_int}.${mem_pct_frac}"
else
    mem_used_pct=0
    mem_display="N/A"
fi

# Percentage used (Swap)
if [ "$swap_total_kb" -gt 0 ]; then
    swap_used_pct=$(( (swap_total_kb - swap_free_kb) * 1000 / swap_total_kb ))
    swap_pct_int=$((swap_used_pct / 10))
    swap_pct_frac=$((swap_used_pct % 10))
    swap_display="${swap_pct_int}.${swap_pct_frac}"
else
    swap_used_pct=0
    swap_display="0.0"
fi

# RAM status
if [ "$mem_used_pct" -ge 900 ]; then
    echo "[CRIT] $MODULE: RAM ${mem_used_mb}/${mem_total_mb} MB (${mem_display}%) -- near OOM"
elif [ "$mem_used_pct" -ge 800 ]; then
    echo "[WARN] $MODULE: RAM ${mem_used_mb}/${mem_total_mb} MB (${mem_display}%) -- low headroom"
else
    echo "[OK] $MODULE: RAM ${mem_used_mb}/${mem_total_mb} MB (${mem_display}%)"
fi

# Swap status
if [ "$swap_total_kb" -eq 0 ]; then
    echo "[WARN] $MODULE: no swap configured"
elif [ "$swap_used_pct" -ge 500 ]; then
    echo "[WARN] $MODULE: swap ${swap_used_mb}/${swap_total_mb} MB (${swap_display}%) -- heavy swap pressure"
else
    echo "[OK] $MODULE: swap ${swap_used_mb}/${swap_total_mb} MB (${swap_display}%)"
fi

# Top 5 memory consumers
echo "[INFO] $MODULE: top memory processes:"
ps -eo pid,rss,comm --sort=-rss 2>/dev/null | head -6 | while IFS= read -r line; do
    echo "       $line"
done
