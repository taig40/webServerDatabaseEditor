from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.map_drop_parser import map_drop_db

router = APIRouter()



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


@router.get("")
async def get_map_drops():
    """Parses ``map_drops.yml`` and returns the full content as structured JSON.

    Returns:
        dict: Parsed map drops data.

    Raises:
        HTTPException: 500 on file read/parse error.
    """
    try:
        data = map_drop_db.load()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler map_drops.yml: {e}")


@router.put("")
async def save_map_drops(payload: MapDropsPayload):
    """Serializes the modified map drops payload and overwrites ``map_drops.yml``.

    Args:
        payload: Full map drops payload.

    Returns:
        dict: ``{"success": True, "message": "..."}``.`

    Raises:
        HTTPException: 404 if the file does not exist; 500 on write error.
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
    """Returns the YAML string generated from the payload without writing to disk.

    Used to drive the Raw Code preview panel in the Map Drops Editor.

    Args:
        payload: Map drops payload to convert.

    Returns:
        dict: ``{"yaml": "..."}``.`

    Raises:
        HTTPException: 500 on serialization error.
    """
    try:
        maps_raw = [m.dict() for m in payload.maps]
        yaml_str = map_drop_db.to_yaml_preview(maps_raw)
        return {"yaml": yaml_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar preview: {e}")
