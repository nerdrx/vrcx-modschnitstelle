import argostranslate.translate
import asyncio
import time
import textwrap
from pythonosc.udp_client import SimpleUDPClient

def check_translator_ready():
    """Checks if argos translate has the required languages installed."""
    try:
        installed = [l.code for l in argostranslate.translate.get_installed_languages()]
        # We need de, en (as pivot/target), ru, ja
        required = {'de', 'en', 'ru', 'ja'}
        return required.issubset(set(installed))
    except Exception:
        return False

def translate_text(text: str, target_lang: str, source_lang: str = "de") -> str:
    """Translates text using argos translate. Handles pivoting automatically."""
    try:
        return argostranslate.translate.translate(text, source_lang, target_lang)
    except Exception as e:
        print(f"[TranslatorEngine] Translation error: {e}")
        return text

class OscChatbox:
    def __init__(self, host="127.0.0.1", port=9000):
        self.host = host
        self.port = port
        self.client = SimpleUDPClient(host, port)
        self.last_send_time = 0.0

    def set_typing(self, is_typing: bool):
        try:
            self.client.send_message("/chatbox/typing", is_typing)
        except Exception as e:
            print(f"[OscChatbox] Error sending typing status: {e}")

    async def send_text(self, text: str, show_original: bool = False, original: str = ""):
        if show_original and original:
            text = f"{text} ({original})"
            
        # VRChat chatbox limit is 144 chars
        chunks = textwrap.wrap(text, width=144)
        
        for chunk in chunks:
            now = time.time()
            elapsed = now - self.last_send_time
            if elapsed < 1.5:
                await asyncio.sleep(1.5 - elapsed)
                
            try:
                self.client.send_message("/chatbox/input", [chunk, True, False])
                self.last_send_time = time.time()
            except Exception as e:
                print(f"[OscChatbox] Error sending text: {e}")
