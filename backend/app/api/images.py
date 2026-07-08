from fastapi import APIRouter, Response, HTTPException
from app.services.iteminfo_parser import iteminfo_db
from app.services.grf_reader import grf_reader
from functools import lru_cache
from typing import Optional

router = APIRouter()

@lru_cache(maxsize=5000)
def get_cached_item_icon(item_id: int) -> Optional[bytes]:
    if not iteminfo_db.loaded:
        return None
    entry = iteminfo_db.item_map.get(item_id)
    if not entry:
        return None
        
    resource_name = entry.get("identifiedResourceName")
    if not resource_name or str(resource_name).strip() == "":
        resource_name = entry.get("unIdentifiedResourceName")
        
    if not resource_name or str(resource_name).strip() == "":
        return None
        
    return grf_reader.get_icon_by_resource_name(resource_name)

@router.get("/item/{item_id}")
async def get_item_image(item_id: int):
    png_bytes = get_cached_item_icon(item_id)
    if png_bytes:
        return Response(content=png_bytes, media_type="image/png")
    
    raise HTTPException(status_code=404, detail="Image not found")
