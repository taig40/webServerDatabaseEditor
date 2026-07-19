"""combos.py — API endpoints for Item Combos (item_combos.yml)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.combo_parser import combo_db
from app.models.combo import ItemComboDBModel, ItemComboDBModelUpdate

router = APIRouter()


class ComboUpdate(BaseModel):
    data: ItemComboDBModelUpdate


class ComboCreate(BaseModel):
    data: ItemComboDBModel


@router.get("/status")
async def get_combo_status():
    """Returns the current background loading status for the combo database.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``combos_loaded``.
    """
    return {
        "is_loading": combo_db.is_loading,
        "message": combo_db.loading_status,
        "combos_loaded": combo_db.entries_loaded,
    }


@router.get("/")
async def get_combos(
    skip: int = Query(0),
    limit: int = Query(50000),
):
    """Returns a paginated list of all item combos.

    Args:
        skip: Number of entries to skip.
        limit: Maximum number of entries to return.

    Returns:
        dict: ``total``, ``skip``, ``limit``, and ``combos`` list.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="Combo DB ainda carregando.")
    combos = combo_db.get_combos()
    return {
        "total": len(combos),
        "skip": skip,
        "limit": limit,
        "combos": combos[skip : skip + limit],
    }


@router.put("/{index}")
async def update_combo(index: str, body: ComboUpdate):
    """Updates an existing item combo entry.

    Unknown keys from the frontend are discarded by ``exclude_none=True`` on the model.

    Args:
        index: String index key identifying the combo.
        body: Partial combo payload.

    Returns:
        dict: The updated combo object.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="Combo DB ainda carregando.")

    validated_data = body.data.model_dump(exclude_none=True)
    result = combo_db.update_combo(index, validated_data)
    if result is None:
        raise HTTPException(status_code=404, detail="Combo não encontrado.")
    return result


@router.post("/")
async def create_combo(body: ComboCreate):
    """Creates a new item combo entry in ``db/import/item_combos.yml``.

    Args:
        body: Full combo payload.

    Returns:
        dict: The newly created combo object.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="Combo DB ainda carregando.")

    validated_data = body.data.model_dump(exclude_none=True)
    result = combo_db.add_combo(validated_data)
    return result


@router.delete("/{index}", status_code=200)
async def delete_combo(index: str):
    """Permanently removes an item combo from ``db/import/item_combos.yml``.

    Args:
        index: String index key identifying the combo.

    Returns:
        dict: ``{"deleted": True, "index": index}`` on success.

    Raises:
        HTTPException: 503 if loading; 403 if the combo belongs to the official
            rAthena database; 404 if not found.
    """
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    try:
        deleted = combo_db.delete_combo(index)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Combo {index} não encontrado.")

    return {"deleted": True, "index": index}

