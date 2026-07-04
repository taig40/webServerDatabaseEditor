import base64
import os

def obfuscate(value: str) -> str:
    """Encodes a string into obf:<base64> format."""
    if not value:
        return ""
    encoded = base64.b64encode(value.encode('utf-8')).decode('utf-8')
    return f"obf:{encoded}"

def deobfuscate(value: str) -> str:
    """Decodes a string if it starts with obf:<base64>."""
    if not value:
        return ""
    if value.startswith("obf:"):
        try:
            encoded_part = value[4:]
            decoded = base64.b64decode(encoded_part.encode('utf-8')).decode('utf-8')
            return decoded
        except Exception as e:
            print(f"[Warning] Failed to deobfuscate value: {e}")
            return value
    return value

def deobfuscate_env():
    """Automatically deobfuscates environment variables starting with obf: in os.environ."""
    for key, value in list(os.environ.items()):
        if value and value.startswith("obf:"):
            os.environ[key] = deobfuscate(value)
