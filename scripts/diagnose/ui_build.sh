#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPONENT="ui_build"
INDEX_FILE="${PROJECT_ROOT}/ui/dist/index.html"

if [ -f "$INDEX_FILE" ]; then
    echo "[PASS] $COMPONENT: ui/dist/index.html exists"
else
    echo "[FAIL] $COMPONENT: ui/dist/index.html not found (run: cd ui && npm run build)"
    exit 1
fi
