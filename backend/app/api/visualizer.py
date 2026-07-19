import logging
from fastapi import APIRouter, Response, HTTPException, Query
from typing import Optional

from app.services.sprite_engine.compositor import compose_character
from app.services.visuals_parser import visuals_db

logger = logging.getLogger("api.visualizer")

router = APIRouter()

@router.get("/preview")
async def get_preview(
    resource_name: Optional[str] = Query(None, description="Nome do recurso do acessório (ex: _CustomWings)"),
    robe_name: Optional[str] = Query(None, description="Nome do recurso da capa/asa (ex: _C_White_Angel_Wing)"),
    is_male: bool = Query(True, description="Define se o gênero do personagem é masculino"),
    direction: int = Query(0, description="Direção do personagem (0-7)")
):
    """Returns a composite character preview image (Body + Head + Headgear/Robe) as PNG.

    Empty, ``"0"``, ``"None"``, or ``"null"`` resource names are treated as no accessory.
    The response is served with 1-year immutable cache headers.

    Args:
        resource_name: Headgear sprite resource name (e.g. ``_CustomWings``).
        robe_name: Robe/wing sprite resource name (e.g. ``_C_White_Angel_Wing``).
        is_male: Character gender flag.
        direction: Sprite direction index (0–7).

    Returns:
        Response: PNG composite image bytes.

    Raises:
        HTTPException: 500 if sprite composition fails.
    """
    res_name = resource_name
    if not res_name or res_name.strip() in ("", "0", "None", "null"):
        res_name = ""

    rb_name = robe_name
    if not rb_name or rb_name.strip() in ("", "0", "None", "null"):
        rb_name = ""

    try:
        image_bytes = compose_character(res_name, rb_name, is_male, direction)
        return Response(content=image_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})
    except Exception as e:
        logger.exception(f"Failed to compose character sprite for resource '{res_name}': {e}")
        raise HTTPException(status_code=500, detail="ERROR_COMPOSITION_FAILED")


from functools import lru_cache

@lru_cache(maxsize=1)
def get_cached_accessories_list():
    """Returns the full accessories list with LRU caching to avoid re-parsing Lua files on every call."""
    return visuals_db.get_all_accessories()


@router.get("/accessories")
def get_accessories():
    """Returns the full list of accessories mapped from the client (``view_id``, ``sprite_name``, ``constant``).

    Results are LRU-cached to avoid re-parsing the Lua source files on every request.

    Returns:
        list: All mapped accessory entries.
    """
    return get_cached_accessories_list()

