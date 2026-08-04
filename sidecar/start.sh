#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==================================================="
echo "  VRCX Voice-Sidecar Starter (Linux)"
echo "==================================================="

PYTHON_CMD=""

if [ -f "$SCRIPT_DIR/python/bin/python3" ]; then
    PYTHON_CMD="$SCRIPT_DIR/python/bin/python3"
    echo "[INFO] Using portable Python at $PYTHON_CMD"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
    echo "[INFO] Using system python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
    echo "[INFO] Using system python"
else
    echo ""
    echo "[ERROR] Python 3 runtime not found!"
    echo ""
    echo "Please install Python 3.11+ via your system package manager:"
    echo "  Ubuntu/Debian: sudo apt update && sudo apt install python3 python3-venv"
    echo "  Fedora:        sudo dnf install python3"
    echo "  Arch Linux:    sudo pacman -S python"
    echo ""
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/venv/bin/python" ]; then
    echo "[INFO] Creating virtual environment at sidecar/venv..."
    "$PYTHON_CMD" -m venv "$SCRIPT_DIR/venv"
fi

source "$SCRIPT_DIR/venv/bin/activate"

echo "[INFO] Checking Python dependencies..."
pip install --quiet --upgrade pip
pip install -r "$SCRIPT_DIR/requirements.txt"

if [ ! -d "$SCRIPT_DIR/models" ]; then
    echo "[NOTICE] 'models' directory not found."
    echo "[NOTICE] Run ./download-models.sh to download STT/TTS models."
fi

echo "[INFO] Starting Voice-Sidecar..."
exec python "$SCRIPT_DIR/main.py"
