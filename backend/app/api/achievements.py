"""
achievements.py — API endpoints for Achievement DB (YAML) and achievements.lub (Lua).
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.achievement_parser import achievement_db

router = APIRouter()


class AchievementSavePayload(BaseModel):
    server_data: Optional[dict[str, Any]] = None
    client_data: Optional[dict[str, Any]] = None


@router.get("/status")
async def get_achievement_status():
    return {
        "is_loading": achievement_db.is_loading,
        "message": achievement_db.loading_status,
        "achievements_loaded": achievement_db.entries_loaded,
        "client_loaded": achievement_db.client_loaded,
        "client_count": len(achievement_db.client_cache),
    }


@router.get("/")
async def get_achievements(
    skip: int = Query(0),
    limit: int = Query(2000),
):
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="Banco de dados de conquistas ainda carregando.")
    
    ach_list = achievement_db.get_ach_list()
    return {
        "total": len(ach_list),
        "skip": skip,
        "limit": limit,
        "achievements": ach_list[skip : skip + limit],
    }


@router.get("/{ach_id}")
async def get_achievement(ach_id: int):
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="Banco de dados de conquistas ainda carregando.")
    
    # Locate from merged list
    ach_list = achievement_db.get_ach_list()
    found = next((x for x in ach_list if x["Id"] == ach_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Conquista não encontrada.")
    return found


@router.put("/{ach_id}")
async def update_achievement(ach_id: int, body: AchievementSavePayload):
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="Banco de dados de conquistas ainda carregando.")
    
    try:
        res = achievement_db.update_achievement(ach_id, body.server_data, body.client_data)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{ach_id}")
async def create_achievement(ach_id: int, body: AchievementSavePayload):
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="Banco de dados de conquistas ainda carregando.")
    
    # Check duplicate
    ach_list = achievement_db.get_ach_list()
    if any(x["Id"] == ach_id for x in ach_list):
        raise HTTPException(status_code=400, detail=f"Conquista com ID {ach_id} já existe.")
        
    try:
        res = achievement_db.add_achievement(ach_id, body.server_data, body.client_data)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
