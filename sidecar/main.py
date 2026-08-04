#!/usr/bin/env python3
"""
VRCX Voice-Sidecar (Phase P4) - Main WebSocket Server
Binds exclusively to 127.0.0.1:34710
Handles STT (faster-whisper) and TTS (Piper binary subprocess)
"""

import os
import sys
import json
import shutil
import asyncio
import logging
import platform
import tempfile
import numpy as np
import sounddevice as sd
from scipy.io import wavfile
import websockets
import queue
import translator_engine

# Setup logging
logging.basicConfig(level=logging.INFO, format="[Sidecar] %(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("VoiceSidecar")

HOST = "127.0.0.1"
PORT = 34710

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
PIPER_DIR = os.path.join(BASE_DIR, "piper")

class VoiceSidecar:
    def __init__(self):
        self.connected_clients = set()
        self.gpu_enabled = False
        self.selected_voice = "de_DE-thorsten-medium"
        self.volume = 1.0
        
        # Audio / STT state
        self.is_recording = False
        self.recorded_frames = []
        self.recording_stream = None
        self.sample_rate = 16000
        self.stt_model = None
        self.stt_ready = False
        
        # TTS state
        self.tts_ready = False
        self.available_voices = []
        self.piper_bin_path = None
        self.current_tts_process = None
        self.is_playing_audio = False

        # Translator state
        self.translator_ready = False
        self.translator_active = False
        self.translator_target = None
        self.osc_chatbox = None
        self.translator_task = None

    def find_piper_binary(self):
        """Locates the Piper executable."""
        system = platform.system()
        binary_name = "piper.exe" if system == "Windows" else "piper"
        
        possible_paths = [
            os.path.join(PIPER_DIR, binary_name),
            os.path.join(PIPER_DIR, "piper", binary_name),
            os.path.join(PIPER_DIR, "piper_windows_amd64", binary_name),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found Piper binary: {path}")
                return path
        
        # Check system PATH fallback
        shutil_path = shutil.which(binary_name)
        if shutil_path:
            logger.info(f"Found Piper binary on system PATH: {shutil_path}")
            return shutil_path
            
        logger.warning("Piper binary not found.")
        return None

    def check_models(self):
        """Checks for existing STT and TTS models."""
        tts_dir = os.path.join(MODELS_DIR, "tts")
        stt_dir = os.path.join(MODELS_DIR, "stt")
        
        self.piper_bin_path = self.find_piper_binary()
        
        # Check TTS Voices
        voices = []
        if os.path.exists(tts_dir):
            for file in os.listdir(tts_dir):
                if file.endswith(".onnx"):
                    voices.append(file.replace(".onnx", ""))
        
        self.available_voices = voices
        if voices and self.piper_bin_path:
            self.tts_ready = True
            logger.info(f"TTS Ready with voices: {voices}")
        else:
            self.tts_ready = False
            logger.warning(f"TTS Not Ready (Voices found: {voices}, Piper Bin: {self.piper_bin_path})")

        # Load STT Whisper Model
        try:
            from faster_whisper import WhisperModel
            logger.info("Initializing faster-whisper model...")
            device = "cuda" if self.gpu_enabled else "cpu"
            compute_type = "float16" if self.gpu_enabled else "int8"
            
            # local_files_only: never contact huggingface at runtime (localhost-only rule);
            # the model is fetched by download_models.py beforehand.
            self.stt_model = WhisperModel("small", device=device, compute_type=compute_type, download_root=stt_dir, local_files_only=True)
            self.stt_ready = True
            logger.info("STT Ready (faster-whisper small model loaded).")
        except Exception as e:
            logger.warning(f"STT Not Ready (failed to load model: {e})")
            self.stt_ready = False

        # Check Translator Models
        self.translator_ready = translator_engine.check_translator_ready()
        if self.translator_ready:
            logger.info("Translator Ready (Argos models found).")
        else:
            logger.warning("Translator Not Ready (Argos models missing).")

    def get_ready_status(self):
        return {
            "type": "ready",
            "version": 1,
            "tts": {
                "ready": self.tts_ready,
                "voices": self.available_voices
            },
            "stt": {
                "ready": self.stt_ready,
                "model": "small" if self.stt_ready else ""
            },
            "translator": {
                "ready": self.translator_ready,
                "active": self.translator_active,
                "target": self.translator_target
            },
            "gpu": self.gpu_enabled
        }

    async def broadcast(self, message_dict):
        if not self.connected_clients:
            return
        payload = json.dumps(message_dict)
        await asyncio.gather(*[client.send(payload) for client in self.connected_clients], return_exceptions=True)

    def stop_current_tts(self):
        """Stops ongoing TTS playback/process."""
        if self.is_playing_audio:
            try:
                sd.stop()
            except Exception:
                pass
            self.is_playing_audio = False
        if self.current_tts_process:
            if self.current_tts_process.returncode is None:
                try:
                    self.current_tts_process.terminate()
                except Exception:
                    pass
            self.current_tts_process = None

    async def handle_tts(self, websocket, msg_id, text, voice_name=None, volume=None):
        """Synthesizes and plays TTS audio via Piper binary."""
        self.stop_current_tts()
        
        target_voice = voice_name or self.selected_voice
        target_vol = volume if volume is not None else self.volume
        
        if not self.tts_ready or not self.piper_bin_path:
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "id": msg_id,
                    "message": "TTS engine or voice model not ready"
                }))
            except Exception:
                pass
            return

        tts_dir = os.path.join(MODELS_DIR, "tts")
        onnx_model_path = os.path.join(tts_dir, f"{target_voice}.onnx")
        
        if not os.path.exists(onnx_model_path):
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "id": msg_id,
                    "message": f"Voice model '{target_voice}' not found"
                }))
            except Exception:
                pass
            return

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            output_wav = tmp_wav.name

        try:
            cmd = [
                self.piper_bin_path,
                "--model", onnx_model_path,
                "--output_file", output_wav
            ]
            
            logger.info(f"Synthesizing TTS: '{text}' using voice '{target_voice}'")
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            self.current_tts_process = proc
            await proc.communicate(input=text.encode("utf-8"))

            if proc.returncode != 0 or not os.path.exists(output_wav):
                raise RuntimeError("Piper synthesis failed")

            # Play audio file
            sr, audio_data = wavfile.read(output_wav)
            if target_vol != 1.0:
                audio_data = (audio_data * target_vol).astype(audio_data.dtype)
                
            self.is_playing_audio = True
            sd.play(audio_data, sr)
            
            # Wait for audio to finish playing
            duration = len(audio_data) / float(sr)
            await asyncio.sleep(duration)
            self.is_playing_audio = False
            
            await websocket.send(json.dumps({
                "type": "tts_done",
                "id": msg_id
            }))
        except Exception as e:
            logger.error(f"TTS Error: {e}")
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "id": msg_id,
                    "message": str(e)
                }))
            except Exception:
                pass
        finally:
            if os.path.exists(output_wav):
                try:
                    os.remove(output_wav)
                except Exception:
                    pass

    def start_microphone_recording(self):
        """Starts recording frames from standard microphone."""
        self.recorded_frames = []
        self.is_recording = True

        def callback(indata, frames, time, status):
            if status:
                logger.warning(f"Audio record status: {status}")
            if self.is_recording:
                self.recorded_frames.append(indata.copy())

        try:
            self.recording_stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype='float32',
                callback=callback
            )
            self.recording_stream.start()
            logger.info("Microphone recording started.")
        except Exception as e:
            logger.error(f"Failed to start audio input stream: {e}")

    def stop_microphone_recording(self):
        """Stops recording and returns numpy float32 audio array."""
        self.is_recording = False
        if self.recording_stream:
            try:
                self.recording_stream.stop()
                self.recording_stream.close()
            except Exception:
                pass
            self.recording_stream = None
            
        logger.info("Microphone recording stopped.")
        if not self.recorded_frames:
            return np.array([], dtype=np.float32)
            
        audio_data = np.concatenate(self.recorded_frames, axis=0).flatten()
        self.recorded_frames = []
        return audio_data

    async def transcribe_audio(self, audio_data, language="de"):
        """Transcribes audio array using faster-whisper."""
        if not self.stt_ready or self.stt_model is None or len(audio_data) == 0:
            return "", 0.0

        try:
            logger.info("Transcribing recorded audio with faster-whisper...")
            segments, info = await asyncio.to_thread(
                self.stt_model.transcribe,
                audio_data,
                language=language,
                beam_size=5
            )
            
            text_list = []
            for seg in segments:
                text_list.append(seg.text.strip())
                
            full_text = " ".join(text_list)
            confidence = float(getattr(info, "language_probability", 0.95))
            logger.info(f"Transcription result: '{full_text}' (prob={confidence:.2f})")
            return full_text, confidence
        except Exception as e:
            logger.error(f"STT Error: {e}")
            return "", 0.0

    async def run_translator(self, target_lang, source_lang, show_original):
        self.is_recording = True
        q = queue.Queue()

        def callback(indata, frames, time, status):
            if self.is_recording:
                q.put(indata.copy())
                
        try:
            stream = sd.InputStream(samplerate=self.sample_rate, channels=1, dtype='float32', callback=callback)
            stream.start()
        except Exception as e:
            logger.error(f"Failed to start audio stream for translator: {e}")
            self.translator_active = False
            return
            
        logger.info(f"Live Translator Loop started (Target: {target_lang}).")
        
        accumulated = []
        silence_chunks = 0
        is_speaking = False
        threshold = 0.01 # RMS threshold
        
        while self.translator_active:
            try:
                chunk = await asyncio.to_thread(q.get, timeout=0.5)
                rms = np.sqrt(np.mean(chunk**2))
                
                if rms > threshold:
                    if not is_speaking:
                        is_speaking = True
                        self.osc_chatbox.set_typing(True)
                    silence_chunks = 0
                    accumulated.append(chunk)
                else:
                    if is_speaking:
                        silence_chunks += 1
                        accumulated.append(chunk)
                        
                        # approx 0.8s of silence triggers processing
                        if silence_chunks > int(self.sample_rate / len(chunk) * 0.8):
                            is_speaking = False
                            audio_data = np.concatenate(accumulated, axis=0).flatten()
                            accumulated = []
                            asyncio.create_task(self.process_translator_chunk(audio_data, target_lang, source_lang, show_original))
            except queue.Empty:
                pass
                
        stream.stop()
        stream.close()
        self.is_recording = False
        self.osc_chatbox.set_typing(False)
        logger.info("Live Translator Loop stopped.")

    async def process_translator_chunk(self, audio_data, target_lang, source_lang, show_original):
        text, conf = await self.transcribe_audio(audio_data, language=source_lang)
        if text and conf > 0.4:
            await self.broadcast({
                "type": "translator_partial",
                "original": text
            })
            
            translated_text = await asyncio.to_thread(translator_engine.translate_text, text, target_lang, source_lang)
            
            await self.broadcast({
                "type": "translator_final",
                "original": text,
                "translated": translated_text,
                "target": target_lang
            })
            
            await self.osc_chatbox.send_text(translated_text, show_original, text)
        self.osc_chatbox.set_typing(False)

    async def handle_client(self, websocket):
        logger.info(f"Client connected: {websocket.remote_address}")
        self.connected_clients.add(websocket)
        try:
            async for raw_msg in websocket:
                try:
                    msg = json.loads(raw_msg)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({"type": "error", "message": "invalid_json"}))
                    continue

                msg_type = msg.get("type")
                logger.info(f"Received message type: {msg_type}")

                if msg_type == "hello":
                    await websocket.send(json.dumps(self.get_ready_status()))

                elif msg_type == "status":
                    await websocket.send(json.dumps(self.get_ready_status()))

                elif msg_type == "config":
                    if "gpu" in msg:
                        self.gpu_enabled = bool(msg["gpu"])
                    if "voice" in msg:
                        self.selected_voice = msg["voice"]
                    if "volume" in msg:
                        self.volume = float(msg["volume"])
                    await websocket.send(json.dumps(self.get_ready_status()))

                elif msg_type == "tts":
                    msg_id = msg.get("id", "default")
                    text = msg.get("text", "")
                    voice = msg.get("voice")
                    vol = msg.get("volume")
                    asyncio.create_task(self.handle_tts(websocket, msg_id, text, voice, vol))

                elif msg_type == "tts_stop":
                    self.stop_current_tts()

                elif msg_type == "translator_start":
                    if self.is_recording:
                        await websocket.send(json.dumps({"type": "error", "message": "stt_active"}))
                        continue
                    
                    target = msg.get("target", "en")
                    source = msg.get("source", "de")
                    osc_config = msg.get("osc", {})
                    host = osc_config.get("host", "127.0.0.1")
                    port = osc_config.get("port", 9000)
                    show_orig = msg.get("show_original", False)
                    
                    self.translator_target = target
                    self.osc_chatbox = translator_engine.OscChatbox(host=host, port=port)
                    self.translator_active = True
                    
                    self.translator_task = asyncio.create_task(self.run_translator(target, source, show_orig))
                    
                    await websocket.send(json.dumps({
                        "type": "translator_started",
                        "target": target
                    }))
                    await self.broadcast(self.get_ready_status())

                elif msg_type == "translator_stop":
                    self.translator_active = False
                    if self.translator_task:
                        await self.translator_task
                        self.translator_task = None
                    self.translator_target = None
                    await websocket.send(json.dumps({"type": "translator_stopped"}))
                    await self.broadcast(self.get_ready_status())

                elif msg_type == "stt_start":
                    if self.translator_active:
                        await websocket.send(json.dumps({"type": "error", "message": "translator_active"}))
                    else:
                        self.start_microphone_recording()

                elif msg_type == "stt_stop":
                    audio_data = self.stop_microphone_recording()
                    lang = msg.get("language", "de")
                    text, conf = await self.transcribe_audio(audio_data, language=lang)
                    await websocket.send(json.dumps({
                        "type": "stt_result",
                        "text": text,
                        "confidence": conf
                    }))

                else:
                    await websocket.send(json.dumps({"type": "error", "message": "unknown_type"}))

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {websocket.remote_address}")
        finally:
            self.connected_clients.remove(websocket)

    async def run(self):
        logger.info("Initializing models & status...")
        await asyncio.to_thread(self.check_models)
        
        async with websockets.serve(self.handle_client, HOST, PORT):
            logger.info(f"Sidecar WebSocket Server running on ws://{HOST}:{PORT}")
            await self.broadcast(self.get_ready_status())
            await asyncio.Future()

def main():
    sidecar = VoiceSidecar()
    try:
        asyncio.run(sidecar.run())
    except KeyboardInterrupt:
        logger.info("Sidecar stopped by user.")

if __name__ == "__main__":
    main()
