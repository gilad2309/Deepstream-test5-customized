#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="logs"
LOG_DIR="${PROJECT_ROOT}/app/data/logs"
TAIL_LINES=20

if [ ! -d "$LOG_DIR" ]; then
    echo "[FAIL] $COMPONENT: log directory not found at $LOG_DIR"
    exit 1
fi

log_files=("$LOG_DIR"/*.log)
if [ ! -e "${log_files[0]}" ]; then
    echo "[FAIL] $COMPONENT: no log files found in $LOG_DIR"
    exit 1
fi

any_errors=0
for log_file in "${log_files[@]}"; do
    filename=$(basename "$log_file")
    errors=$(tail -n "$TAIL_LINES" "$log_file" 2>/dev/null | grep -i -E 'error|fail|exception|segfault|fatal' || true)
    if [ -n "$errors" ]; then
        echo "[FAIL] $COMPONENT: errors found in $filename"
        echo "$errors" | while IFS= read -r line; do
            echo "       $line"
        done
        any_errors=1
    else
        echo "[PASS] $COMPONENT: $filename clean (last $TAIL_LINES lines)"
    fi
done

exit $any_errors
