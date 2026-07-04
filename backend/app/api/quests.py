"""quests.py — API endpoints for Quest DB (quest_db.yml)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.quest_parser import quest_db

router = APIRouter()


class QuestUpdate(BaseModel):
    data: dict[str, Any]


class QuestCreate(BaseModel):
    data: dict[str, Any]


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
        raise HTTPException(status_code=503, detail="Quest DB ainda carregando.")
    quests = quest_db.get_quests()
    return {
        "total": len(quests),
        "skip": skip,
        "limit": limit,
        "quests": quests[skip : skip + limit],
    }


@router.get("/{quest_id}")
async def get_quest(quest_id: int):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="Quest DB ainda carregando.")
    quest = quest_db.get_quest(quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="Quest não encontrada.")
    return quest


@router.put("/{quest_id}")
async def update_quest(quest_id: int, body: QuestUpdate):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="Quest DB ainda carregando.")
    result = quest_db.update_quest(quest_id, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="Quest não encontrada.")
    return result


@router.post("/")
async def create_quest(body: QuestCreate):
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="Quest DB ainda carregando.")
    result = quest_db.add_quest(body.data)
    return result
