# Sidecar Development Log (DEVLOG)

> Fortlaufendes Protokoll der Entwicklung, Entscheidungen, Abweichungen und Tests.

---

## [2026-07-24] Projektstart & Initiales Setup (Phase P4)

### 1. Architektur & Technologieentscheidung
- **Runtime:** Python 3.11+ gewählt für plattformübergreifende Audiogeräte-Ansteuerung via `sounddevice` (PortAudio Binaries enthalten für Windows/Linux) und saubere Anbindung von ML-Modellen.
- **WebSocket IPC:** `websockets` Bibliotheken auf `127.0.0.1:34710`.
- **STT-Engine (Dokumentierte Abweichung):** Verwendung von `faster-whisper` (CTranslate2-basiert) anstelle von `whisper.cpp`.
  - *Begründung & Rationale:* `faster-whisper` bietet auf CPU und GPU hervorragende C++-Inferenz-Performance bei einfacherer Installation ohne C++ Build-Tools auf Windows.
- **TTS-Engine:** Download und Ausführung der offiziellen Piper-Binary (`piper.exe` unter Windows, `piper` unter Linux) als Subprozess.
  - *Begründung & Rationale:* Vermeidet Bekannte Wheel-Kompilierungsprobleme des Python-Pakets `piper-tts` auf Windows-Systemen.

### 2. Dateistruktur in `sidecar/`
- Erstellung von `sidecar/.gitignore` zum Ausschluss von `models/`, `piper/`, `venv/` und Log/Audio-Dateien.
- Festlegung exakter Paketversionen in `sidecar/requirements.txt` ohne Platzhalter/Varianten.

---

## [2026-07-24] Abschluss & Bereit zur Abnahme

### 1. Zusammenfassung der durchgeführten Arbeiten
- **IPC WebSocket-Server (`main.py`):** Vollständige Implementierung des Protokolls auf `127.0.0.1:34710`. Alle Nachrichten (`hello`, `status`, `config`, `tts`, `tts_stop`, `stt_start`, `stt_stop`, `unknown_type`) wurden implementiert und getestet.
- **Modell-Downloader (`download_models.py` / `download-models.cmd` / `download-models.sh`):** Automatischer Download der offiziellen Piper-Binary (Windows/Linux), Piper TTS-Stimmen (`de_DE-thorsten-medium`, `en_US-lessac-medium`) und `faster-whisper` Small Model mit SHA256-Prüfung.
- **Plattform-Starter (`start.cmd` / `start.sh`):** Enthält dynamische Python-Erkennung, Abnahmebedingung 6.1 (Fehlermeldung bei fehlendem Python + Anleitung für portable Embeddable Python Version in `sidecar/python/`) und automatischen `venv`-Setup.
- **Akzeptanz-Testclient (`test-client.mjs`):** Vollständiger automatisierter Testlauf aller §4 Kommandos mit 100% `PASS`.
- **Dokumentation:** `README.md`, `TESTREPORT.md` und `DEVLOG.md` vollständig erstellt.

### 2. Offene Punkte
- keine.

### 3. Bekannte Einschränkungen & Hinweise
- Bei Systemen ohne physisches Mikrofon liefert `stt_stop` einen leeren Text `""` zurück (vollständig konform zu §4).
- Erstmaliger Start lädt/überprüft die Modelle. Danach läuft der Sidecar 100% offline ohne Netzwerkverbindungen.
