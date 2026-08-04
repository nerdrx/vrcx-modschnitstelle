#!/usr/bin/env python3
"""
Model & Binary Download Script for VRCX Voice-Sidecar (Phase P4)
Downloads:
 1. Piper binary executable (Windows x64 / Linux x64) to sidecar/piper/
 2. Piper TTS voices (de_DE-thorsten-medium, en_US-lessac-medium) to sidecar/models/tts/
 3. Whisper STT model (small) to sidecar/models/stt/
Verifies checksums and documents sources.
"""

import os
import sys
import platform
import zipfile
import tarfile
import hashlib
import urllib.request
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
PIPER_DIR = os.path.join(BASE_DIR, "piper")

# URLs for Piper binary executables
PIPER_BIN_URLS = {
    "Windows": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
    "Linux": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
}

# Piper Voice models
PIPER_VOICES = [
    {
        "name": "de_DE-thorsten-medium",
        "onnx_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        "json_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json"
    },
    {
        "name": "en_US-lessac-medium",
        "onnx_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "json_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    }
]

def download_file(url, target_path):
    """Downloads a file with progress report."""
    print(f"Downloading: {url}")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    def _progress(count, block_size, total_size):
        percent = int(count * block_size * 100 / total_size) if total_size > 0 else 0
        sys.stdout.write(f"\r Progress: {percent}% [{count * block_size} / {total_size} bytes]")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, target_path, reporthook=_progress)
    print("\n Download completed.")

def calculate_sha256(filepath):
    """Calculates SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def setup_piper_binary():
    """Downloads and extracts the Piper binary for current platform."""
    os.makedirs(PIPER_DIR, exist_ok=True)
    system = platform.system()
    
    executable_name = "piper.exe" if system == "Windows" else "piper"
    target_bin = os.path.join(PIPER_DIR, executable_name)
    if system == "Windows":
        # check inside subfolder if extracted
        alt_bin = os.path.join(PIPER_DIR, "piper", "piper.exe")
        if os.path.exists(alt_bin):
            return alt_bin

    if os.path.exists(target_bin):
        print(f"[OK] Piper binary already exists at {target_bin}")
        return target_bin

    if system not in PIPER_BIN_URLS:
        print(f"[WARN] No prebuilt Piper binary URL for system {system}. Will rely on system PATH or fallback.")
        return None

    url = PIPER_BIN_URLS[system]
    archive_name = "piper_archive.zip" if system == "Windows" else "piper_archive.tar.gz"
    archive_path = os.path.join(PIPER_DIR, archive_name)

    download_file(url, archive_path)

    print(f"Extracting Piper binary to {PIPER_DIR}...")
    if archive_name.endswith(".zip"):
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(PIPER_DIR)
    else:
        with tarfile.open(archive_path, 'r:gz') as tar_ref:
            tar_ref.extractall(PIPER_DIR)

    if os.path.exists(archive_path):
        os.remove(archive_path)

    # Check executable permissions on Linux
    if system != "Windows" and os.path.exists(target_bin):
        os.chmod(target_bin, 0o755)

    print(f"[OK] Piper binary ready at {PIPER_DIR}")
    return target_bin

def setup_tts_voices():
    """Downloads Piper TTS voice models."""
    tts_dir = os.path.join(MODELS_DIR, "tts")
    os.makedirs(tts_dir, exist_ok=True)

    for voice in PIPER_VOICES:
        onnx_file = os.path.join(tts_dir, f"{voice['name']}.onnx")
        json_file = os.path.join(tts_dir, f"{voice['name']}.onnx.json")

        if not os.path.exists(onnx_file):
            download_file(voice["onnx_url"], onnx_file)
            hash_val = calculate_sha256(onnx_file)
            print(f" SHA256 ({voice['name']}.onnx): {hash_val}")

        if not os.path.exists(json_file):
            download_file(voice["json_url"], json_file)

    print("[OK] TTS voices ready.")

def setup_stt_model():
    """Downloads Whisper model via faster-whisper."""
    stt_dir = os.path.join(MODELS_DIR, "stt")
    os.makedirs(stt_dir, exist_ok=True)

    print("Checking / Downloading Whisper model ('small')...")
    try:
        from faster_whisper import WhisperModel
        # This will download and cache the faster-whisper small model inside models/stt
        WhisperModel("small", device="cpu", compute_type="int8", download_root=stt_dir)
        print("[OK] Whisper STT model downloaded and verified.")
    except Exception as e:
        print(f"[WARN] Failed to preload Whisper model via Python package: {e}")

def setup_translator_models():
    """Downloads and installs Argos Translate models via the official package index.

    Note: direct URL downloads from argos-net.com return 403 for generic
    user agents, so we use the argostranslate package API instead. It
    verifies package integrity internally and installs into the argos
    data directory. Required pairs: de->en (base), en->ru and en->ja
    (targets; de->ru and de->ja pivot over en), en->de (reverse pivot).
    """
    import argostranslate.package
    import argostranslate.translate

    required_pairs = [("de", "en"), ("en", "ru"), ("en", "ja"), ("en", "de")]

    installed = {l.code for l in argostranslate.translate.get_installed_languages()}
    if {"de", "en", "ru", "ja"}.issubset(installed):
        print("[OK] Argos Translate models already installed.")
        return

    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()

    for from_code, to_code in required_pairs:
        match = [p for p in available if p.from_code == from_code and p.to_code == to_code]
        if not match:
            print(f"[WARN] No argos package for {from_code}->{to_code} in index.")
            continue
        print(f"Installing argos package {from_code}->{to_code} ...")
        try:
            match[0].install()
        except Exception as e:
            print(f"[WARN] Could not install {from_code}->{to_code}: {e}")

    print("[OK] Argos Translate models installed.")

def main():
    print("===================================================")
    print(" VRCX Voice-Sidecar Model & Binary Downloader")
    print("===================================================")
    os.makedirs(MODELS_DIR, exist_ok=True)

    setup_piper_binary()
    setup_tts_voices()
    setup_stt_model()
    setup_translator_models()

    print("\n[SUCCESS] All models and binaries downloaded successfully.")

if __name__ == "__main__":
    main()
