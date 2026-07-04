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
