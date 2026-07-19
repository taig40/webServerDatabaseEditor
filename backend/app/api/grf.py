from fastapi import APIRouter, Response, HTTPException, Query
from app.services.grf_reader import grf_reader

router = APIRouter()

@router.get("/sprite")
async def get_sprite(
    type: str = Query(..., description="Type of sprite (item, mob, npc)"),
    id: str = Query(..., description="ID or AegisName of the entity")
):
    """Returns the PNG representation of an entity's sprite or icon in real-time.

    For ``type=item``, searches the GRF for the item icon BMP and converts to PNG.
    For ``type=npc``, extracts the first frame of the NPC sprite file.
    Responses are served with 1-year immutable cache headers.

    Args:
        type: Entity category — ``"item"`` or ``"npc"``.
        id: Numeric ID string or AegisName string of the entity.

    Returns:
        Response: PNG image bytes.

    Raises:
        HTTPException: 404 if the sprite is not found in any loaded GRF.
    """
    if type == "item":
        try:
            item_id = int(id)
            png_bytes = grf_reader.get_item_icon(item_id)
        except ValueError:
            png_bytes = None
        if png_bytes:
            return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})

    elif type == "npc":
        from app.services.sprite_thumbnail import get_first_frame_png
        try:
            npc_id = int(id)
            png_bytes = get_first_frame_png(npc_id)
        except ValueError:
            png_bytes = get_first_frame_png(0, fallback_aegis=id)
        if png_bytes:
            return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})

    raise HTTPException(status_code=404, detail="Sprite not found in GRF")


@router.get("/assets")
async def list_assets(
    type: str = Query("item_icon", description="Asset type: item_icon or item_collection"),
    query: str = Query("", description="Search term"),
    skip: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=500),
):
    """Lists available assets inside the loaded GRFs matching the search query.

    Args:
        type: Asset category — ``"item_icon"`` or ``"item_collection"``.
        query: Optional search term to filter asset names.
        skip: Number of results to skip.
        limit: Maximum number of results to return (1–500).

    Returns:
        dict: Matching asset entries.
    """
    return grf_reader.list_grf_assets(asset_type=type, query=query, skip=skip, limit=limit)


@router.get("/resource_image")
async def get_resource_image(
    type: str = Query("item_icon", description="Asset type: item_icon or item_collection"),
    name: str = Query(..., description="Resource name"),
):
    """Returns the PNG image of a GRF asset by resource name.

    Falls back to a dummy placeholder PNG if the asset is not found.

    Args:
        type: Asset category — ``"item_icon"`` or ``"item_collection"``.
        name: Resource name string.

    Returns:
        Response: PNG image bytes (dummy placeholder if not found).
    """
    if type == "item_collection":
        png_bytes = grf_reader.get_collection_by_resource_name(name)
    else:
        png_bytes = grf_reader.get_icon_by_resource_name(name)

    if png_bytes:
        return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})

    return Response(content=grf_reader.generate_dummy_png(), media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/skill_icon")
async def get_skill_icon(
    name: str = Query("", description="Skill resource Name, e.g. SM_SWORD"),
    id: int = Query(0, description="Skill numeric Id")
):
    """Returns the PNG skill icon from the GRF, resolved by name or numeric ID.

    Args:
        name: Skill constant name (e.g. ``SM_SWORD``).
        id: Skill numeric ID (used as fallback if name is empty).

    Returns:
        Response: PNG image bytes with 1-year immutable cache headers.
    """
    png_bytes = grf_reader.get_skill_icon(name, id)
    return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})

@router.get("/skill-icon/{icon_name}")
async def get_skill_icon_by_path(icon_name: str):
    """Returns the PNG skill icon by path-style name (alternative route for URL-based access).

    Args:
        icon_name: Skill icon resource name embedded in the URL path.

    Returns:
        Response: PNG image bytes with 1-year immutable cache headers.
    """
    png_bytes = grf_reader.get_skill_icon(icon_name)
    return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})


