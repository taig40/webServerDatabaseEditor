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
    """Returns the current background loading status for the quest database.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``quests_loaded``.
    """
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
    """Returns a paginated list of all quests.

    Args:
        skip: Number of entries to skip.
        limit: Maximum number of entries to return.

    Returns:
        dict: ``total``, ``skip``, ``limit``, and ``quests`` list.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
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
    """Returns the full quest entry (server + client data) for a given quest ID.

    Args:
        quest_id: Numeric rAthena quest ID.

    Returns:
        dict: Combined server YAML and client Lua data for the quest.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    quest = quest_db.get_quest(quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="ERROR_QUEST_NOT_FOUND")
    return quest


@router.put("/{quest_id}")
async def update_quest(quest_id: int, body: QuestSavePayload):
    """Updates a quest's server YAML and/or client Lua data.

    Args:
        quest_id: Numeric rAthena quest ID.
        body: Partial payload with ``server_data`` and/or ``client_data``.

    Returns:
        dict: The updated quest object.

    Raises:
        HTTPException: 503 if loading; 404 if not found; 500 on write error.
    """
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
    """Creates a new quest entry with an explicit quest ID.

    Args:
        quest_id: Desired numeric quest ID.
        body: Payload with ``server_data`` and/or ``client_data``.

    Returns:
        dict: The newly created quest object.

    Raises:
        HTTPException: 503 if loading; 500 on write error.
    """
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    try:
        result = quest_db.add_quest(quest_id, body.server_data, body.client_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_quest_legacy(body: QuestSavePayload):
    """Creates a new quest, extracting the ID from the payload body.

    Looks for ``Id`` in ``server_data`` first, then in ``client_data``.
    This route exists for backwards compatibility with older frontend versions.

    Args:
        body: Payload with ``server_data`` and/or ``client_data``. One must include ``Id``.

    Returns:
        dict: The newly created quest object.

    Raises:
        HTTPException: 503 if loading; 400 if ``Id`` is not found in either data block;
            500 on write error.
    """
    if quest_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

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
