#!/usr/bin/env python3
"""
Interaktiver Mikrofon-Test für den VRCX Voice-Sidecar (Phase P4)
Ermöglicht das bequeme Testen der Sprachaufzeichnung (STT) per Mikrofon.
"""

import sys
import json
import asyncio
import websockets

SERVER_URL = "ws://127.0.0.1:34710"

async def interactive_stt_test():
    print("===================================================")
    print(" VRCX Voice-Sidecar Interaktiver Mikrofon-Test (STT)")
    print(f" Verbinde mit {SERVER_URL}...")
    print("===================================================\n")

    try:
        async with websockets.connect(SERVER_URL) as ws:
            # Send hello on connect to verify handshake
            await ws.send(json.dumps({"type": "hello", "version": 1}))
            ready_msg = json.loads(await ws.recv())
            
            print(f"[✓] Verbindung erfolgreich hergestellt! (Sidecar Version {ready_msg.get('version')})")
            print("[INFO] Das Sidecar hört auf dein Standard-Mikrofon.\n")

            while True:
                input(">>> Drücke ENTER, um die Aufnahme zu STARTEN (Push-to-Talk)... ")
                await ws.send(json.dumps({"type": "stt_start", "language": "de"}))
                print("\n🔴 AUFNAHME LÄUFT! Sprich jetzt etwas in dein Mikrofon...")
                
                input(">>> Drücke ENTER, wenn du fertig bist (STT STOP)... ")
                await ws.send(json.dumps({"type": "stt_stop"}))
                print("⏳ Transkribiere Audiodaten...")

                response = await ws.recv()
                msg = json.loads(response)

                if msg.get("type") == "stt_result":
                    text = msg.get("text", "")
                    conf = msg.get("confidence", 0.0)
                    print(f"\n===================================================")
                    print(f" 🟢 ERKANNTES ERGEBNIS: \"{text}\"")
                    print(f" 📊 Konfidenz: {conf*100:.1f}%")
                    print(f"===================================================\n")
                else:
                    print(f"[!] Unerwartete Antwort: {msg}")

                retry = input("Möchtest du einen weiteren Test machen? (j/n): ").strip().lower()
                if retry != 'j':
                    break

    except Exception as e:
        print(f"\n[FEHLER] Keine Verbindung zum Sidecar Server: {e}")
        print("Stelle sicher, dass der Sidecar gestartet ist (start.cmd).")

if __name__ == "__main__":
    asyncio.run(interactive_stt_test())
