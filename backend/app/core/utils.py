import os
import codecs
from fastapi import HTTPException

def read_file_safely(filepath: str, encoding: str) -> str:
    """
    Opens and reads a file strictly checking the encoding.
    Raises HTTPException status 400 (ENCODING_MISMATCH) if UnicodeDecodeError occurs.
    """
    try:
        # Standard open with strict encoding verification
        with open(filepath, "r", encoding=encoding) as f:
            return f.read()
    except UnicodeDecodeError as e:
        filename = os.path.basename(filepath)
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "ENCODING_MISMATCH",
                "message": f"Falha de decodificação no arquivo '{filename}' usando a codificação '{encoding}'.",
                "suggestion": "Vá até a aba Configurações (Settings) para ajustar o encoding (Encoding do Cliente ou do Servidor) correspondente."
            }
        )
