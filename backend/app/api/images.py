from fastapi import APIRouter, Response, HTTPException
from app.services.iteminfo_parser import iteminfo_db
from app.services.grf_reader import grf_reader, MAX_GRF_SLOTS
from functools import lru_cache
from typing import Optional
import os

router = APIRouter()

TRANSPARENT_1X1_PNG = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'


def _ensure_resources_loaded():
    if not grf_reader.loaded:
        grf_path = os.environ.get("GRF_PATH", "").strip()
        override_path = os.environ.get("GRF_OVERRIDE_PATH", "").strip()
        grf_list = []
        for i in range(MAX_GRF_SLOTS):
            slot_path = os.environ.get(f"GRF_{i}", "").strip()
            if slot_path:
                grf_list.append({"priority": i, "path": slot_path})
        if not grf_list and grf_path:
            grf_list.append({"priority": 0, "path": grf_path})
        if grf_list:
            grf_reader.load_multi(grf_list, override_path=override_path)

    if not iteminfo_db.loaded:
        try:
            iteminfo_db.load()
        except Exception:
            pass


@lru_cache(maxsize=5000)
def get_cached_item_icon(item_id: int) -> Optional[bytes]:
    _ensure_resources_loaded()
    png_bytes = grf_reader.get_item_icon(item_id)
    return png_bytes


@lru_cache(maxsize=5000)
def get_cached_item_collection(item_id: int) -> Optional[bytes]:
    _ensure_resources_loaded()
    png_bytes = grf_reader.get_item_collection(item_id)
    return png_bytes


@router.get("/item/{item_id}")
async def get_item_image(item_id: int):
    png_bytes = get_cached_item_icon(item_id)
    if png_bytes:
        return Response(content=png_bytes, media_type="image/png")

    return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")


@router.get("/collection/{item_id}")
async def get_collection_image(item_id: int):
    png_bytes = get_cached_item_collection(item_id)
    if png_bytes:
        return Response(content=png_bytes, media_type="image/png")

    return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")


@router.get("/item_icon")
async def get_item_icon_by_name(resource_name: Optional[str] = None):
    if not resource_name:
        return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")
    
    _ensure_resources_loaded()
    png_bytes = grf_reader.get_icon_by_resource_name(resource_name)
    if png_bytes:
        return Response(content=png_bytes, media_type="image/png")
    return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")


@router.get("/collection_image")
async def get_collection_image_by_name(resource_name: Optional[str] = None):
    if not resource_name:
        return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")
    
    _ensure_resources_loaded()
    png_bytes = grf_reader.get_collection_by_resource_name(resource_name)
    if png_bytes:
        return Response(content=png_bytes, media_type="image/png")
    return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")


@router.get("/drop")
async def get_drop_image(resource_name: Optional[str] = None):
    if not resource_name:
        return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")
        
    try:
        from app.services.sprite_engine.compositor import render_item_drop
        _ensure_resources_loaded()
        png_bytes = render_item_drop(resource_name)
        return Response(content=png_bytes, media_type="image/png")
    except Exception as e:
        print(f"Error rendering drop sprite for {resource_name}: {e}")
        return Response(content=TRANSPARENT_1X1_PNG, media_type="image/png")
