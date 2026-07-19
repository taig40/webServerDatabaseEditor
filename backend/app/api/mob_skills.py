"""mob_skills.py — API endpoints for Mob Skills (mob_skill_db.txt)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional, List
from app.services.mob_skill_parser import mob_skill_db

router = APIRouter()


class MobSkillUpdate(BaseModel):
    data: dict[str, Any]


class MobSkillCreate(BaseModel):
    data: dict[str, Any]


@router.get("/status")
async def get_mob_skill_status():
    """Returns the current background loading status for the mob skill database.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``skills_loaded``.
    """
    return {
        "is_loading": mob_skill_db.is_loading,
        "message": mob_skill_db.loading_status,
        "skills_loaded": mob_skill_db.entries_loaded,
    }


@router.get("/")
async def get_mob_skills(
    mob_id: Optional[int] = Query(None, description="Filter skills by mob ID"),
):
    """Returns mob skill entries, optionally filtered by mob ID.

    Args:
        mob_id: Optional numeric mob ID to filter by.  Returns all skills if omitted.

    Returns:
        dict: ``{"total": ..., "skills": [...]}``.`

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    if mob_id is not None:
        skills = mob_skill_db.get_by_mob(mob_id)
    else:
        skills = mob_skill_db.get_all()
    return {
        "total": len(skills),
        "skills": skills,
    }


@router.put("/{line_index}")
async def update_mob_skill(line_index: int, body: MobSkillUpdate):
    """Updates a mob skill entry identified by its line index.

    Args:
        line_index: 0-based line index of the skill entry in ``mob_skill_db.txt``.
        body: Updated skill data dict.

    Returns:
        dict: The updated skill entry.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    result = mob_skill_db.update_entry(line_index, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="ERROR_MOB_SKILL_NOT_FOUND")
    return result


@router.post("/")
async def create_mob_skill(body: MobSkillCreate):
    """Appends a new mob skill entry to the custom mob skill database.

    Args:
        body: Skill data dict.

    Returns:
        dict: The newly created skill entry.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    result = mob_skill_db.add_entry(body.data)
    return result


@router.delete("/{line_index}")
async def delete_mob_skill(
    line_index: int,
    source: str = Query("custom", description="Source of the entry: 'rathena' or 'custom'"),
):
    """Removes a mob skill entry by its line index.

    Args:
        line_index: 0-based line index of the entry to remove.
        source: Source file to target — ``"custom"`` or ``"rathena"``.

    Returns:
        dict: ``{"status": "ok", "deleted_index": line_index}``.

    Raises:
        HTTPException: 503 if loading; 404 if the entry is not found.
    """
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    success = mob_skill_db.delete_entry(line_index, source)
    if not success:
        raise HTTPException(status_code=404, detail="ERROR_NOT_FOUND")
    return {"status": "ok", "deleted_index": line_index}
