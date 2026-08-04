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

---

## [2026-07-25] Live-Translator-Erweiterung (Phase P4b)

### 1. Architektur & Technologieentscheidung
- **Übersetzungs-Engine:** Entscheidung für `argostranslate` anstelle von reinen CTranslate2/NLLB-Modellen.
  - *Begründung & Rationale:* Argos Translate ist speziell für unkomplizierte Offline-Übersetzungen konzipiert und beinhaltet CTranslate2 unter der Haube. Es erfordert keine komplizierten Tokenizer-Setups oder PyTorch-Abhängigkeiten. Die Modelle (`.argosmodel`) bündeln Tokenizer, Model-Weights und Metadaten in einer Zip-Datei, was das Management enorm vereinfacht. Für `de -> ja` wird intern ein automatischer Pivot-Mechanismus (`de -> en -> ja`) genutzt, da beide Packages bereitstehen.
- **OSC Client:** Nutzung von `python-osc` zur Kommunikation mit der VRChat-Chatbox via UDP.
- **VAD-Segmentierung:** Anstatt eines externen VAD-Modells wird die kontinuierliche Mikrofonaufnahme von `sounddevice` alle 0.5s auf die RMS-Energie geprüft. Sobald der Schwellwert überschritten ist, wird die Sprache aufgezeichnet, bis eine Stillephase von ca. 0.8s detektiert wird. Dann wird der Chunk an `faster-whisper` und anschließend an `argostranslate` übergeben. Dies liefert einen hervorragenden Kompromiss aus Latenz und Genauigkeit.

### 2. Bereit zur Abnahme (P4b)
- **Umgesetzte Features:**
  - Neue Commands: `translator_start`, `translator_stop`.
  - Kontinuierliche Loop in `main.py` mit VAD, Transkription, Übersetzung und OSC.
  - OSC Chatbox-Splitting (144 Zeichen max) und Rate-Limiting (1.5s).
  - Mutex: `stt_start` blockiert, wenn `translator_active` ist.
- **Tests:** `test-client.mjs` erweitert um einen lokalen OSC/UDP Mock-Server. Alle Tests für P4 und P4b liefern `PASS`.


## [2026-08-04] Abnahme P4b durch das Kernteam (mit Korrekturen)

- Befund: P4b war implementiert, aber unkommittiert und ungetestet
  hinterlassen (argostranslate/python-osc fehlten im venv, Argos-Modelle
  nicht installiert).
- Fix 1: `download_models.py` — direkte argos-net.com-URLs lieferten
  HTTP 403; umgestellt auf die offizielle argostranslate-Package-API
  (Index + install), idempotent.
- Fix 2: `main.py` — WhisperModel lädt jetzt mit `local_files_only=True`,
  damit zur Laufzeit kein huggingface.co-Aufruf mehr passiert
  (localhost-only-Regel §2.4).
- Verifiziert: `node test-client.mjs` 11/11 PASS (inkl. translator_start,
  STT-Mutex, OSC-Mock) gegen frisch gestartete Instanz ohne
  Fremd-Traffic im Startlog.
