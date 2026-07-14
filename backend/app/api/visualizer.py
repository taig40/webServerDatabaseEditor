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
    is_male: bool = Query(True, description="Define se o gênero do personagem é masculino"),
    direction: int = Query(0, description="Direção do personagem (0-7)")
):
    """
    Retorna a imagem composta do personagem (Corpo + Cabeça + Acessório/Chapéu)
    diretamente como uma resposta de imagem PNG.
    Aceita 'resource_name' para a resolução do chapéu.
    """
    res_name = resource_name
    if not res_name or res_name.strip() in ("", "0", "None", "null"):
        res_name = ""

    try:
        image_bytes = compose_character(res_name, is_male, direction)
        return Response(content=image_bytes, media_type="image/png")
    except Exception as e:
        logger.exception(f"Failed to compose character sprite for resource '{res_name}': {e}")
        raise HTTPException(status_code=500, detail="ERROR_COMPOSITION_FAILED")


from functools import lru_cache

@lru_cache(maxsize=1)
def get_cached_accessories_list():
    """
    Retorna a lista completa de acessórios com cache para evitar
    reprocessar os arquivos LUA a cada chamada.
    """
    return visuals_db.get_all_accessories()


@router.get("/accessories")
def get_accessories():
    """
    Retorna a lista completa de acessórios mapeados do cliente (view_id, sprite_name, constant).
    """
    return get_cached_accessories_list()

