#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="deepstream"
LOG_FILE="${PROJECT_ROOT}/app/data/logs/deepstream.out.log"

# Find DeepStream PID
pid=$(pgrep -f deepstream-test5-app 2>/dev/null || true)

if [ -z "$pid" ]; then
    echo "[INFO] $MODULE: process not running"
else
    # CPU%
    cpu_pct=$(ps -p "$pid" -o pcpu= 2>/dev/null | tr -d ' ' || echo "N/A")

    # RSS from /proc/<pid>/status
    rss_kb=$(awk '/^VmRSS:/ {print $2}' "/proc/${pid}/status" 2>/dev/null || echo "0")
    rss_mb=$((rss_kb / 1024))

    # File descriptor count
    fd_count=$(ls "/proc/${pid}/fd" 2>/dev/null | wc -l || echo "N/A")

    # Uptime: starttime (field 22 in /proc/pid/stat) in clock ticks
    starttime=$(awk '{print $22}' "/proc/${pid}/stat" 2>/dev/null || echo "0")
    clk_tck=$(getconf CLK_TCK 2>/dev/null || echo "100")
    uptime_sec=$(awk '{print $1}' /proc/uptime 2>/dev/null || echo "0")

    if [ "$clk_tck" -gt 0 ] 2>/dev/null && [ "$starttime" -gt 0 ] 2>/dev/null; then
        start_sec=$((starttime / clk_tck))
        uptime_int=${uptime_sec%%.*}
        age_sec=$((uptime_int - start_sec))
        age_min=$((age_sec / 60))
        age_rem=$((age_sec % 60))
        age_display="${age_min}m${age_rem}s"
    else
        age_display="N/A"
    fi

    echo "[OK] $MODULE: running (pid $pid) cpu=${cpu_pct}% rss=${rss_mb}MB fds=${fd_count} uptime=${age_display}"

    # Warn on high memory usage (>50% of 8GB)
    if [ "$rss_mb" -ge 4096 ]; then
        echo "[WARN] $MODULE: RSS ${rss_mb}MB -- consuming >50% of system RAM"
    fi
fi

# Extract FPS from log (works whether DeepStream is running or not)
if [ -f "$LOG_FILE" ]; then
    # Find last PERF data line (contains decimal FPS values, not the header line with "FPS N")
    last_perf=$(grep '\*\*PERF:' "$LOG_FILE" | grep -v 'FPS [0-9]' | tail -1 || true)

    if [ -n "$last_perf" ]; then
        # Extract timestamp from [ISO_TIMESTAMP] prefix
        ts=$(echo "$last_perf" | grep -oP '^\[\K[^\]]+' || echo "unknown")
        # Extract all fps(avg) pairs: "25.30 (24.80)"
        fps_pairs=$(echo "$last_perf" | grep -oP '[0-9]+\.[0-9]+ \([0-9]+\.[0-9]+\)' || true)

        if [ -n "$fps_pairs" ]; then
            echo "[INFO] $MODULE: last FPS report at $ts:"
            stream_idx=0
            while IFS= read -r pair; do
                current=$(echo "$pair" | grep -oP '^[0-9.]+')
                avg=$(echo "$pair" | grep -oP '\(\K[0-9.]+')
                current_int=${current%%.*}
                if [ "$current_int" -eq 0 ] 2>/dev/null; then
                    echo "[WARN] $MODULE: stream $stream_idx: ${current} fps (avg: ${avg}) -- zero FPS"
                elif [ "$current_int" -lt 10 ] 2>/dev/null; then
                    echo "[WARN] $MODULE: stream $stream_idx: ${current} fps (avg: ${avg}) -- low FPS"
                else
                    echo "[OK] $MODULE: stream $stream_idx: ${current} fps (avg: ${avg})"
                fi
                stream_idx=$((stream_idx + 1))
            done <<< "$fps_pairs"
        else
            echo "[INFO] $MODULE: no FPS data parsed from last PERF line"
        fi
    else
        echo "[INFO] $MODULE: no PERF data in log"
    fi
else
    echo "[INFO] $MODULE: log file not found"
fi
