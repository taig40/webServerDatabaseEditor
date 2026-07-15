import logging
from typing import Tuple, Optional
from app.services.grf_reader import grf_reader
from .spr_parser import SprParser
from .act_parser import ActParser

logger = logging.getLogger("sprite_engine.sprite_loader")

def to_latin1_path(utf8_path: str) -> str:
    """
    Translates standard UTF-8 paths containing Korean/special characters
    (e.g., '남' or '여') to euc-kr/cp949 encoded bytes, then decodes them
    as latin-1. This is critical for indexing into the grf_reader file keys
    which are stored as byte-transparent latin-1 mappings.
    """
    if not utf8_path:
        return ""
    
    # 1. Normalize directory separators to forward slash
    normalized = utf8_path.replace('\\', '/')
    
    # 2. Encode to euc-kr/cp949 and decode as latin-1 to match GRF index keys
    try:
        latin1_path = normalized.encode('euc-kr').decode('latin-1')
        logger.debug(f"Converted path '{utf8_path}' to latin-1 index: '{latin1_path}'")
        return latin1_path
    except Exception as e:
        logger.warning(f"Failed to encode path '{utf8_path}' to euc-kr: {e}. Trying cp949.")
        try:
            latin1_path = normalized.encode('cp949', errors='replace').decode('latin-1')
            return latin1_path
        except Exception as e2:
            logger.error(f"Failed all encoding transitions for path '{utf8_path}': {e2}")
            return normalized


def load_sprite_from_grf(spr_path: str, act_path: Optional[str] = None) -> Tuple[Optional[SprParser], Optional[ActParser]]:
    """
    Loads SPR and ACT files from the GRF archive.
    
    Parameters:
        spr_path (str): The file path inside GRF to the .spr file.
        act_path (str, optional): The file path inside GRF to the .act file.
        
    Returns:
        Tuple[Optional[SprParser], Optional[ActParser]]: A tuple containing instances
        of the SPR and ACT parsers if successfully loaded/parsed, otherwise None.
    """
    spr_parser = None
    act_parser = None
    
    if not grf_reader.loaded:
        logger.warning("grf_reader is not initialized or loaded. Cannot extract sprite files.")
        return None, None

        return None, None

    logger.info(f"Extracting SPR: '{spr_path}'")
    spr_data = grf_reader.extract_file(spr_path)
    
    if not spr_data:
        logger.error(f"SPR file not found in GRF archive: '{spr_path}'")
        return None, None
        
    try:
        spr_parser = SprParser(spr_data)
        logger.info(f"Successfully parsed SPR from GRF with version {hex(spr_parser.version)}")
    except Exception as e:
        logger.exception(f"Failed to parse SPR file: '{spr_path}': {e}")
        return None, None

    if act_path:
        logger.info(f"Extracting ACT: '{act_path}'")
        act_data = grf_reader.extract_file(act_path)
        
        if not act_data:
            logger.warning(f"ACT file not found in GRF archive: '{act_path}'")
        else:
            try:
                act_parser = ActParser(act_data)
                logger.info(f"Successfully parsed ACT from GRF with version {hex(act_parser.version)}")
            except Exception as e:
                logger.exception(f"Failed to parse ACT file: '{act_path}': {e}")

    return spr_parser, act_parser
