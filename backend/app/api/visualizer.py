import logging
from fastapi import APIRouter, Response, HTTPException, Query
from typing import Optional

from app.services.sprite_engine.compositor import compose_character
from app.services.visuals_parser import visuals_db

logger = logging.getLogger("api.visualizer")

router = APIRouter()

@router.get("/preview")
async def get_preview(
    sprite_name: Optional[str] = Query(None, description="Nome do sprite do acessório (ex: cap)"),
    view_id: Optional[int] = Query(None, description="View ID do acessório para resolução automática"),
    is_male: bool = Query(True, description="Define se o gênero do personagem é masculino"),
    direction: int = Query(0, description="Direção do personagem (0-7)")
):
    """
    Retorna a imagem composta do personagem (Corpo + Cabeça + Acessório/Chapéu)
    diretamente como uma resposta de imagem PNG.
    Aceita 'sprite_name' ou 'view_id' para a resolução do chapéu.
    """
    resolved_sprite = sprite_name
    
    if view_id is not None:
        try:
            # 0 no rAthena significa sem acessório (chapéu)
            if view_id == 0:
                resolved_sprite = ""
            else:
                visual_info = visuals_db.get_visual(view_id)
                if visual_info and visual_info.get("name"):
                    resolved_sprite = visual_info["name"]
                    logger.info(f"Resolved view_id {view_id} to sprite name '{resolved_sprite}'")
        except Exception as e:
            logger.warning(f"Failed to resolve view_id {view_id} using visuals_db: {e}")
            
    if resolved_sprite is None:
        if view_id is not None:
            # Fallback se não foi resolvido pelo banco, tenta usar o ID como string
            resolved_sprite = str(view_id)
        else:
            raise HTTPException(status_code=400, detail="ERROR_SPRITE_NAME_OR_VIEW_ID_REQUIRED")

    try:
        image_bytes = compose_character(resolved_sprite, is_male, direction)
        return Response(content=image_bytes, media_type="image/png")
    except Exception as e:
        logger.exception(f"Failed to compose character sprite: {e}")
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

