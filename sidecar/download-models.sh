#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "$SCRIPT_DIR/venv/bin/python" ]; then
    PYTHON_CMD="$SCRIPT_DIR/venv/bin/python"
elif [ -f "$SCRIPT_DIR/python/bin/python3" ]; then
    PYTHON_CMD="$SCRIPT_DIR/python/bin/python3"
else
    PYTHON_CMD="python3"
fi

"$PYTHON_CMD" "$SCRIPT_DIR/download_models.py"
