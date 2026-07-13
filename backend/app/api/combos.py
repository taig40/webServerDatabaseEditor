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
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="Combo DB ainda carregando.")
    
    # Validação estrita: descarta chaves inválidas vindas do front-end e ignora campos nulos
    validated_data = body.data.model_dump(exclude_none=True)
    
    result = combo_db.update_combo(index, validated_data)
    if result is None:
        raise HTTPException(status_code=404, detail="Combo não encontrado.")
    return result


@router.post("/")
async def create_combo(body: ComboCreate):
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="Combo DB ainda carregando.")
    
    # Validação estrita: descarta chaves inválidas e ignora campos nulos
    validated_data = body.data.model_dump(exclude_none=True)
    
    result = combo_db.add_combo(validated_data)
    return result
