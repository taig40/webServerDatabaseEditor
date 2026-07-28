"""pets.py — API endpoints for Pet DB (pet_db.yml)."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Optional
from app.services.pet_parser import pet_db

router = APIRouter()


class PetUpdate(BaseModel):
    data: dict[str, Any]


class PetCreate(BaseModel):
    data: dict[str, Any]


@router.get("/status")
async def get_pet_status():
    """Returns the current background loading status for the pet database.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``pets_loaded``.
    """
    return {
        "is_loading": pet_db.is_loading,
        "message": pet_db.loading_status,
        "pets_loaded": pet_db.entries_loaded,
    }


@router.get("/")
async def get_pets(
    skip: int = Query(0),
    limit: int = Query(50000),
):
    """Returns a paginated list of all pets from the in-memory database.

    Args:
        skip: Number of entries to skip.
        limit: Maximum number of entries to return.

    Returns:
        dict: ``total``, ``skip``, ``limit``, and ``pets`` list.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    pets = pet_db.get_pets()
    return {
        "total": len(pets),
        "skip": skip,
        "limit": limit,
        "pets": pets[skip : skip + limit],
    }


@router.get("/{mob}/equip_animation")
async def get_pet_equip_animation(mob: str, equip: str):
    """Returns the canvas-ready animation JSON for a pet equipped with an accessory.

    In kRO, pet equipments are not rendered dynamically as separate layers; instead, 
    a completely separate baked sprite is provided in the mob folder, typically named
    ``{mob_sprite_name}_{equip_resource_name}.spr``.

    Args:
        mob: Pet mob AegisName (e.g. ``ISIS``).
        equip: EquipItem AegisName (e.g. ``Queen's_Hair_Ornament``).

    Returns:
        JSONResponse: Spritesheet animation data with 1-year immutable cache
            headers, or 404 if the combined equipped sprite is not found.
    """
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    from app.services.sprite_parser import get_sprite_name_for_mob, get_mob_animation_data
    from app.services.iteminfo_parser import iteminfo_db

    # 1. Resolve base mob sprite name
    sprite_name = get_sprite_name_for_mob(0, mob)
    if not sprite_name:
        raise HTTPException(status_code=404, detail="ERROR_MOB_SPRITE_NOT_FOUND")

    # 2. Resolve AegisName → item_id → resource_name via yaml_db first, then iteminfo
    equip_resource_name: str | None = None
    try:
        from app.services.yaml_parser import yaml_db
        if not yaml_db.is_loading:
            for item in yaml_db.get_items():
                if item.get("AegisName") == equip:
                    item_id = item.get("Id")
                    if item_id and iteminfo_db.loaded:
                        equip_resource_name = iteminfo_db.get_resource_name(item_id)
                    break
    except Exception:
        pass

    if not equip_resource_name:
        equip_resource_name = equip

    # 3. Combine them and try to load the baked animation
    combined_name = f"{sprite_name}_{equip_resource_name}"
    anim_data = get_mob_animation_data(combined_name)

    # 4. Fallback if the equip resource name was incorrect but the AegisName works
    if not anim_data and equip_resource_name != equip:
        combined_name_fallback = f"{sprite_name}_{equip}"
        anim_data = get_mob_animation_data(combined_name_fallback)

    if not anim_data:
        raise HTTPException(status_code=404, detail="ERROR_EQUIP_SPRITE_NOT_FOUND")

    return JSONResponse(
        content=anim_data,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{mob}/animation")
async def get_pet_animation(mob: str):
    """Returns the canvas-ready animation JSON for a pet's base mob sprite.

    Resolves the pet AegisName to its GRF sprite name using the same
    ``get_sprite_name_for_mob`` pipeline as the mob animation route.

    Args:
        mob: Pet mob AegisName (e.g. ``PORING``, ``LUNATIC``).

    Returns:
        JSONResponse: Animation data object with 1-year immutable cache headers.
            Fields: ``spritesheet`` (base64 PNG data-URI), ``frame_duration`` (ms),
            ``frames`` (list of patch lists).

    Raises:
        HTTPException: 503 if the pet database is still loading;
            404 if no sprite data could be resolved for the given AegisName.
    """
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    from app.services.sprite_parser import get_sprite_name_for_mob, get_mob_animation_data

    sprite_name = get_sprite_name_for_mob(0, fallback_aegis=mob)
    if not sprite_name:
        raise HTTPException(status_code=404, detail="ERROR_SPRITE_NOT_FOUND")

    anim_data = get_mob_animation_data(sprite_name)
    if not anim_data:
        raise HTTPException(status_code=404, detail="ERROR_ANIMATION_NOT_FOUND")

    return JSONResponse(
        content=anim_data,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{mob}")
async def get_pet(mob: str):
    """Returns the full pet entry for a given mob AegisName or ID string.

    Args:
        mob: Pet mob AegisName or numeric ID as a string.

    Returns:
        dict: Complete pet object.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    pet = pet_db.get_pet(mob)
    if not pet:
        raise HTTPException(status_code=404, detail="ERROR_PET_NOT_FOUND")
    return pet


@router.put("/{mob}")
async def update_pet(mob: str, body: PetUpdate):
    """Updates an existing pet entry.

    Args:
        mob: Pet mob AegisName or numeric ID as a string.
        body: Updated pet data dict.

    Returns:
        dict: The updated pet object.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    result = pet_db.update_pet(mob, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="ERROR_PET_NOT_FOUND")
    return result


@router.post("/")
async def create_pet(body: PetCreate):
    """Creates a new pet entry in ``db/import/pet_db.yml``.

    Args:
        body: Full pet data dict.

    Returns:
        dict: The newly created pet object.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    result = pet_db.add_pet(body.data)
    return result
