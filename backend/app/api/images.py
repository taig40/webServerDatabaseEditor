from fastapi import APIRouter, Response
from app.services.iteminfo_parser import iteminfo_db
from app.services.grf_reader import grf_reader, MAX_GRF_SLOTS
from functools import lru_cache
from typing import Optional
import os

router = APIRouter()

TRANSPARENT_1X1_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
    b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
)


def _ensure_resources_loaded():
    """Lazily loads GRF files and iteminfo if they have not been loaded yet."""
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
    """Returns PNG bytes for an item icon from the GRF, cached for up to 5000 entries."""
    _ensure_resources_loaded()
    return grf_reader.get_item_icon(item_id)


@lru_cache(maxsize=5000)
def get_cached_item_collection(item_id: int) -> Optional[bytes]:
    """Returns PNG bytes for an item collection image from the GRF, cached for up to 5000 entries."""
    _ensure_resources_loaded()
    return grf_reader.get_item_collection(item_id)


def _resolve_aegis_to_item_id(aegis_name: str) -> Optional[int]:
    """Resolves an item AegisName to its numeric ID via yaml_db.

    Args:
        aegis_name: The rAthena AegisName of the item (e.g. ``Lunatic_Egg``).

    Returns:
        int | None: The item ID if found, otherwise ``None``.
    """
    try:
        from app.services.yaml_parser import yaml_db
        if yaml_db.is_loading:
            return None
        for item in yaml_db.get_items():
            if item.get("AegisName") == aegis_name:
                return item.get("Id")
        
        # Fuzzy match for typos/apostrophes
        aegis_clean = aegis_name.replace("'", "").replace("_", "").lower()
        for item in yaml_db.get_items():
            aegis = item.get("AegisName", "")
            if aegis and aegis.replace("'", "").replace("_", "").lower() == aegis_clean:
                return item.get("Id")
    except Exception:
        pass
    return None


import hashlib
from fastapi import Request

# Development-safe cache strategy:
# - 'no-cache' forces the browser to revalidate on every request (no stale images).
# - ETag avoids re-downloading bytes when the image hasn't changed (304 Not Modified).
_CACHE_HEADERS = {"Cache-Control": "no-cache"}


def _png_response(png_bytes: Optional[bytes], request: Optional[Request] = None) -> Response:
    content = png_bytes if png_bytes else TRANSPARENT_1X1_PNG
    etag = '"' + hashlib.md5(content).hexdigest() + '"'
    if request is not None:
        if_none_match = request.headers.get("if-none-match", "")
        if if_none_match == etag:
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "no-cache"})
    headers = {"Cache-Control": "no-cache", "ETag": etag}
    return Response(content=content, media_type="image/png", headers=headers)


@router.get("/item/{item_id}")
async def get_item_image(item_id: int, request: Request):
    """Returns the PNG icon for the given item ID; falls back to a 1×1 transparent PNG."""
    return _png_response(get_cached_item_icon(item_id), request)


@router.get("/item_by_aegis/{aegis_name}")
async def get_item_icon_by_aegis(aegis_name: str, request: Request):
    """Returns the PNG icon for the item identified by its AegisName.

    Resolves ``AegisName → item_id`` via the in-memory item database and then
    delegates to the same ``get_item_icon`` pipeline used by ``/item/{item_id}``.

    Args:
        aegis_name: The rAthena AegisName of the item (e.g. ``Lunatic_Egg``,
            ``Silk_Ribbon``).

    Returns:
        Response: PNG icon with ETag-based conditional caching.
            Falls back to a 1×1 transparent PNG if the item is not found.
    """
    _ensure_resources_loaded()
    item_id = _resolve_aegis_to_item_id(aegis_name)
    if item_id is not None:
        return _png_response(get_cached_item_icon(item_id), request)
    return _png_response(None, request)


@router.get("/collection/{item_id}")
async def get_collection_image(item_id: int, request: Request):
    """Returns the PNG collection image for the given item ID; falls back to a 1×1 transparent PNG."""
    return _png_response(get_cached_item_collection(item_id), request)


@router.get("/item_icon")
async def get_item_icon_by_name(resource_name: Optional[str] = None, request: Request = None):
    """Returns the PNG icon for the given resource name; falls back to a 1×1 transparent PNG."""
    if not resource_name:
        return _png_response(None, request)
    _ensure_resources_loaded()
    return _png_response(grf_reader.get_icon_by_resource_name(resource_name), request)


@router.get("/collection_image")
async def get_collection_image_by_name(resource_name: Optional[str] = None, request: Request = None):
    """Returns the PNG collection image for the given resource name; falls back to a 1×1 transparent PNG."""
    if not resource_name:
        return _png_response(None, request)
    _ensure_resources_loaded()
    return _png_response(grf_reader.get_collection_by_resource_name(resource_name), request)


@router.get("/drop")
async def get_drop_image(resource_name: Optional[str] = None, request: Request = None):
    """Returns the rendered drop-sprite PNG for the given resource name."""
    if not resource_name:
        return _png_response(None, request)
    try:
        from app.services.sprite_engine.compositor import render_item_drop
        _ensure_resources_loaded()
        png_bytes = render_item_drop(resource_name)
        return _png_response(png_bytes, request)
    except Exception as e:
        print(f"Error rendering drop sprite for {resource_name}: {e}")
        return _png_response(None, request)
