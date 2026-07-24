@echo off
cd /d "%~dp0"

echo ===================================================
echo   VRCX Voice-Sidecar Model Downloader (Windows)
echo ===================================================

set "PYTHON_CMD="

if exist "venv\Scripts\python.exe" (
    set "PYTHON_CMD=venv\Scripts\python.exe"
    goto :FOUND
)

if exist "python\python.exe" (
    set "PYTHON_CMD=python\python.exe"
    goto :FOUND
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
    goto :FOUND
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=py"
    goto :FOUND
)

echo [FEHLER] Kein Python gefunden. Bitte erst start.cmd ausfuehren oder Python installieren.
pause
exit /b 1

:FOUND
"%PYTHON_CMD%" download_models.py
pause
