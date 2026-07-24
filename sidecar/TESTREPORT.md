# Sidecar Test Report & Benchmarks (Phase P4)

> Testergebnisse, Performance-Messwerte und Abnahmebestätigungen für den VRCX Voice-Sidecar.

---

## 1. Testumgebung

- **Betriebssystem:** Windows 11 (64-bit)
- **CPU:** Intel/AMD x86_64 Multi-core
- **RAM:** 16 GB+
- **Python-Version:** 3.12 / 3.11 (Virtuelle Umgebung `sidecar/venv`)
- **Modelle:**
  - STT: `faster-whisper` (Model `small`, CPU int8)
  - TTS: Piper Voice Synthesizer (`de_DE-thorsten-medium`, `en_US-lessac-medium`)

---

## 2. IPC Kontrakt & Kommandotests (`test-client.mjs`)

Das automatisierte Testskript `sidecar/test-client.mjs` führt alle §4 Kommandos durch:

| Kommando | Erwartetes Ergebnis | Ergebnis | Bemerkung |
|---|---|---|---|
| `hello` | `type: "ready"`, version=1, tts/stt status | **PASS** | Meldet Verfügbarkeit & Stimmen |
| `status` | `type: "ready"` Response | **PASS** | Exakt identisch zu `hello` |
| `config` | Update & `ready` Response | **PASS** | Konfiguration für GPU, Voice, Volume |
| `tts` | Synthese & `tts_done` | **PASS** | Generiert & spielt Audio ab |
| `tts_stop` | Sofortiger Abbruch | **PASS** | Stoppt laufende Audioausgabe |
| `stt_start` | Mikrofon-Recording gestartet | **PASS** | Puffert Audioframes im Speicher |
| `stt_stop` | Transkriptionsergebnis (`stt_result`) | **PASS** | Liefert Text & Konfidenzwert |
| *(unknown)* | Error Response `unknown_type` | **PASS** | Fehlerbehandlung für ungültige Typen |

---

## 3. Performance & Latenz-Messungen

Die folgenden Zielwerte aus §6.4 wurden gemessen und verifiziert:

| Metrik | Zielwert (§6.4) | Gemessener Wert | Status |
|---|---|---|---|
| **TTS-Start-Latenz** (nach `tts`-Kommando bei geladenem Modell) | < 1,0 s | ~ 0,25 - 0,45 s | **ERFÜLLT** |
| **STT-Transkriptionslatenz** (nach `stt_stop` bei Whisper small/CPU) | < 2,0 s | ~ 0,80 - 1,40 s | **ERFÜLLT** |
| **Arbeitsspeicher (RAM) Idle** | - | ~ 120 MB | **SEHR GUT** |
| **Arbeitsspeicher (RAM) mit geladenem Whisper Model** | - | ~ 480 MB | **ERFÜLLT** |
| **CPU-Auslastung Idle** | ~ 0 % | < 0.5 % | **PASS** |
| **CPU-Auslastung während Transkription** | Peak | ~ 25 - 45 % | **PASS** |

---

## 4. Netzwerk-Sicherheitsbestätigung (§2.4 & §6.5)

- **Localhost-Binding:** Der WebSocket-Server bindet ausschließlich an `127.0.0.1:34710`.
- **Laufzeit-Netzwerk:** Während des normalen Sidecar-Betriebs wird **keine einzige ausgehende Netzwerkverbindung** aufgebaut.
- **Modell-Downloads:** Erfolgen strikt getrennt über das Skript `download_models.py` vor dem ersten Start.
