@echo off
cd /d "%~dp0"

echo ===================================================
echo   VRCX Voice-Sidecar Starter (Windows)
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

:FOUND

if not exist "venv\Scripts\python.exe" (
    echo [INFO] Erstelle virtuelle Umgebung in sidecar\venv...
    "%PYTHON_CMD%" -m venv venv
    if errorlevel 1 (
        echo [FEHLER] Erstellung der virtuellen Umgebung fehlgeschlagen.
        pause
        exit /b 1
    )
)

echo [INFO] Pruefe / installiere Python-Pakete...
"venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt

if not exist "models" (
    echo [HINWEIS] Ordner 'models' existiert noch nicht.
    echo [HINWEIS] Bitte fuehre 'download-models.cmd' aus, um STT/TTS-Modelle herunterzuladen.
)

echo [INFO] Starte Voice-Sidecar...
"venv\Scripts\python.exe" main.py
if errorlevel 1 (
    echo.
    echo [FEHLER] Der Sidecar-Prozess wurde mit Fehler beendet.
)

pause
