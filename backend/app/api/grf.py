from fastapi import APIRouter, Response, HTTPException, Query
from app.services.grf_reader import grf_reader

router = APIRouter()

@router.get("/sprite")
async def get_sprite(
    type: str = Query(..., description="Type of sprite (item, mob)"), 
    id: int = Query(..., description="ID of the entity (e.g. 501 for Red Potion)")
):
    """
    Returns the PNG representation of an entity's sprite or icon in real-time.
    If 'type' is 'item', we search the GRF for the item's BMP icon and convert it to PNG.
    """
    if type == "item":
        png_bytes = grf_reader.get_item_icon(id)
        if png_bytes:
            return Response(content=png_bytes, media_type="image/png")
            
    elif type == "npc":
        from app.services.sprite_thumbnail import get_first_frame_png
        png_bytes = get_first_frame_png(id)
        if png_bytes:
            return Response(content=png_bytes, media_type="image/png")
            
    raise HTTPException(status_code=404, detail="Sprite not found in GRF")


@router.get("/assets")
async def list_assets(
    type: str = Query("item_icon", description="Asset type: item_icon or item_collection"),
    query: str = Query("", description="Search term"),
    skip: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=500),
):
    """Lists available assets inside GRFs matching query."""
    return grf_reader.list_grf_assets(asset_type=type, query=query, skip=skip, limit=limit)


@router.get("/resource_image")
async def get_resource_image(
    type: str = Query("item_icon", description="Asset type: item_icon or item_collection"),
    name: str = Query(..., description="Resource name"),
):
    """Returns PNG image of a GRF asset by resource name."""
    if type == "item_collection":
        png_bytes = grf_reader.get_collection_by_resource_name(name)
    else:
        png_bytes = grf_reader.get_icon_by_resource_name(name)

    if png_bytes:
        return Response(content=png_bytes, media_type="image/png")

    # Fallback to dummy png if not found
    return Response(content=grf_reader.generate_dummy_png(), media_type="image/png")

