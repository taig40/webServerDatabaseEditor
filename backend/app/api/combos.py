"""combos.py — API endpoints for Item Combos (item_combos.yml)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.combo_parser import combo_db

router = APIRouter()


class ComboUpdate(BaseModel):
    data: dict[str, Any]


class ComboCreate(BaseModel):
    data: dict[str, Any]


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
    result = combo_db.update_combo(index, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="Combo não encontrado.")
    return result


@router.post("/")
async def create_combo(body: ComboCreate):
    if combo_db.is_loading:
        raise HTTPException(status_code=503, detail="Combo DB ainda carregando.")
    result = combo_db.add_combo(body.data)
    return result
