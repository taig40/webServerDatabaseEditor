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
    """Returns the current background loading status for the achievement database.

    Returns:
        dict: Keys ``is_loading``, ``message``, ``achievements_loaded``,
            ``client_loaded``, and ``client_count``.
    """
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
    """Returns a paginated list of all achievements (server + client data merged).

    Args:
        skip: Number of entries to skip.
        limit: Maximum number of entries to return.

    Returns:
        dict: ``total``, ``skip``, ``limit``, and ``achievements`` list.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    
    ach_list = achievement_db.get_ach_list()
    return {
        "total": len(ach_list),
        "skip": skip,
        "limit": limit,
        "achievements": ach_list[skip : skip + limit],
    }


@router.get("/{ach_id}")
async def get_achievement(ach_id: int):
    """Returns the full achievement entry for a given achievement ID.

    Args:
        ach_id: Numeric rAthena achievement ID.

    Returns:
        dict: Merged server + client achievement object.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    ach_list = achievement_db.get_ach_list()
    found = next((x for x in ach_list if x["Id"] == ach_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="ERROR_ACHIEVEMENT_NOT_FOUND")
    return found


@router.put("/{ach_id}")
async def update_achievement(ach_id: int, body: AchievementSavePayload):
    """Updates an achievement's server YAML and/or client Lua data.

    Args:
        ach_id: Numeric rAthena achievement ID.
        body: Partial payload with ``server_data`` and/or ``client_data``.

    Returns:
        dict: The updated achievement object.

    Raises:
        HTTPException: 503 if loading; 500 on write error.
    """
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    
    try:
        res = achievement_db.update_achievement(ach_id, body.server_data, body.client_data)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{ach_id}")
async def create_achievement(ach_id: int, body: AchievementSavePayload):
    """Creates a new achievement entry with an explicit achievement ID.

    Args:
        ach_id: Desired numeric achievement ID.
        body: Payload with ``server_data`` and/or ``client_data``.

    Returns:
        dict: The newly created achievement object.

    Raises:
        HTTPException: 503 if loading; 400 if the ID already exists; 500 on write error.
    """
    if achievement_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    ach_list = achievement_db.get_ach_list()
    if any(x["Id"] == ach_id for x in ach_list):
        raise HTTPException(status_code=400, detail="ERROR_DUPLICATE_ID")

    try:
        res = achievement_db.add_achievement(ach_id, body.server_data, body.client_data)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
