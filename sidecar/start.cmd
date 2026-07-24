@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ===================================================
echo   VRCX Voice-Sidecar Starter (Windows)
echo ===================================================

set "PYTHON_CMD="

:: 1. Check if virtual environment exists in sidecar\venv
if exist "venv\Scripts\python.exe" (
    set "PYTHON_CMD=venv\Scripts\python.exe"
    echo [INFO] Verwende venv: !PYTHON_CMD!
    goto :FOUND_PYTHON
)

:: 2. Check if portable Python exists in sidecar\python\python.exe
if exist "python\python.exe" (
    set "PYTHON_CMD=python\python.exe"
    echo [INFO] Verwende portables Python: !PYTHON_CMD!
    goto :FOUND_PYTHON
)

:: 3. Check system python via where
where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
    echo [INFO] Verwende System-Python
    goto :FOUND_PYTHON
)

:: 4. Check py launcher via where
where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=py"
    echo [INFO] Verwende Python-Launcher (py)
    goto :FOUND_PYTHON
)

echo.
echo [FEHLER] Keine funktionierende Python-Laufzeitumgebung gefunden!
echo.
echo Um den Voice-Sidecar auszufuehren, benoetigst du Python 3.11 oder neuer.
echo.
echo Optionen:
echo  1. Python 3.11+ offiziell installieren (https://www.python.org/downloads/)
echo     Wichtig: Im Installer den Haken bei "Add Python to PATH" setzen!
echo.
echo  2. Portables Python verwenden:
echo     - Python Embeddable Package (64-bit) von python.org herunterladen
echo     - Inhalt in den Ordner "sidecar\python\" entpacken
echo.
pause
exit /b 1

:FOUND_PYTHON

:: 5. Create virtual environment if not present
if not exist "venv\Scripts\python.exe" (
    echo [INFO] Erstelle virtuelle Umgebung in sidecar\venv...
    "!PYTHON_CMD!" -m venv venv
    if !errorlevel! neq 0 (
        echo [FEHLER] Erstellung der virtuellen Umgebung fehlgeschlagen.
        pause
        exit /b 1
    )
    set "PYTHON_CMD=venv\Scripts\python.exe"
)

:: 6. Install requirements
echo [INFO] Pruefe / installiere Python-Pakete...
"!PYTHON_CMD!" -m pip install --quiet --upgrade pip
"!PYTHON_CMD!" -m pip install -r requirements.txt

:: 7. Check models directory
if not exist "models" (
    echo [HINWEIS] Ordner 'models' existiert noch nicht.
    echo [HINWEIS] Bitte fuehre 'download-models.cmd' aus, um STT/TTS-Modelle herunterzuladen.
    echo [HINWEIS] Der Sidecar startet trotzdem im Status (ready: tts=false, stt=false).
)

echo [INFO] Starte Voice-Sidecar...
"!PYTHON_CMD!" main.py
if %errorlevel% neq 0 (
    echo.
    echo [FEHLER] Der Sidecar-Prozess wurde mit Fehler beendet.
)
pause
