@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ===================================================
echo   VRCX Voice-Sidecar Interaktiver STT-Test
echo ===================================================

set "PYTHON_CMD="
if exist "%~dp0venv\Scripts\python.exe" (
    set "PYTHON_CMD=%~dp0venv\Scripts\python.exe"
) else if exist "%~dp0python\python.exe" (
    set "PYTHON_CMD=%~dp0python\python.exe"
) else (
    set "PYTHON_CMD=python"
)

"!PYTHON_CMD!" "%~dp0interactive_test.py"
pause
