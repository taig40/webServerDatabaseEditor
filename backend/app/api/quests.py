"""quests.py — API endpoints for Quest DB (quest_db.yml + questid2display.lua)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.quest_parser import quest_db

router = APIRouter()


class QuestSavePayload(BaseModel):
    server_data: Optional[dict[str, Any]] = None
    client_data: Optional[dict[str, Any]] = None


@router.get("/status")
async def get_quest_status():
    return {
        "is_loading": quest_db.is_loading,
        "message": quest_db.loading_status,
        "quests_loaded": quest_db.entries_loaded,
    }


@router.get("/")
async def get_quests(
    skip: int = Query(0),
    limit: int = Query(50000),
):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    quests = quest_db.get_quest_list()
    return {
        "total": len(quests),
        "skip": skip,
        "limit": limit,
        "quests": quests[skip : skip + limit],
    }


@router.get("/{quest_id}")
async def get_quest(quest_id: int):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    quest = quest_db.get_quest(quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="ERROR_QUEST_NOT_FOUND")
    return quest


@router.put("/{quest_id}")
async def update_quest(quest_id: int, body: QuestSavePayload):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    try:
        result = quest_db.update_quest(quest_id, body.server_data, body.client_data)
        if result is None:
            raise HTTPException(status_code=404, detail="ERROR_QUEST_NOT_FOUND")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{quest_id}")
async def create_quest_with_id(quest_id: int, body: QuestSavePayload):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    try:
        result = quest_db.add_quest(quest_id, body.server_data, body.client_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_quest_legacy(body: QuestSavePayload):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    
    # Try to extract ID from server_data or client_data
    quest_id = None
    if body.server_data and "Id" in body.server_data:
        quest_id = int(body.server_data["Id"])
    elif body.client_data and "Id" in body.client_data:
        quest_id = int(body.client_data["Id"])
        
    if not quest_id:
        raise HTTPException(status_code=400, detail="ERROR_ID_REQUIRED")
        
    try:
        result = quest_db.add_quest(quest_id, body.server_data, body.client_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
