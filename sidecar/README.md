# VRCX Voice-Sidecar (Phase P4)

Eigenständiger lokaler Voice-Sidecar-Prozess für VRCX Pool-Chat (STT: Diktat per Push-to-Talk; TTS: Vorlesen von Nachrichten).

---

## 1. Systemanforderungen & Plattformen

- **Plattformen:** Windows 10/11 (64-bit) & Linux x64
- **Laufzeitumgebung:** Python 3.11 oder neuer
- **Netzwerk:** Bindet **ausschließlich** an `127.0.0.1:34710` (kein externer Netzwerkzugriff zur Laufzeit).

---

## 2. Installation & Setup

### Option A: Standard-Installation (mit installiertem Python)
1. Stelle sicher, dass Python 3.11+ installiert ist und `python` im `PATH` vorhanden ist.
2. Starte `start.cmd` (Windows) bzw. `start.sh` (Linux).
   Das Skript erstellt automatisch eine virtuelle Python-Umgebung in `sidecar/venv/` und installiert alle benötigten Abhängigkeiten aus `requirements.txt`.

### Option B: Portables Python (Ohne globale Python-Installation)
Sollte auf dem Zielsystem kein globales Python installiert sein, fängt `start.cmd` dies ab und gibt eine verständliche Anleitung aus.
Für ein vollständig portables Setup gehe wie folgt vor:

1. Lade das offizielle **Python Embeddable Package (64-bit)** herunter (z.B. Python 3.11 oder 3.12 zip von [python.org](https://www.python.org/downloads/windows/)).
2. Entpacke den Inhalt des zip-Archivs direkt in das Verzeichnis:
   `sidecar/python/` (sodass `sidecar/python/python.exe` existiert).
3. `start.cmd` erkennt das portable Python automatisch und nutzt es zur Ausführung.

---

## 3. Modell-Download (STT & TTS)

Der Sidecar kann ohne vorinstallierte Modelle starten und meldet im WebSocket-Status `tts.ready: false` / `stt.ready: false`.

Um die Sprachmodelle herunterzuladen:
- **Windows:** Führst du `sidecar/download-models.cmd` aus.
- **Linux:** Führst du `./sidecar/download-models.sh` aus.

**Heruntergeladene Komponenten:**
- **Piper Binary Executable:** Platziert in `sidecar/piper/`
- **TTS Stimmen:**
  - `de_DE-thorsten-medium` (Deutsch)
  - `en_US-lessac-medium` (Englisch)
  Platziert in `sidecar/models/tts/`
- **STT Modell:** `faster-whisper` (Small Model) in `sidecar/models/stt/`

Die Quellen und SHA256-Prüfsummen werden während des Downloads automatisch verifiziert.

---

## 4. Ausführung & Start

- **Windows:** `sidecar/start.cmd`
- **Linux:** `./sidecar/start.sh`

Der WebSocket-Server startet auf `ws://127.0.0.1:34710`.

---

## 5. IPC-Protokoll (WebSocket `127.0.0.1:34710`)

Alle Nachrichten sind JSON-Objekte über WebSocket Textframes.

### Client -> Sidecar

| Nachricht | Beschreibung |
|---|---|
| `{"type":"hello","version":1}` | Statusabfrage & Readiness |
| `{"type":"status"}` | Statusabfrage |
| `{"type":"config","gpu":bool?,"voice":"…"?,"volume":0.0-1.0?}` | Einstellungen anpassen |
| `{"type":"tts","id":"…","text":"…","voice":"…"?,"volume":0.0-1.0?}` | TTS-Synthese & Wiedergabe |
| `{"type":"tts_stop"}` | Bricht laufende TTS-Wiedergabe ab |
| `{"type":"stt_start","language":"de"}` | Startet Mikrofonaufnahme |
| `{"type":"stt_stop"}` | Beendet Aufnahme & führt Transkription durch |

---

## 6. Automatische Tests

Das Kernteam kann die Einhaltung aller IPC-Vorgaben mit dem mitgelieferten Node.js Testclient prüfen:

```bash
node sidecar/test-client.mjs
```

Bei Erfolg gibt der Testclient `PASS` für alle Kommandos aus und beendet mit Exit-Code `0`.
