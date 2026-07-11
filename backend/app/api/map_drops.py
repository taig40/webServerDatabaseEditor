from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.map_drop_parser import map_drop_db

router = APIRouter()


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class DropEntry(BaseModel):
    Index: int = 0
    Item: str
    Rate: int
    RandomOptionGroup: Optional[str] = None


class SpecificDropEntry(BaseModel):
    Monster: str
    Drops: List[DropEntry] = []


class MapEntry(BaseModel):
    Map: str
    GlobalDrops: List[DropEntry] = []
    SpecificDrops: List[SpecificDropEntry] = []


class MapDropsPayload(BaseModel):
    maps: List[MapEntry]


class PreviewPayload(BaseModel):
    maps: List[MapEntry]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
async def get_map_drops():
    """
    Faz o parse completo de map_drops.yml e retorna como JSON.
    """
    try:
        data = map_drop_db.load()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler map_drops.yml: {e}")


@router.put("")
async def save_map_drops(payload: MapDropsPayload):
    """
    Recebe o JSON modificado e sobrescreve map_drops.yml mantendo a estrutura.
    """
    try:
        maps_raw = [m.dict() for m in payload.maps]
        map_drop_db.save(maps_raw)
        return {"success": True, "message": "map_drops.yml salvo com sucesso."}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar map_drops.yml: {e}")


@router.post("/preview")
async def preview_yaml(payload: PreviewPayload):
    """
    Retorna o YAML gerado pelo payload sem salvar no disco (para o painel Raw Code).
    """
    try:
        maps_raw = [m.dict() for m in payload.maps]
        yaml_str = map_drop_db.to_yaml_preview(maps_raw)
        return {"yaml": yaml_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar preview: {e}")
