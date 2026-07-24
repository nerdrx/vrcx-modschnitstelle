@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ===================================================
echo   VRCX Voice-Sidecar Model Downloader (Windows)
echo ===================================================

set "PYTHON_CMD="
if exist "%~dp0venv\Scripts\python.exe" (
    set "PYTHON_CMD=%~dp0venv\Scripts\python.exe"
) else if exist "%~dp0python\python.exe" (
    set "PYTHON_CMD=%~dp0python\python.exe"
) else (
    where python >nul 2>nul
    if !errorlevel! equ 0 (
        set "PYTHON_CMD=python"
    ) else (
        where py >nul 2>nul
        if !errorlevel! equ 0 (
            set "PYTHON_CMD=py"
        )
    )
)

if "!PYTHON_CMD!"=="" (
    echo [FEHLER] Kein Python gefunden. Bitte erst start.cmd ausführen oder Python installieren.
    pause
    exit /b 1
)

"!PYTHON_CMD!" "%~dp0download_models.py"
pause
