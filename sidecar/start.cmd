@echo off
setlocal enabledelayedexpansion

:: Navigation zum Script-Verzeichnis
cd /d "%~dp0"

echo ===================================================
echo   VRCX Voice-Sidecar Starter (Windows)
echo ===================================================

:: 1. Prüfen ob ein lokales/portables Python in sidecar\python\python.exe liegt
set "PYTHON_CMD="
if exist "%~dp0python\python.exe" (
    set "PYTHON_CMD=%~dp0python\python.exe"
    echo [INFO] Verwende portables Python: !PYTHON_CMD!
) else (
    :: 2. Prüfen ob globales Python installiert ist
    where python >nul 2>nul
    if !errorlevel! equ 0 (
        set "PYTHON_CMD=python"
        echo [INFO] Verwende System-Python
    ) else (
        where py >nul 2>nul
        if !errorlevel! equ 0 (
            set "PYTHON_CMD=py"
            echo [INFO] Verwende Python-Launcher (py)
        )
    )
)

:: 3. Wenn kein Python gefunden wurde: Freundliche Fehlermeldung und Abbruch
if "!PYTHON_CMD!"=="" (
    echo.
    echo [FEHLER] Kein Python-Laufzeitumgebung gefunden!
    echo.
    echo Um den Voice-Sidecar auszufuehren, benoetigst du Python 3.11 oder neuer.
    echo.
    echo Optionen:
    echo  1. Python 3.11+ offiziell installieren (https://www.python.org/downloads/)
    echo     Wichtig: Haken bei "Add Python to PATH" setzen!
    echo.
    echo  2. Portables Python verwenden:
    echo     - Python Embeddable Package (64-bit) von python.org herunterladen
    echo     - Inhalt in den Ordner "%~dp0python\" entpacken
    echo.
    pause
    exit /b 1
)

:: 4. Virtualenv einrichten falls nicht vorhanden
if not exist "%~dp0venv\Scripts\python.exe" (
    echo [INFO] Erstelle virtuelle Umgebung in sidecar\venv...
    "!PYTHON_CMD!" -m venv "%~dp0venv"
    if !errorlevel! neq 0 (
        echo [FEHLER] Erstellung der virtuellen Umgebung fehlgeschlagen.
        pause
        exit /b 1
    )
)

:: 5. Abhaengigkeiten installieren/aktualisieren
echo [INFO] Aktiviere virtuelle Umgebung...
call "%~dp0venv\Scripts\activate.bat"

echo [INFO] Prüfe / installiere Python-Pakete...
python -m pip install --quiet --upgrade pip
python -m pip install -r "%~dp0requirements.txt"
if %errorlevel% neq 0 (
    echo [WARNUNG] Einige Pakete konnten nicht installiert werden.
)

:: 6. Modell-Prüfung Hinweis
if not exist "%~dp0models" (
    echo [HINWEIS] Ordner 'models' existiert noch nicht.
    echo [HINWEIS] Bitte fuehre 'download-models.cmd' aus, um STT/TTS-Modelle herunterzuladen.
    echo [HINWEIS] Der Sidecar startet trotzdem im Status (ready: tts=false, stt=false).
)

echo [INFO] Starte Voice-Sidecar...
python "%~dp0main.py"
pause
