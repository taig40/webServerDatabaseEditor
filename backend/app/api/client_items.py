from fastapi import APIRouter, HTTPException, UploadFile, File
from app.services.iteminfo_parser import iteminfo_db
from app.services.grf_reader import grf_reader

router = APIRouter()


def _require_loaded():
    if iteminfo_db.encoding_error:
        raise HTTPException(
            status_code=400,
            detail=iteminfo_db.encoding_error,
        )
    if not iteminfo_db.loaded:
        raise HTTPException(
            status_code=503,
            detail="ItemInfo.lua ainda não foi carregado. Aguarde e tente novamente.",
        )


# ─── GET /api/client_items/{item_id} ──────────────────────────────────────────

@router.get("/{item_id}")
async def get_client_item(item_id: int):
    """
    Returns the full ItemInfo.lua field dict for the given item ID along with asset statuses.
    """
    _require_loaded()
    entry = iteminfo_db.get_client_item(item_id)
    if entry is None:
        # Return an empty skeleton so the frontend can still render the form
        entry = {
            "item_id": item_id,
            "exists_in_lua": False,
            "identifiedDisplayName":      "",
            "identifiedResourceName":     "",
            "identifiedDescriptionName":  [],
            "unIdentifiedDisplayName":    "",
            "unIdentifiedResourceName":   "",
            "unIdentifiedDescriptionName": [],
            "slotCount": 0,
            "ClassNum":  0,
            "costume":   False,
        }
    else:
        entry = {"item_id": item_id, "exists_in_lua": True, **entry}

    # Verify assets status
    resource_name = entry.get("identifiedResourceName") or entry.get("unIdentifiedResourceName") or str(item_id)

    icon_exists = grf_reader.has_file(f"data/texture/유저인터페이스/item/{resource_name}.bmp") or grf_reader.has_file(f"data/texture/userinterface/item/{resource_name}.bmp")
    collection_exists = (
        grf_reader.has_file(f"data/texture/유저인터페이스/collection/{resource_name}.bmp") or
        grf_reader.has_file(f"data/texture/userinterface/collection/{resource_name}.bmp") or
        grf_reader.has_file(f"data/sprite/아이템/{resource_name}.bmp") or
        grf_reader.has_file(f"data/sprite/item/{resource_name}.bmp")
    )
    drop_spr_exists = (
        grf_reader.has_file(f"data/sprite/아이템/{resource_name}.spr") or
        grf_reader.has_file(f"data/sprite/item/{resource_name}.spr")
    )
    drop_act_exists = (
        grf_reader.has_file(f"data/sprite/아이템/{resource_name}.act") or
        grf_reader.has_file(f"data/sprite/item/{resource_name}.act")
    )

    entry["assets_status"] = {
        "icon_exists": icon_exists,
        "collection_exists": collection_exists,
        "drop_spr_exists": drop_spr_exists,
        "drop_act_exists": drop_act_exists,
    }

    return entry


# ─── PUT /api/client_items/{item_id} ──────────────────────────────────────────

@router.put("/{item_id}")
async def update_client_item(item_id: int, fields: dict):
    """
    Rewrites the [item_id] = { … } block in ItemInfo.lua with the supplied fields.
    Creates the block if it doesn't already exist.
    """
    _require_loaded()
    try:
        updated = iteminfo_db.update_client_item(item_id, fields)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"item_id": item_id, "exists_in_lua": True, **updated}


# ─── POST /api/client_items/{item_id}/icon ────────────────────────────────────

@router.post("/{item_id}/icon")
async def upload_item_icon(item_id: int, file: UploadFile = File(...)):
    """
    Receives a BMP file and saves it as the item's inventory icon inside the
    GRF override folder (or GRF_PATH when it's a directory).

    The resource name is read from ItemInfo.lua; falls back to the item ID as
    string if the item doesn't have a Lua entry yet.
    """
    _require_loaded()

    entry = iteminfo_db.get_client_item(item_id)
    resource_name = (
        entry.get("identifiedResourceName") or str(item_id)
        if entry else str(item_id)
    )

    bmp_bytes = await file.read()
    if not bmp_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    try:
        saved_path = grf_reader.save_item_icon(resource_name, bmp_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "item_id": item_id,
        "resource_name": resource_name,
        "saved_path": saved_path,
    }


# ─── POST /api/client_items/{item_id}/collection ──────────────────────────────

@router.post("/{item_id}/collection")
async def upload_item_collection(item_id: int, file: UploadFile = File(...)):
    """
    Receives a BMP file and saves it as the item's collection sprite inside the
    GRF override folder (or GRF_PATH when it's a directory).
    """
    _require_loaded()

    entry = iteminfo_db.get_client_item(item_id)
    resource_name = (
        entry.get("identifiedResourceName") or str(item_id)
        if entry else str(item_id)
    )

    bmp_bytes = await file.read()
    if not bmp_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    try:
        saved_path = grf_reader.save_item_collection(resource_name, bmp_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "item_id": item_id,
        "resource_name": resource_name,
        "saved_path": saved_path,
    }


# ─── POST /api/client_items/{item_id}/drop_spr ────────────────────────────────

@router.post("/{item_id}/drop_spr")
async def upload_item_drop_spr(item_id: int, file: UploadFile = File(...)):
    """
    Receives a .spr file and saves it as the item's ground/drop sprite inside the
    GRF override folder (or GRF_PATH when it's a directory).
    """
    _require_loaded()

    entry = iteminfo_db.get_client_item(item_id)
    resource_name = (
        entry.get("identifiedResourceName") or str(item_id)
        if entry else str(item_id)
    )

    spr_bytes = await file.read()
    if not spr_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    try:
        saved_path = grf_reader.save_item_drop_spr(resource_name, spr_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "item_id": item_id,
        "resource_name": resource_name,
        "saved_path": saved_path,
    }


# ─── POST /api/client_items/{item_id}/drop_act ────────────────────────────────

@router.post("/{item_id}/drop_act")
async def upload_item_drop_act(item_id: int, file: UploadFile = File(...)):
    """
    Receives a .act file and saves it as the item's ground/drop action file inside the
    GRF override folder (or GRF_PATH when it's a directory).
    """
    _require_loaded()

    entry = iteminfo_db.get_client_item(item_id)
    resource_name = (
        entry.get("identifiedResourceName") or str(item_id)
        if entry else str(item_id)
    )

    act_bytes = await file.read()
    if not act_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    try:
        saved_path = grf_reader.save_item_drop_act(resource_name, act_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "item_id": item_id,
        "resource_name": resource_name,
        "saved_path": saved_path,
    }
